"""Runtime opt-in, identity binding, and deadline guards without network calls."""
import json
import httpx
import pytest
from workbench.config import AgentSettings, ConfigurationError
from workbench.agent_runtime import coordinator
from workbench.model_provider import ProviderError


def configured(**updates):
    values = dict(_env_file=None, agents_enabled=True, coordinator_model='model',
        specialist_model='model', ANTHROPIC_API_KEY='runtime-test-key',
        agent_model_bounds=json.dumps({'model': dict(model='model', revision='reviewed-1',
            source_reference='operator-reviewed-bound', max_request_bytes=64000,
            input_tokens=200000, max_output_tokens=2048, max_active_seconds=110)}))
    return AgentSettings(**{**values, **updates})


def test_runtime_requires_reviewed_bounds_and_lease_headroom():
    configured().require_runtime()
    for updates in [dict(agent_model_bounds='{}'), dict(agent_model_bounds='[]'),
                    dict(agent_lease_seconds=120), dict(provider_timeout_seconds=30),
                    dict(agent_max_output_tokens=4096), dict(agent_model_prices='{"bad": {}}')]:
        with pytest.raises(ConfigurationError):
            configured(**updates).require_runtime()


def test_http_admission_uses_runtime_configuration_without_provider_io(monkeypatch):
    from workbench.agent_runtime import admission
    from workbench.errors import DomainError
    values = configured()
    for name in ('agents_enabled', 'coordinator_model', 'specialist_model', 'agent_model_bounds'):
        monkeypatch.setenv('WB_' + name.upper(), str(getattr(values, name)))
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'runtime-test-key')
    admission()
    monkeypatch.setenv('WB_AGENTS_ENABLED', '0')
    with pytest.raises(DomainError) as error:
        admission()
    assert error.value.error_code == 'AGENT_UNAVAILABLE'


def test_runtime_verifies_model_identity_before_generation():
    calls = []
    def request(req):
        calls.append(req.method)
        return httpx.Response(200, json={'type': 'model', 'id': 'different-model'})
    with pytest.raises(ProviderError, match='resolved_model_ids'):
        coordinator(None, None, None, configured(), transport=httpx.MockTransport(request))
    assert calls == ['GET']


def test_runtime_constructs_coordinator_with_verified_bounds():
    transport = httpx.MockTransport(lambda req: httpx.Response(200, json={'type': 'model', 'id': 'model'}))
    step = coordinator(None, None, None, configured(), transport=transport)
    try:
        assert step.provider.resolved_model('model') == 'model'
        assert step.bounds['model'].revision == 'reviewed-1'
    finally:
        step.provider.close()

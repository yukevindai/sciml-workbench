import json

import httpx
import pytest
from pydantic import Field

from workbench.agent_policy import AuthorityPolicy
from workbench.config import AgentSettings
from workbench.contract_core import ContractModel
from workbench.model_provider import AnthropicProvider, ContextPart, ProviderError, ToolDefinition

KEY = "secret-canary-provider-key"


class AuditInput(ContractModel):
    material_id: str = Field(min_length=1)


def response():
    return dict(type="message", role="assistant", model="model-1", stop_reason="tool_use",
        content=[dict(type="tool_use", id="call-1", name="run_audit", input={"material_id": "m"})],
        usage={"input_tokens": 15, "output_tokens": 20, "cache_read_input_tokens": 0})


def setup_provider(handler=None):
    seen = []
    def handle(request):
        seen.append(request)
        if request.method == "GET":
            return httpx.Response(200, json={"type": "model", "id": "model-1"})
        return handler(request) if handler else httpx.Response(200, json=response())
    settings = AgentSettings(_env_file=None, coordinator_model="model-1", specialist_model="model-1", ANTHROPIC_API_KEY=KEY)
    provider = AnthropicProvider(settings, transport=httpx.MockTransport(handle))
    provider.verify_models()
    return provider, seen


def arguments(**updates):
    data = dict(model="model-1", policy=AuthorityPolicy(policy_id="p", revision=1,
        project_ids={"p"}, provider_models={"model-1"}), context=[ContextPart("p", "schema", "column names")],
        tools=[ToolDefinition("run_audit", "Audit a material", AuditInput)], max_tokens=100)
    data.update(updates)
    return data


def test_structured_calls_usage_and_metadata():
    provider, seen = setup_provider()
    try:
        result = provider.complete(**arguments())
        assert result.tool_calls[0]["input"] == {"material_id": "m"}
        assert result.usage["output_tokens"] == 20
        assert result.cost_status == "unknown"
        assert result.api_version == "2023-06-01"
        assert len(seen) == 2
        assert KEY not in repr(result)
        assert json.loads(seen[-1].content)["tools"][0]["input_schema"]["additionalProperties"] is False
    finally:
        provider.close()


@pytest.mark.parametrize("mutation", [
    lambda r: r.update(usage={}), lambda r: r.update(content=[{"type": "server_tool_use"}]),
    lambda r: r["content"][0].update(name="shell"),
    lambda r: r["content"][0].update(input={"material_id": "m", "command": "bad"}),
    lambda r: r.update(stop_reason="end_turn"), lambda r: r.update(model="other"),
    lambda r: r["usage"].update(input_tokens=True), lambda r: r.update(content=None),
    lambda r: r["usage"].update(unrecognized_billed_tokens=100),
])
def test_malformed_responses_fail_closed(mutation):
    value = response()
    mutation(value)
    provider, _ = setup_provider(lambda _: httpx.Response(200, json=value))
    try:
        with pytest.raises(ProviderError, match="malformed_response") as error:
            provider.complete(**arguments())
        assert error.value.usage_unknown
    finally:
        provider.close()


@pytest.mark.parametrize("status,code,retry", [(401, "authentication_failed", False), (429, "rate_limited", True), (503, "provider_unavailable", True), (302, "request_rejected", False)])
def test_outages_are_safe_and_not_retried(status, code, retry):
    provider, seen = setup_provider(lambda _: httpx.Response(status, text=KEY))
    try:
        with pytest.raises(ProviderError) as error:
            provider.complete(**arguments())
        assert error.value.code == code and error.value.retryable == retry
        assert KEY not in str(error.value) and len(seen) == 2
    finally:
        provider.close()


@pytest.mark.parametrize("part", [ContextPart("other", "schema", "x"), ContextPart("p", "raw", "row"), ContextPart("p", "schema", KEY)])
def test_scope_exposure_and_secrets_block_before_network(part):
    provider, seen = setup_provider()
    try:
        with pytest.raises(ProviderError):
            provider.complete(**arguments(context=[part]))
        assert len(seen) == 1
    finally:
        provider.close()


@pytest.mark.parametrize("body,code", [(KEY, "secret_in_response"), ("x" * 270000, "response_too_large"), ("not json", "malformed_response")], ids=["secret", "oversized", "invalid-json"])
def test_response_bounds_and_redaction(body, code):
    provider, _ = setup_provider(lambda _: httpx.Response(200, text=body))
    try:
        with pytest.raises(ProviderError, match=code):
            provider.complete(**arguments())
    finally:
        provider.close()


def test_escaped_secret_is_not_exported():
    value = response()
    value.update(stop_reason="end_turn", content=[{"type": "text", "text": KEY}])
    body = json.dumps(value).replace(KEY, "".join("\\u%04x" % ord(c) for c in KEY))
    provider, _ = setup_provider(lambda _: httpx.Response(200, text=body))
    try:
        with pytest.raises(ProviderError, match="secret_in_response"):
            provider.complete(**arguments())
    finally:
        provider.close()


@pytest.mark.parametrize("update,code", [({"max_tokens": 0}, "budget_exhausted"),
    ({"max_tokens": 40000}, "budget_exhausted"), ({"model": "other"}, "model_not_verified_or_allowed"),
    ({"context": [ContextPart("p", "schema", "x" * 65000)]}, "context_too_large")],
    ids=["zero-budget", "excess-budget", "model-denied", "context-limit"])
def test_preflight_rejections_do_not_generate(update, code):
    provider, seen = setup_provider()
    try:
        with pytest.raises(ProviderError, match=code):
            provider.complete(**arguments(**update))
        assert len(seen) == 1
    finally:
        provider.close()


def test_timeout_has_unknown_usage_without_retry():
    def timeout(request):
        raise httpx.ReadTimeout(KEY, request=request)
    provider, seen = setup_provider(timeout)
    try:
        with pytest.raises(ProviderError) as error:
            provider.complete(**arguments())
        assert error.value.usage_unknown and error.value.retryable
        assert KEY not in str(error.value) and len(seen) == 2
    finally:
        provider.close()

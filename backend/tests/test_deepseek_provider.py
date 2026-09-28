import json

import httpx
import pytest
from pydantic import Field

from workbench.agent_policy import AuthorityPolicy
from workbench.config import AgentSettings, ConfigurationError
from workbench.contract_core import ContractModel
from workbench.deepseek_provider import DeepSeekProvider
from workbench.model_provider import ContextPart, ProviderError, ToolDefinition, create_provider

KEY = "secret-canary-deepseek-key"


class AuditInput(ContractModel):
    material_id: str = Field(min_length=1)


def response(**message):
    body = dict(role="assistant", content=None, tool_calls=[dict(id="call-1", type="function",
        function=dict(name="run_audit", arguments=json.dumps({"material_id": "m"})))])
    body.update(message)
    return dict(id="r1", object="chat.completion", created=1, model="deepseek-chat",
        choices=[dict(index=0, message=body, finish_reason="tool_calls")],
        usage=dict(prompt_tokens=15, completion_tokens=20, total_tokens=35,
                   prompt_cache_hit_tokens=5, prompt_cache_miss_tokens=10))


def settings(**updates):
    values = dict(_env_file=None, model_provider="deepseek", coordinator_model="deepseek-chat",
                  specialist_model="deepseek-chat", DEEPSEEK_API_KEY=KEY)
    values.update(updates)
    return AgentSettings(**values)


def setup_provider(handler=None, models=("deepseek-chat", "deepseek-reasoner")):
    seen = []
    def handle(request):
        seen.append(request)
        if request.method == "GET":
            return httpx.Response(200, json={"object": "list", "data": [
                {"id": m, "object": "model", "owned_by": "deepseek"} for m in models]})
        return handler(request) if handler else httpx.Response(200, json=response())
    provider = DeepSeekProvider(settings(), transport=httpx.MockTransport(handle))
    provider.verify_models()
    return provider, seen


def arguments(**updates):
    data = dict(model="deepseek-chat", policy=AuthorityPolicy(policy_id="p", revision=1,
        project_ids={"p"}, provider_models={"deepseek-chat"}), context=[ContextPart("p", "schema", "column names")],
        tools=[ToolDefinition("run_audit", "Audit a material", AuditInput)], max_tokens=100)
    data.update(updates)
    return data


def test_factory_selects_configured_provider():
    provider = create_provider(settings(), transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    try:
        assert isinstance(provider, DeepSeekProvider) and provider.name == "deepseek"
    finally:
        provider.close()


def test_configuration_requires_deepseek_key():
    with pytest.raises(ConfigurationError, match="DEEPSEEK_API_KEY"):
        settings(DEEPSEEK_API_KEY="").validate_provider()
    with pytest.raises(ConfigurationError, match="WB_MODEL_PROVIDER"):
        settings(model_provider="other").validate_provider()


def test_tool_call_usage_and_wire_format():
    provider, seen = setup_provider()
    try:
        result = provider.complete(**arguments())
        assert result.stop_reason == "tool_use"
        assert result.tool_calls[0] == {"id": "call-1", "name": "run_audit", "input": {"material_id": "m"}}
        assert result.usage == {"input_tokens": 10, "output_tokens": 20, "cache_read_input_tokens": 5}
        assert KEY not in repr(result)
        sent = seen[-1]
        assert sent.url.path == "/chat/completions"
        assert sent.headers["authorization"] == "Bearer " + KEY
        body = json.loads(sent.content)
        assert [m["role"] for m in body["messages"]] == ["system", "user"]
        assert body["tools"][0]["type"] == "function"
        assert body["tools"][0]["function"]["parameters"]["additionalProperties"] is False
    finally:
        provider.close()


def test_text_decision_unwraps_single_code_fence():
    provider, _ = setup_provider(lambda _: httpx.Response(200, json={**response(content='```json\n{"kind": "plan"}\n```', tool_calls=None),
        "choices": [dict(index=0, finish_reason="stop", message=dict(role="assistant", content='```json\n{"kind": "plan"}\n```'))]}))
    try:
        result = provider.complete(**arguments())
        assert result.stop_reason == "end_turn" and result.text == ('{"kind": "plan"}',) and not result.tool_calls
    finally:
        provider.close()


def test_missing_model_is_refused():
    with pytest.raises(ProviderError, match="model_not_available"):
        setup_provider(models=("deepseek-reasoner",))


@pytest.mark.parametrize("mutation", [
    lambda r: r.update(usage={}),
    lambda r: r["choices"][0]["message"]["tool_calls"][0]["function"].update(name="shell"),
    lambda r: r["choices"][0]["message"]["tool_calls"][0]["function"].update(arguments='{"material_id": "m", "x": 1}'),
    lambda r: r["choices"][0]["message"]["tool_calls"][0]["function"].update(arguments='not json'),
    lambda r: r["choices"][0].update(finish_reason="unknown"),
    lambda r: r.update(choices=[]),
    lambda r: r["usage"].update(completion_tokens=101),
    lambda r: r["choices"][0]["message"].update(tool_calls=[]),
    # Output from any model other than the verified one is refused, never relabelled.
    lambda r: r.update(model="deepseek-reasoner"),
])
def test_malformed_responses_fail_closed(mutation):
    body = response()
    mutation(body)
    provider, _ = setup_provider(lambda _: httpx.Response(200, json=body))
    try:
        with pytest.raises(ProviderError) as error:
            provider.complete(**arguments())
        assert error.value.code == "malformed_response" and error.value.usage_unknown
    finally:
        provider.close()


def test_busy_provider_is_retryable():
    body = response()
    body["choices"][0]["finish_reason"] = "insufficient_system_resource"
    provider, _ = setup_provider(lambda _: httpx.Response(200, json=body))
    try:
        with pytest.raises(ProviderError) as error:
            provider.complete(**arguments())
        assert error.value.code == "provider_unavailable" and error.value.retryable
    finally:
        provider.close()


def test_key_never_sent_in_context():
    provider, _ = setup_provider()
    try:
        with pytest.raises(ProviderError, match="secret_in_context"):
            provider.complete(**arguments(context=[ContextPart("p", "schema", "leak " + KEY)]))
    finally:
        provider.close()

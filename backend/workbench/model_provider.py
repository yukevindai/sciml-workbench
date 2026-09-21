"""Bounded Anthropic Messages adapter using the already pinned httpx transport.

No retries, tool execution, logging, telemetry, or raw response persistence here.
E05 owns reservations/retries. E14 checks every serialized request and response.
"""
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx
from pydantic import BaseModel

from .agent_policy import AuthorityPolicy
from .config import AgentSettings, ConfigurationError
from .contract_core import finite_json
from .egress import SecretGuard, EgressDenied, check_context, context_records, SYSTEM_BOUNDARY

API_VERSION = "2023-06-01"
ADAPTER_VERSION = "anthropic-messages/1.0"
MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$")


class ProviderError(RuntimeError):
    def __init__(self, code: str, *, retryable: bool = False, usage_unknown: bool = False):
        self.code, self.retryable, self.usage_unknown = code, retryable, usage_unknown
        super().__init__(code)


@dataclass(frozen=True)
class ContextPart:
    # Classification and project identity come from trusted services, never the model.
    project_id: str
    content_class: str
    text: str = field(repr=False)
    artifact_ids: tuple[str, ...] = ()
    material_ids: tuple[str, ...] = ()
    source_classes: tuple[str, ...] = ()

    @classmethod
    def derived(cls, text: str, sources: list['ContextPart']):
        """Trusted handoff/summary builder: never downgrade source exposure."""
        if not sources or len({p.project_id for p in sources}) != 1:
            raise ProviderError('data_exposure_denied')
        rank = {'schema': 0, 'aggregates': 1, 'operator': 2, 'excerpt': 3, 'raw': 4}
        if any(p.content_class not in rank for p in sources):
            raise ProviderError('data_exposure_denied')
        return cls(sources[0].project_id, max(sources, key=lambda p: rank[p.content_class]).content_class,
                   text, tuple(sorted({a for p in sources for a in p.artifact_ids})),
                   tuple(sorted({m for p in sources for m in p.material_ids})),
                   tuple(sorted({c for p in sources for c in (p.content_class, *p.source_classes)})))


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str = field(repr=False)
    input_model: type[BaseModel]


@dataclass(frozen=True)
class ModelResult:
    model: str
    stop_reason: str
    text: tuple[str, ...] = field(repr=False)
    tool_calls: tuple[dict, ...] = field(repr=False)
    usage: dict[str, int]
    adapter_version: str = ADAPTER_VERSION
    api_version: str = API_VERSION
    cost_status: str = "unknown"


class ModelProvider(Protocol):
    def resolved_model(self, model: str) -> str | None: ...
    def complete(self, *, model: str, policy: AuthorityPolicy, context: list[ContextPart],
                 tools: list[ToolDefinition], max_tokens: int) -> ModelResult: ...


class AnthropicProvider:
    def __init__(self, settings: AgentSettings, *, transport: httpx.BaseTransport | None = None, backend_settings=None):
        settings.validate_provider()
        self.guard = SecretGuard(settings, backend_settings)
        self._key = settings.anthropic_api_key
        self._models = frozenset({settings.coordinator_model, settings.specialist_model})
        self._verified: dict[str, str] = {}
        self._response_bytes = settings.provider_max_response_bytes
        self._timeout_seconds = settings.provider_timeout_seconds
        self._client = httpx.Client(base_url="https://api.anthropic.com", transport=transport,
            timeout=settings.provider_timeout_seconds, follow_redirects=False, trust_env=False)

    def close(self):
        self._client.close()

    def resolved_model(self, model: str) -> str | None:
        return self._verified.get(model)

    def _request(self, method: str, path: str, payload: dict | None = None) -> Any:
        sent = method == "POST"
        deadline = time.monotonic() + self._timeout_seconds
        try:
            with self._client.stream(method, path, json=payload, headers={
                "x-api-key": self._key.get_secret_value(), "anthropic-version": API_VERSION,
                "content-type": "application/json", "accept-encoding": "identity",
            }) as response:
                if response.status_code != 200:
                    code = ("authentication_failed" if response.status_code in {401, 403} else
                            "rate_limited" if response.status_code == 429 else
                            "provider_unavailable" if response.status_code >= 500 else "request_rejected")
                    raise ProviderError(code, retryable=response.status_code == 429 or response.status_code >= 500,
                                        usage_unknown=sent)
                if response.headers.get('content-encoding', 'identity') != 'identity':
                    raise ProviderError('unsupported_response_encoding', usage_unknown=sent)
                body = bytearray()
                # Do not buffer to a fixed chunk size: slow trickles must reach
                # the elapsed-time check instead of resetting socket timeouts.
                for chunk in response.iter_bytes():
                    if time.monotonic() > deadline:
                        raise ProviderError('provider_deadline_exceeded', usage_unknown=sent)
                    body.extend(chunk)
                    if len(body) > self._response_bytes:
                        raise ProviderError("response_too_large", usage_unknown=sent)
                if time.monotonic() > deadline:
                    raise ProviderError('provider_deadline_exceeded', usage_unknown=sent)
                try:
                    self.guard.check(body.decode('utf-8'), 'secret_in_response')
                    result = json.loads(body)
                    finite_json(result)
                    self.guard.check(result, 'secret_in_response')
                except EgressDenied as exc:
                    raise ProviderError(exc.code, usage_unknown=sent) from None
                return result
        except ProviderError:
            raise
        except httpx.HTTPError:
            raise ProviderError("provider_unavailable", retryable=True, usage_unknown=sent) from None
        except (ValueError, RecursionError):
            raise ProviderError("malformed_response", usage_unknown=sent) from None

    def verify_models(self) -> dict[str, str]:
        """Non-generating account check; aliases resolve to recorded concrete IDs."""
        self._verified = {}
        verified = {}
        for model in sorted(self._models):
            value = self._request("GET", "/v1/models/" + model)
            if not isinstance(value, dict) or value.get("type") != "model" or not isinstance(value.get("id"), str) or not MODEL_ID.fullmatch(value["id"]):
                raise ProviderError("malformed_model_metadata")
            verified[model] = value["id"]
        self._verified = verified
        return dict(verified)

    def prepare_request(self, *, model: str, policy: AuthorityPolicy, context: list[ContextPart],
                 tools: list[ToolDefinition], max_tokens: int) -> dict:
        if model not in self._verified or model not in policy.provider_models:
            raise ProviderError("model_not_verified_or_allowed")
        if type(max_tokens) is not int or not 0 < max_tokens <= policy.limits.model_tokens or policy.limits.model_requests == 0:
            raise ProviderError("budget_exhausted")
        if len({t.name for t in tools}) != len(tools) or any(t.name not in policy.allowed_tools for t in tools):
            raise ProviderError("tool_not_allowed")
        try:
            check_context(policy, context)
        except EgressDenied as exc:
            raise ProviderError(exc.code) from None
        payload = {"model": self._verified[model], "max_tokens": max_tokens,
            "system": SYSTEM_BOUNDARY,
            "messages": [{"role": "user", "content": context_records(context)}]}
        if tools:
            payload["tools"] = [{"name": t.name, "description": t.description,
                                  "input_schema": t.input_model.model_json_schema()} for t in tools]
        encoded = json.dumps(payload, allow_nan=False, ensure_ascii=False).encode()
        if len(encoded) > policy.max_context_bytes:
            raise ProviderError("context_too_large")
        try:
            self.guard.check([p.text for p in context])
            self.guard.check(payload)
        except EgressDenied as exc:
            raise ProviderError(exc.code) from None
        return payload

    def complete(self, *, model: str, policy: AuthorityPolicy, context: list[ContextPart],
                 tools: list[ToolDefinition], max_tokens: int) -> ModelResult:
        payload = self.prepare_request(model=model, policy=policy, context=context, tools=tools, max_tokens=max_tokens)
        value = self._request("POST", "/v1/messages", payload)
        try:
            return self._parse(value, tools, self._verified[model], max_tokens)
        except (ValueError, KeyError, TypeError, AttributeError, RecursionError):
            raise ProviderError("malformed_response", usage_unknown=True) from None

    @staticmethod
    def _parse(value, tools, model, max_tokens):
        if value["type"] != "message" or value["role"] != "assistant" or value["model"] != model:
            raise ValueError()
        stop = value["stop_reason"]
        if stop not in {"end_turn", "tool_use", "max_tokens", "stop_sequence", "refusal"}:
            raise ValueError()
        usage = value["usage"]
        categories = ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
        if not isinstance(usage, dict) or set(usage) - set(categories):
            # New billing categories require an explicit accounting integration.
            raise ValueError()
        counts = {k: usage[k] for k in categories if k in usage}
        if not {"input_tokens", "output_tokens"} <= counts.keys() or any(type(n) is not int or n < 0 for n in counts.values()) or counts["output_tokens"] > max_tokens:
            raise ValueError()
        definitions = {t.name: t for t in tools}
        texts, calls, ids = [], [], set()
        if not isinstance(value["content"], list) or len(value["content"]) > 64:
            raise ValueError()
        for block in value["content"]:
            if block["type"] == "text" and isinstance(block["text"], str):
                texts.append(block["text"])
            elif block["type"] == "tool_use":
                name, identity = block["name"], block["id"]
                if name not in definitions or not isinstance(identity, str) or not 0 < len(identity) <= 160 or identity in ids:
                    raise ValueError()
                args = definitions[name].input_model.model_validate(block["input"], strict=True)
                calls.append({"id": identity, "name": name, "input": args.model_dump(mode="json")})
                ids.add(identity)
            else:
                raise ValueError()
        if bool(calls) != (stop == "tool_use"):
            raise ValueError()
        return ModelResult(model=model, stop_reason=stop, text=tuple(texts), tool_calls=tuple(calls), usage=counts)


def main():
    """Operator preflight; optional paid smoke check uses synthetic context only."""
    import argparse
    from .config import load_settings
    from .contract_core import ContractModel

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--smoke", action="store_true", help="Make one bounded paid tool-call check per configured model")
    args = parser.parse_args()
    provider = None
    try:
        provider = AnthropicProvider(load_settings(AgentSettings))
        models = provider.verify_models()
        print(json.dumps({"adapter": ADAPTER_VERSION, "api_version": API_VERSION, "models": models}))
        if args.smoke:
            class InspectInput(ContractModel):
                project_id: str

            policy = AuthorityPolicy(policy_id="provider-smoke", revision=1, project_ids={"synthetic"},
                                     provider_models=frozenset(models), allowed_tools={"inspect_project"})
            for model in sorted(models):
                result = provider.complete(model=model, policy=policy, max_tokens=256,
                    context=[ContextPart("synthetic", "schema", 'Call inspect_project with project_id "synthetic" now. This is a synthetic integration check.')],
                    tools=[ToolDefinition("inspect_project", "Inspect the named synthetic project", InspectInput)])
                if len(result.tool_calls) != 1 or result.tool_calls[0]["input"] != {"project_id": "synthetic"}:
                    raise ProviderError("tool_support_not_verified")
                print(json.dumps({"model": result.model, "structured_tools": "passed", "usage": result.usage,
                                  "cost_status": result.cost_status}))
        return 0
    except (ConfigurationError, ProviderError) as exc:
        print(str(exc))
        return 2
    finally:
        if provider is not None:
            provider.close()


if __name__ == "__main__":
    raise SystemExit(main())

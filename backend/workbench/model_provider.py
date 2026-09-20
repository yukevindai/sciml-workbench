"""Bounded Anthropic Messages adapter using the already pinned httpx transport.

No retries, tool execution, logging, telemetry, or raw response persistence here.
E05 owns reservations/retries. E14 must supply classified, filtered context.
"""
import json
import re
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx
from pydantic import BaseModel

from .agent_policy import AuthorityPolicy
from .config import AgentSettings, ConfigurationError
from .contract_core import finite_json

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


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
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
    def __init__(self, settings: AgentSettings, *, transport: httpx.BaseTransport | None = None):
        settings.validate_provider()
        self._key = settings.anthropic_api_key
        self._models = frozenset({settings.coordinator_model, settings.specialist_model})
        self._verified: dict[str, str] = {}
        self._response_bytes = settings.provider_max_response_bytes
        self._client = httpx.Client(base_url="https://api.anthropic.com", transport=transport,
            timeout=settings.provider_timeout_seconds, follow_redirects=False, trust_env=False)

    def close(self):
        self._client.close()

    def resolved_model(self, model: str) -> str | None:
        return self._verified.get(model)

    def _request(self, method: str, path: str, payload: dict | None = None) -> Any:
        sent = method == "POST"
        try:
            with self._client.stream(method, path, json=payload, headers={
                "x-api-key": self._key.get_secret_value(), "anthropic-version": API_VERSION,
                "content-type": "application/json",
            }) as response:
                if response.status_code != 200:
                    code = ("authentication_failed" if response.status_code in {401, 403} else
                            "rate_limited" if response.status_code == 429 else
                            "provider_unavailable" if response.status_code >= 500 else "request_rejected")
                    raise ProviderError(code, retryable=response.status_code == 429 or response.status_code >= 500,
                                        usage_unknown=sent)
                body = bytearray()
                for chunk in response.iter_bytes(chunk_size=8192):
                    body.extend(chunk)
                    if len(body) > self._response_bytes:
                        raise ProviderError("response_too_large", usage_unknown=sent)
                # Reject echoed credentials before parsing or exporting provider-controlled fields.
                if self._key.get_secret_value().encode() in body:
                    raise ProviderError("secret_in_response", usage_unknown=sent)
                result = json.loads(body)
                finite_json(result)
                if self._key.get_secret_value() in json.dumps(result, ensure_ascii=False):
                    raise ProviderError("secret_in_response", usage_unknown=sent)
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

    def complete(self, *, model: str, policy: AuthorityPolicy, context: list[ContextPart],
                 tools: list[ToolDefinition], max_tokens: int) -> ModelResult:
        if model not in self._verified or model not in policy.provider_models:
            raise ProviderError("model_not_verified_or_allowed")
        if type(max_tokens) is not int or not 0 < max_tokens <= policy.limits.model_tokens or policy.limits.model_requests == 0:
            raise ProviderError("budget_exhausted")
        if len({t.name for t in tools}) != len(tools) or any(t.name not in policy.allowed_tools for t in tools):
            raise ProviderError("tool_not_allowed")
        if not context or any(p.project_id not in policy.project_ids or p.content_class not in policy.content_classes for p in context):
            raise ProviderError("data_exposure_denied")
        exposure_classes = {"schema", "aggregates"}
        if policy.exposure in {"selected_excerpts", "raw_project_content"}:
            exposure_classes.add("excerpt")
        if policy.exposure == "raw_project_content":
            exposure_classes.add("raw")
        if any(p.content_class not in exposure_classes for p in context):
            raise ProviderError("data_exposure_denied")
        payload = {"model": self._verified[model], "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": "\n".join(p.text for p in context)}]}
        if tools:
            payload["tools"] = [{"name": t.name, "description": t.description,
                                  "input_schema": t.input_model.model_json_schema()} for t in tools]
        encoded = json.dumps(payload, allow_nan=False, ensure_ascii=False).encode()
        if len(encoded) > policy.max_context_bytes:
            raise ProviderError("context_too_large")
        if self._key.get_secret_value() in "\n".join(p.text for p in context) or self._key.get_secret_value().encode() in encoded:
            raise ProviderError("secret_in_context")
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

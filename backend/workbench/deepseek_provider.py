"""Bounded DeepSeek chat-completions adapter (OpenAI-compatible wire format).

Shares the Anthropic adapter's transport discipline: no retries, no redirects,
no proxy environment, a streaming byte cap and a wall-clock deadline. The
coordinator sees the same ModelResult shape, so stop reasons and billed token
categories are mapped onto the existing accounting vocabulary here.
"""
import json
import re

import httpx

from .config import AgentSettings
from .model_provider import MODEL_ID, AnthropicProvider, ModelResult, ProviderError

BASE_URL = "https://api.deepseek.com"
API_VERSION = "chat-completions/v1"
ADAPTER_VERSION = "deepseek-chat-completions/1.0"
_STOP = {"stop": "end_turn", "tool_calls": "tool_use", "length": "max_tokens", "content_filter": "refusal"}
_FENCE = re.compile(r"^\s*```(?:json)?\s*\n(.*?)\n?```\s*$", re.DOTALL)


class DeepSeekProvider(AnthropicProvider):
    name = "deepseek"
    adapter_version = ADAPTER_VERSION
    api_version = API_VERSION

    def __init__(self, settings: AgentSettings, *, transport: httpx.BaseTransport | None = None, backend_settings=None):
        super().__init__(settings, transport=transport, backend_settings=backend_settings)
        self._key = settings.deepseek_api_key
        self._client.close()
        self._client = httpx.Client(base_url=BASE_URL, transport=transport,
            timeout=settings.provider_timeout_seconds, follow_redirects=False, trust_env=False)

    def _headers(self) -> dict[str, str]:
        return {"authorization": "Bearer " + self._key.get_secret_value(),
                "content-type": "application/json", "accept-encoding": "identity"}

    def verify_models(self) -> dict[str, str]:
        """Non-generating account check against the listed model IDs."""
        self._verified = {}
        listing = self._request("GET", "/models")
        if not isinstance(listing, dict) or not isinstance(listing.get("data"), list):
            raise ProviderError("malformed_model_metadata")
        available = set()
        for entry in listing["data"][:500]:
            if not isinstance(entry, dict) or not isinstance(entry.get("id"), str) or not MODEL_ID.fullmatch(entry["id"]):
                raise ProviderError("malformed_model_metadata")
            available.add(entry["id"])
        if not self._models <= available:
            raise ProviderError("model_not_available")
        self._verified = {model: model for model in sorted(self._models)}
        return dict(self._verified)

    def prepare_request(self, **kwargs) -> dict:
        anthropic = super().prepare_request(**kwargs)
        payload = {"model": anthropic["model"], "max_tokens": anthropic["max_tokens"], "stream": False,
                   "messages": [{"role": "system", "content": anthropic["system"]},
                                {"role": "user", "content": anthropic["messages"][0]["content"]}]}
        if anthropic.get("tools"):
            payload["tools"] = [{"type": "function", "function": {
                "name": t["name"], "description": t["description"], "parameters": t["input_schema"]}}
                for t in anthropic["tools"]]
            payload["tool_choice"] = "auto"
        # The byte bound was checked on the Anthropic shape; recheck the one actually sent.
        policy = kwargs["policy"]
        if len(json.dumps(payload, allow_nan=False, ensure_ascii=False).encode()) > policy.max_context_bytes:
            raise ProviderError("context_too_large")
        return payload

    def complete(self, *, model, policy, context, tools, max_tokens) -> ModelResult:
        payload = self.prepare_request(model=model, policy=policy, context=context, tools=tools, max_tokens=max_tokens)
        value = self._request("POST", "/chat/completions", payload)
        try:
            return self._parse(value, tools, self._verified[model], max_tokens)
        except ProviderError:
            raise
        except (ValueError, KeyError, TypeError, AttributeError, RecursionError, IndexError):
            raise ProviderError("malformed_response", usage_unknown=True) from None

    @staticmethod
    def _parse(value, tools, model, max_tokens):
        # Output and usage are attributed to the verified model only; any other
        # identity (alias routing, a substituted model) is refused, not relabelled.
        if value["object"] != "chat.completion" or value["model"] != model:
            raise ValueError()
        choices = value["choices"]
        if not isinstance(choices, list) or len(choices) != 1:
            raise ValueError()
        choice = choices[0]
        finish = choice["finish_reason"]
        if finish == "insufficient_system_resource":
            raise ProviderError("provider_unavailable", retryable=True, usage_unknown=True)
        if finish not in _STOP:
            raise ValueError()
        message = choice["message"]
        if message["role"] != "assistant":
            raise ValueError()

        usage = value["usage"]
        prompt, completion = usage["prompt_tokens"], usage["completion_tokens"]
        hit, miss = usage.get("prompt_cache_hit_tokens"), usage.get("prompt_cache_miss_tokens")
        numbers = [prompt, completion] + [n for n in (hit, miss) if n is not None]
        if any(type(n) is not int or n < 0 for n in numbers) or completion > max_tokens:
            raise ValueError()
        if hit is not None and miss is not None and hit + miss == prompt:
            counts = {"input_tokens": miss, "output_tokens": completion, "cache_read_input_tokens": hit}
        else:
            counts = {"input_tokens": prompt, "output_tokens": completion}

        texts = []
        content = message.get("content")
        if content is not None:
            if not isinstance(content, str):
                raise ValueError()
            if content.strip():
                # A single fenced block is unwrapped; any other prose is passed as-is.
                fenced = _FENCE.fullmatch(content)
                texts.append(fenced.group(1) if fenced else content)
        definitions = {t.name: t for t in tools}
        calls, ids = [], set()
        raw_calls = message.get("tool_calls") or []
        if not isinstance(raw_calls, list) or len(raw_calls) > 64:
            raise ValueError()
        for call in raw_calls:
            function, identity = call["function"], call["id"]
            name = function["name"]
            if (call.get("type", "function") != "function" or name not in definitions
                    or not isinstance(identity, str) or not 0 < len(identity) <= 160 or identity in ids):
                raise ValueError()
            arguments = json.loads(function["arguments"]) if isinstance(function["arguments"], str) else function["arguments"]
            args = definitions[name].input_model.model_validate(arguments, strict=True)
            calls.append({"id": identity, "name": name, "input": args.model_dump(mode="json")})
            ids.add(identity)
        stop = "tool_use" if calls and finish in {"stop", "tool_calls"} else _STOP[finish]
        if bool(calls) != (stop == "tool_use"):
            raise ValueError()
        return ModelResult(model=model, stop_reason=stop, text=tuple(texts), tool_calls=tuple(calls), usage=counts,
                           adapter_version=ADAPTER_VERSION, api_version=API_VERSION)

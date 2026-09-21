"""Trusted runtime composition. No dynamic imports or model-selected configuration."""
from .config import AgentSettings, ConfigurationError, load_settings
from .errors import DomainError


def admission():
    try:
        load_settings(AgentSettings).require_runtime()
    except ConfigurationError as exc:
        raise DomainError(str(exc), 503, 'AGENT_UNAVAILABLE') from None


def coordinator(db, store, settings, agents, *, transport=None):
    from .agent_coordinator import Coordinator
    from .model_provider import AnthropicProvider, ProviderError
    agents.require_runtime()
    bounds, prices = agents.runtime_limits()
    provider = AnthropicProvider(agents, transport=transport, backend_settings=settings)
    try:
        models = provider.verify_models()
        # Bounds and prices bind pinned identities, never a mutable alias.
        if any(alias != resolved for alias, resolved in models.items()):
            raise ProviderError('runtime_requires_resolved_model_ids')
        return Coordinator(db, store, settings, provider, model=agents.coordinator_model,
            specialist_model=agents.specialist_model, bounds=bounds, prices=prices,
            max_tokens=agents.agent_max_output_tokens)
    except BaseException:
        provider.close()
        raise

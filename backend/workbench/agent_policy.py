"""E01: trusted, versioned authority. Objective/source text is never policy input.

Callers resolve project ownership before constructing scopes. Persist the effective
snapshot/reference; re-intersect current authority before dispatch (B11/B12/E03).
"""
import hashlib
import json
from typing import Literal, get_args

from pydantic import Field

from .contract_core import ContractModel, Identifier, PolicyReference, Revision, ToolName
from .research_contracts import ResourceLimits

Exposure = Literal["schema_aggregates", "selected_excerpts", "raw_project_content"]
EXPOSURES = get_args(Exposure)
INSPECTION = frozenset({"inspect_project", "inspect_dataset", "list_artifacts", "read_artifact", "read_job", "read_memory"})


def default_limits() -> ResourceLimits:
    return ResourceLimits(model_tokens=32000, model_requests=24, tool_calls=60,
        coordinator_iterations=24, specialist_assignments=4, specialist_concurrency=2,
        delegation_depth=1, review_rounds=1, scientific_attempts=8, active_seconds=900,
        transient_retries=2, finalization_model_tokens=2000, finalization_scientific_attempts=0)


class AuthorityPolicy(ContractModel):
    schema_version: Literal["1.0"] = "1.0"
    policy_id: Identifier
    revision: Revision
    source_policies: tuple[PolicyReference, ...] = ()
    project_ids: frozenset[Identifier]
    material_ids: frozenset[Identifier] = frozenset()
    artifact_ids: frozenset[Identifier] = frozenset()
    allowed_tools: frozenset[ToolName] = frozenset(get_args(ToolName)) - {"replay_science"}
    provider_models: frozenset[Identifier] = frozenset()
    scientific_models: frozenset[Identifier] = frozenset()
    exposure: Exposure = "schema_aggregates"
    content_classes: frozenset[Literal["schema", "aggregates", "excerpt", "raw"]] = frozenset({"schema", "aggregates"})
    max_context_bytes: int = Field(default=64000, strict=True, ge=0, le=1000000)
    limits: ResourceLimits = Field(default_factory=default_limits)
    # Unknown prices cannot satisfy a monetary ceiling; E05 enforces accounting.
    spend_ceiling_usd: float | None = Field(default=None, ge=0)
    allow_reuse: bool = True
    automatic_failure_recording: bool = False
    # Exact rule identities include conditions/justification in the trusted registry.
    warning_rule_ids: frozenset[Identifier] = frozenset()
    verify_reports: bool = True
    # Explicit consent for operator-entered goals/answers, independent of file exposure.
    share_operator_messages: bool = False

    def reference(self) -> PolicyReference:
        def canonical(value):
            if isinstance(value, dict):
                return {k: canonical(v) for k, v in value.items()}
            if isinstance(value, (set, frozenset)):
                return sorted(value)
            return value
        encoded = json.dumps(canonical(self.model_dump()), sort_keys=True, separators=(",", ":"), allow_nan=False)
        return PolicyReference(policy_id=self.policy_id, revision=self.revision,
                               sha256=hashlib.sha256(encoded.encode()).hexdigest())


def intersect_policy(server: AuthorityPolicy, project: AuthorityPolicy,
                     request: AuthorityPolicy | None = None,
                     assignment: AuthorityPolicy | None = None) -> AuthorityPolicy:
    """Every layer only narrows. Empty ID/model sets grant no authority, never '*'."""
    layers = [p for p in (server, project, request, assignment) if p is not None]
    data = project.model_dump()
    data["source_policies"] = tuple(p.reference() for p in layers)
    for name in ("project_ids", "material_ids", "artifact_ids", "allowed_tools", "provider_models",
                 "scientific_models", "content_classes", "warning_rule_ids"):
        data[name] = frozenset.intersection(*(getattr(p, name) for p in layers))
    data["exposure"] = min((p.exposure for p in layers), key=EXPOSURES.index)
    permitted_classes = {"schema", "aggregates"}
    if data["exposure"] in {"selected_excerpts", "raw_project_content"}:
        permitted_classes.add("excerpt")
    if data["exposure"] == "raw_project_content":
        permitted_classes.add("raw")
    data["content_classes"] &= permitted_classes
    data["limits"] = {k: min(getattr(p.limits, k) for p in layers) for k in ResourceLimits.model_fields}
    data["max_context_bytes"] = min(p.max_context_bytes for p in layers)
    ceilings = [p.spend_ceiling_usd for p in layers if p.spend_ceiling_usd is not None]
    data["spend_ceiling_usd"] = min(ceilings) if ceilings else None
    for name in ("allow_reuse", "automatic_failure_recording", "share_operator_messages"):
        data[name] = all(getattr(p, name) for p in layers)
    data["verify_reports"] = any(p.verify_reports for p in layers)
    return AuthorityPolicy.model_validate(data)


class PolicyDenied(ValueError):
    def __init__(self):
        super().__init__("Action exceeds effective authority.")


def authorize_action(policy: AuthorityPolicy, *, project_id: str, tool: ToolName,
                     material_ids: frozenset[str] = frozenset(), artifact_ids: frozenset[str] = frozenset(),
                     scientific_model: str | None = None) -> None:
    if (project_id not in policy.project_ids or tool not in policy.allowed_tools
        or not material_ids <= policy.material_ids or not artifact_ids <= policy.artifact_ids
        or (scientific_model is not None and scientific_model not in policy.scientific_models)
        or (tool == "record_outcome" and not policy.automatic_failure_recording)):
        raise PolicyDenied()


def interruption_reason(*, material_unknown: bool = False, authority_exceeded: bool = False,
                        mode: Literal["autopilot", "review_plan"] = "autopilot",
                        plan_accepted: bool = False, tool: ToolName = "run_audit") -> str | None:
    """E07 supplies resolved scientific facts; independent steps evaluate separately."""
    if mode not in {"autopilot", "review_plan"}:
        raise ValueError("Unsupported research mode")
    if authority_exceeded:
        return "authority_required"
    if material_unknown:
        return "material_clarification"
    if mode == "review_plan" and not plan_accepted and tool not in INSPECTION:
        return "plan_review"
    return None

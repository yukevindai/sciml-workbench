"""Opt-in automatic authority for single-operator workspaces (WB_AGENT_AUTO_POLICY=1).

Without it, agent access is granted only by the reviewed operator command in
operator_policy. With it, the operator has decided in trusted configuration
that each project's own uploads may be offered to the configured models under
the conservative template below. Grants still travel through the same
append-only, revision-checked install path; nothing here widens exposure beyond
schema and aggregates, and model or source text never chooses the scope.
"""
from typing import get_args

from sqlalchemy import select, text

from .agent_db import ProjectPolicyRow, ServerPolicyRow
from .agent_policy import AuthorityPolicy
from .barriers import lock_project
from .config import AgentSettings
from .contracts import BenchmarkInput
from .db import ArtifactRow, MaterialRow
from .errors import DomainError
from .operator_policy import PolicyBundle, install
from .research_contracts import ResourceLimits

SERVER_POLICY_ID = 'auto-server'
PROJECT_POLICY_ID = 'auto-project'
# Fixed advisory-lock key for automatic server-policy appends.
SERVER_POLICY_LOCK = 0x5743_4155_544F
# Research runs spend from these per request (see RUN_LIMITS in the web client);
# the project-wide totals below are cumulative across every run in the project.
RUN_LIMITS = dict(model_tokens=400_000, model_requests=40, tool_calls=80, coordinator_iterations=40,
                  specialist_assignments=4, specialist_concurrency=2, delegation_depth=1, review_rounds=1,
                  scientific_attempts=8, active_seconds=1800, transient_retries=4,
                  finalization_model_tokens=40_000, finalization_scientific_attempts=0)
PROJECT_SCALE = 25


def project_limits() -> ResourceLimits:
    scaled = {k: v * PROJECT_SCALE for k, v in RUN_LIMITS.items()}
    scaled.update(delegation_depth=1, specialist_concurrency=RUN_LIMITS['specialist_concurrency'])
    return ResourceLimits(**scaled)


def _template(agents: AgentSettings, policy_id: str, revision: int, pid: str, materials, artifacts) -> AuthorityPolicy:
    return AuthorityPolicy(
        policy_id=policy_id, revision=revision, project_ids={pid},
        material_ids=materials, artifact_ids=artifacts,
        provider_models={agents.coordinator_model, agents.specialist_model},
        scientific_models=set(get_args(BenchmarkInput.model_fields['model'].annotation)),
        exposure='schema_aggregates', content_classes={'schema', 'aggregates'},
        # The researcher's typed request must reach the model for agents to work at all.
        share_operator_messages=True, limits=project_limits(),
        spend_ceiling_usd=agents.agent_auto_spend_ceiling_usd,
        allow_reuse=True, automatic_failure_recording=False, verify_reports=True)


def grant_project_inputs(session, pid: str, agents: AgentSettings) -> dict:
    """Caller owns the transaction. Idempotent: an already-covering pair is unchanged."""
    if not agents.agent_auto_policy:
        raise DomainError('Automatic agent access is turned off on this server. An operator can turn it on with WB_AGENT_AUTO_POLICY=1.',
                          409, 'AGENT_UNAVAILABLE')
    # The server policy is one global revision chain: serialize every automatic
    # append so grants for different projects cannot compute the same revision.
    # (SQLite already serializes writers once lock_project writes.)
    if session.bind.dialect.name == 'postgresql':
        session.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': SERVER_POLICY_LOCK})
    lock_project(session, pid)
    materials = frozenset(session.scalars(select(MaterialRow.id).where(MaterialRow.project_id == pid)))
    datasets = frozenset(session.scalars(select(ArtifactRow.id).where(
        ArtifactRow.project_id == pid, ArtifactRow.kind == 'dataset')))
    current_server = session.scalar(select(ServerPolicyRow).order_by(ServerPolicyRow.revision.desc()).limit(1))
    current_project = session.scalar(select(ProjectPolicyRow).where(ProjectPolicyRow.project_id == pid)
                                     .order_by(ProjectPolicyRow.revision.desc()).limit(1))
    server_revision = (current_server.revision if current_server else 0) + 1
    project_revision = (current_project.revision if current_project else 0) + 1

    if current_server:
        # Keep the operator's server-wide caps; only extend scope to this project's own inputs.
        old = AuthorityPolicy.model_validate(current_server.payload)
        server = old.model_copy(update={
            'revision': server_revision, 'project_ids': old.project_ids | {pid},
            'material_ids': old.material_ids | materials, 'artifact_ids': old.artifact_ids | datasets})
        server = AuthorityPolicy.model_validate(server.model_dump())
        if server.model_dump(exclude={'revision'}) == old.model_dump(exclude={'revision'}):
            server = old
    else:
        server = _template(agents, SERVER_POLICY_ID, server_revision, pid, materials, datasets)

    if current_project:
        old = AuthorityPolicy.model_validate(current_project.payload)
        if old.policy_id == PROJECT_POLICY_ID:
            project = _template(agents, PROJECT_POLICY_ID, project_revision, pid,
                                old.material_ids | materials, old.artifact_ids | datasets)
        else:
            # An operator-reviewed project policy: extend only its input scope.
            project = AuthorityPolicy.model_validate(old.model_copy(update={
                'revision': project_revision, 'material_ids': old.material_ids | materials,
                'artifact_ids': old.artifact_ids | datasets}).model_dump())
        if project.model_dump(exclude={'revision'}) == old.model_dump(exclude={'revision'}):
            project = old
    else:
        project = _template(agents, PROJECT_POLICY_ID, project_revision, pid, materials, datasets)

    if current_server and current_project and server.revision == current_server.revision and project.revision == current_project.revision:
        return {'status': 'unchanged'}
    # install() requires both revisions to advance together; keep it simple and append both.
    if server.revision == (current_server.revision if current_server else 0):
        server = AuthorityPolicy.model_validate({**server.model_dump(), 'revision': server_revision})
    if project.revision == (current_project.revision if current_project else 0):
        project = AuthorityPolicy.model_validate({**project.model_dump(), 'revision': project_revision})
    result = install(session, PolicyBundle(server=server, project=project), apply=True)
    return {'status': result['status']}

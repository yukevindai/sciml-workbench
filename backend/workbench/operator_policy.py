"""E16 trusted local policy provisioning; validate by default, never call a provider."""
import argparse
import json
from pathlib import Path
import sys

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from .agent_db import ProjectPolicyRow, ServerPolicyRow
from .agent_policy import AuthorityPolicy, intersect_policy
from .barriers import lock_project
from .config import AgentSettings, ConfigurationError, load_settings
from .contract_core import ContractModel
from .db import ArtifactRow, Database, MaterialRow, ProjectRow
from .egress import SecretGuard, EgressDenied
from .errors import DomainError


class PolicyBundle(ContractModel):
    server: AuthorityPolicy
    project: AuthorityPolicy


def install(session, bundle, *, apply=False):
    """Caller owns transaction. Serialize operator changes with all writers stopped."""
    server, project = bundle.server, bundle.project
    if len(project.project_ids) != 1:
        raise DomainError('Project policy must name exactly one project')
    pid = next(iter(project.project_ids))
    if apply:
        lock_project(session, pid)
    for policy in (server, project):
        for ident in policy.project_ids:
            if session.get(ProjectRow, ident) is None:
                raise DomainError('Policy references a missing project')
        for model, ids in ((ArtifactRow, policy.artifact_ids), (MaterialRow, policy.material_ids)):
            for ident in ids:
                row = session.get(model, ident)
                if row is None or row.project_id not in policy.project_ids:
                    raise DomainError('Policy input is missing or outside its project scope')
    effective = intersect_policy(server, project)
    if pid not in effective.project_ids:
        raise DomainError('Server policy does not authorize the project')
    current_server = session.scalar(select(ServerPolicyRow).order_by(ServerPolicyRow.revision.desc()).limit(1))
    current_project = session.scalar(select(ProjectPolicyRow).where(ProjectPolicyRow.project_id == pid)
                                     .order_by(ProjectPolicyRow.revision.desc()).limit(1))
    unchanged = bool(current_server and current_project
        and AuthorityPolicy.model_validate(current_server.payload) == server
        and AuthorityPolicy.model_validate(current_project.payload) == project)
    if not unchanged:
        if server.revision != (current_server.revision if current_server else 0) + 1 or project.revision != (current_project.revision if current_project else 0) + 1:
            raise DomainError('Policy revision changed; review both latest policies before retrying', 409, 'IDEMPOTENCY_CONFLICT')
        if apply:
            session.add(ServerPolicyRow(revision=server.revision, payload=server.model_dump(mode='json')))
            session.add(ProjectPolicyRow(project_id=pid, revision=project.revision, payload=project.model_dump(mode='json')))
            session.flush()
    return {'status': 'unchanged' if unchanged else 'applied' if apply else 'validated_only',
            'server_reference': server.reference().model_dump(mode='json'),
            'project_reference': project.reference().model_dump(mode='json'),
            'effective_policy': effective.model_dump(mode='json')}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', required=True, help='Reviewed PolicyBundle JSON path, or - for standard input')
    parser.add_argument('--apply', action='store_true', help='Append the reviewed revisions; stop all writers first')
    args = parser.parse_args(argv)
    db = None
    try:
        settings = load_settings()
        agents = load_settings(AgentSettings)
        # Validate prospective activation without enabling a running process.
        agents.model_copy(update={'agents_enabled': True}).require_runtime()
        bounds, prices = agents.runtime_limits()
        raw = sys.stdin.read(1_000_001) if args.file == '-' else Path(args.file).read_text(encoding='utf-8')
        if len(raw) > 1_000_000:
            raise ValueError()
        guard = SecretGuard(settings)
        guard.check(raw)
        bundle = PolicyBundle.model_validate_json(raw)
        effective = intersect_policy(bundle.server, bundle.project)
        models = {agents.coordinator_model, agents.specialist_model}
        if not models <= effective.provider_models:
            raise DomainError('Effective policy must authorize both configured provider models')
        if effective.spend_ceiling_usd is not None and not models <= prices.keys():
            raise DomainError('A monetary ceiling requires reviewed prices for both models')
        for model in models:
            if bounds[model].input_tokens + agents.agent_max_output_tokens > effective.limits.model_tokens - effective.limits.finalization_model_tokens:
                raise DomainError('Ordinary model token allowance cannot admit one bounded request')
        db = Database(settings.database_url)
        with db.session.begin() as session:
            result = install(session, bundle, apply=args.apply)
            guard.check(result)  # Before commit, including values from normalized policies.
        print(json.dumps(result, sort_keys=True))
        return 0
    except (ConfigurationError, DomainError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except (ValidationError, ValueError, OSError, SQLAlchemyError, EgressDenied):
        print('Policy provisioning failed; check reviewed JSON, current revisions and backend configuration.', file=sys.stderr)
        return 2
    finally:
        if db is not None:
            db.engine.dispose()


if __name__ == '__main__':
    raise SystemExit(main())

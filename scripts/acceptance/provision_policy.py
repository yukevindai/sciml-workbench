"""A10 acceptance only: install operator policy revisions granting a project's current inputs.

This is the manual operator step the product leaves to trusted provisioning (no
policy-write route exists). Run inside the backend container:

    docker compose exec -T api python - <project-id> < scripts/acceptance/provision_policy.py

Each call appends new server and project revisions, following the service lock order.
"""
import sys

from sqlalchemy import func, select

from workbench.agent_db import ProjectPolicyRow, ServerPolicyRow
from workbench.agent_policy import AuthorityPolicy
from workbench.barriers import lock_project
from workbench.config import Settings, load_settings
from workbench.db import ArtifactRow, Database, MaterialRow

MODELS = {'a10-scripted-coordinator', 'a10-scripted-specialist'}


def main(pid):
    settings = load_settings(Settings)
    db = Database(settings.database_url)
    with db.session.begin() as s:
        lock_project(s, pid)
        materials = set(s.scalars(select(MaterialRow.id).where(MaterialRow.project_id == pid)))
        artifacts = set(s.scalars(select(ArtifactRow.id).where(ArtifactRow.project_id == pid, ArtifactRow.kind == 'dataset')))
        server = s.scalar(select(ServerPolicyRow).order_by(ServerPolicyRow.revision.desc()).limit(1))
        grants = dict(material_ids=materials, artifact_ids=artifacts, provider_models=MODELS, scientific_models={'mean', 'ridge'})
        # The server ceiling keeps every project it already covered and adds this one.
        previous = AuthorityPolicy.model_validate(server.payload) if server else None
        revision = (server.revision if server else 0) + 1
        ceiling = AuthorityPolicy(policy_id='a10-server', revision=revision,
            project_ids=(previous.project_ids if previous else frozenset()) | {pid},
            material_ids=(previous.material_ids if previous else frozenset()) | materials,
            artifact_ids=(previous.artifact_ids if previous else frozenset()) | artifacts,
            provider_models=MODELS, scientific_models={'mean', 'ridge'})
        s.add(ServerPolicyRow(revision=revision, payload=ceiling.model_dump(mode='json')))
        current = s.scalar(select(func.max(ProjectPolicyRow.revision)).where(ProjectPolicyRow.project_id == pid)) or 0
        project = AuthorityPolicy(policy_id=f'a10-project-{pid[:8]}', revision=current + 1, project_ids={pid}, **grants)
        s.add(ProjectPolicyRow(project_id=pid, revision=current + 1, payload=project.model_dump(mode='json')))
    print(f'project {pid}: policy revision {current + 1}, {len(materials)} attachments, {len(artifacts)} datasets')


if __name__ == '__main__':
    main(sys.argv[1])

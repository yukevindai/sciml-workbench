"""Immutable requests, scoped results/retries, and scientific claim metadata.

Stop API/workers before upgrading. Legacy running attempts are explicitly failed:
their old worker has no fence and cannot be safely adopted by the new runtime.
"""

import hashlib
import json
from alembic import op
import sqlalchemy as sa
from workbench.metadata_guards_v2 import install, uninstall

revision = "0002"
down_revision = "0001"
branch_labels = depends_on = None


def digest(kind, payload):
    # Frozen canonical identity v1; do not import evolving service code here.
    return hashlib.sha256(json.dumps(
        {"identity_version": 1, "kind": kind, "payload": payload},
        sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False,
    ).encode("utf-8")).hexdigest()


def upgrade():
    bind = op.get_bind()
    metadata = sa.MetaData()
    artifacts = sa.Table("artifacts", metadata, autoload_with=bind)
    jobs = sa.Table("jobs", metadata, autoload_with=bind)
    projects = {r.id for r in bind.execute(sa.text("SELECT id FROM projects"))}
    owners = {}
    for row in bind.execute(sa.select(artifacts)).mappings():
        if row["project_id"] not in projects or not isinstance(row["payload"], dict) or any(
            row["payload"].get(field) != row[field] for field in ("id", "project_id", "kind")
        ):
            raise RuntimeError("Migration 0002: inconsistent artifact metadata; repair explicitly before retrying")
        owners[row["id"]] = row["project_id"]
    for row in bind.execute(sa.select(jobs)).mappings():
        if (row["project_id"] not in projects or row["state"] not in {"queued", "running", "succeeded", "failed"}
                or (row["result_id"] is not None and owners.get(row["result_id"]) != row["project_id"])):
            raise RuntimeError("Migration 0002: invalid job state/project/result; repair explicitly before retrying")
        digest(row["kind"], row["payload"])

    with op.batch_alter_table("artifacts") as batch:
        batch.create_unique_constraint("uq_artifacts_project_id_id", ["project_id", "id"])
        for field in ("id", "project_id", "kind"):
            value = sa.column("payload", sa.JSON())[field].as_string()
            batch.create_check_constraint(f"ck_artifacts_payload_{field}", value.is_not(None) & (value == sa.column(field)))

    for column in (
        sa.Column("request_digest", sa.String(64)),
        sa.Column("claim_token", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("worker_id", sa.String(160)),
        sa.Column("deadline_at", sa.DateTime(timezone=True)),
        sa.Column("error_code", sa.String(80)),
        sa.Column("retry_of_job_id", sa.String(36)),
    ):
        op.add_column("jobs", column)

    # Update metadata only; never deserialize/reserialize an artifact or job payload.
    updated_jobs = sa.Table("jobs", sa.MetaData(), autoload_with=bind)
    for row in bind.execute(sa.select(jobs.c.id, jobs.c.kind, jobs.c.payload)).mappings():
        bind.execute(updated_jobs.update().where(updated_jobs.c.id == row["id"]).values(request_digest=digest(row["kind"], row["payload"])))
    bind.execute(updated_jobs.update().where(updated_jobs.c.state == "running").values(
        state="failed", error_code="WORKER_INTERRUPTED",
        error="Legacy execution interrupted by metadata upgrade; retry explicitly.", finished_at=sa.func.current_timestamp(),
    ))
    request_unique = next(c for c in sa.inspect(bind).get_unique_constraints("jobs")
                          if c["column_names"] == ["project_id", "request_key"])
    with op.batch_alter_table("jobs", naming_convention={"uq": "uq_%(table_name)s_%(column_0_name)s_%(column_1_name)s"}) as batch:
        batch.drop_constraint(request_unique["name"] or "uq_jobs_project_id_request_key", type_="unique")
        batch.create_unique_constraint("uq_jobs_project_request", ["project_id", "request_key"])
        batch.alter_column("request_digest", existing_type=sa.String(64), nullable=False)
        batch.create_unique_constraint("uq_jobs_project_id_id", ["project_id", "id"])
        batch.create_foreign_key("fk_jobs_scoped_result", "artifacts", ["project_id", "result_id"], ["project_id", "id"])
        batch.create_foreign_key("fk_jobs_scoped_retry", "jobs", ["project_id", "retry_of_job_id"], ["project_id", "id"])
        for name, condition in (
            ("state", "state IN ('queued', 'running', 'succeeded', 'failed')"),
            ("claim_token", "claim_token >= 0"),
            ("request_digest", "length(request_digest) = 64"),
            ("not_self_retry", "retry_of_job_id IS NULL OR retry_of_job_id <> id"),
            ("claim_metadata", "(claim_token = 0 AND worker_id IS NULL AND deadline_at IS NULL) OR "
             "(claim_token > 0 AND worker_id IS NOT NULL AND started_at IS NOT NULL AND deadline_at IS NOT NULL AND deadline_at > started_at)"),
            ("running_claim", "state <> 'running' OR claim_token > 0"),
        ):
            batch.create_check_constraint(f"ck_jobs_{name}", condition)
        batch.create_index("ix_jobs_claim_queue", ["state", "created_at", "id"])
        batch.create_index("ix_jobs_expiry", ["state", "deadline_at"])
    install(bind)


def downgrade():
    # Removing the fencing/identity guarantees with recorded work is unsafe.
    bind = op.get_bind()
    if bind.scalar(sa.text("SELECT count(*) FROM jobs")):
        raise RuntimeError("Migration 0002 cannot downgrade a database containing jobs; restore a coordinated backup")
    uninstall(bind)
    with op.batch_alter_table("jobs") as batch:
        for name in ("fk_jobs_scoped_result", "fk_jobs_scoped_retry"):
            batch.drop_constraint(name, type_="foreignkey")
        batch.drop_constraint("uq_jobs_project_id_id", type_="unique")
        for name in ("state", "claim_token", "request_digest", "not_self_retry", "claim_metadata", "running_claim"):
            batch.drop_constraint(f"ck_jobs_{name}", type_="check")
        batch.drop_index("ix_jobs_claim_queue")
        batch.drop_index("ix_jobs_expiry")
        for name in ("request_digest", "claim_token", "worker_id", "deadline_at", "error_code", "retry_of_job_id"):
            batch.drop_column(name)
    with op.batch_alter_table("artifacts") as batch:
        batch.drop_constraint("uq_artifacts_project_id_id", type_="unique")
        for name in ("id", "project_id", "kind"):
            batch.drop_constraint(f"ck_artifacts_payload_{name}", type_="check")

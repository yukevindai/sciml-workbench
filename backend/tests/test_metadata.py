"""B02 migration/relational/claim acceptance on SQLite and real PostgreSQL.

TEST_DATABASE_URL opts into a disposable random schema, never existing tables.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
import json
import os
from pathlib import Path
from threading import Barrier
from uuid import uuid4

from alembic import command
from alembic.config import Config
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
import pytest
from sqlalchemy import MetaData, Table, create_engine, func, inspect, select, text, update
from sqlalchemy.exc import IntegrityError

from workbench.contracts import now
from workbench.db import ArtifactRow, Base, Database, JobRow, ProjectRow
from workbench.job_metadata import (
    JobClaim, StaleClaim, claim_next, database_now, fail_claim, finish_claim, submit_job,
)
from workbench.request_identity import request_digest
from workbench.services import DomainError

ROOT = Path(__file__).resolve().parents[1]


def migrate(db, revision="head", *, downgrade=False):
    config = Config(str(ROOT / "alembic.ini"))
    with db.engine.connect() as connection:
        config.attributes["connection"] = connection
        (command.downgrade if downgrade else command.upgrade)(config, revision)


@pytest.fixture(params=["sqlite", "postgresql"])
def old_db(request, tmp_path):
    admin = None
    if request.param == "postgresql":
        url = os.environ.get("TEST_DATABASE_URL")
        if not url:
            pytest.skip("Set TEST_DATABASE_URL for real PostgreSQL acceptance")
        admin = create_engine(url)
        assert admin.dialect.name == "postgresql"
        schema = "b02_" + uuid4().hex
        with admin.begin() as connection:
            connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
        db = Database(url)
        db.engine.dispose()
        db.engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
        db.session.configure(bind=db.engine)
    else:
        db = Database(f"sqlite:///{tmp_path}/metadata.sqlite")
    try:
        migrate(db, "0001")
        yield db
    finally:
        db.engine.dispose()
        if admin is not None:
            with admin.begin() as connection:
                connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
            admin.dispose()


@pytest.fixture
def db(old_db):
    migrate(old_db)
    with old_db.session.begin() as session:
        session.add_all([ProjectRow(id="p", name="One"), ProjectRow(id="q", name="Two")])
    return old_db


def add_artifact(session, artifact_id="a", project_id="p"):
    row = ArtifactRow(id=artifact_id, project_id=project_id, kind="dataset",
                      payload={"id": artifact_id, "project_id": project_id, "kind": "dataset", "value": "unchanged"})
    session.add(row)
    session.flush()
    return row


def queue(db, key="key", **kwargs):
    with db.session.begin() as session:
        return submit_job(session, kwargs.pop("project_id", "p"), kwargs.pop("kind", "report"),
                          kwargs.pop("payload", {}), key, **kwargs).id


def test_populated_upgrade_preserves_exact_payloads_and_request_identity(old_db):
    metadata = MetaData()
    projects = Table("projects", metadata, autoload_with=old_db.engine)
    artifacts = Table("artifacts", metadata, autoload_with=old_db.engine)
    jobs = Table("jobs", metadata, autoload_with=old_db.engine)
    fixtures = json.loads((ROOT / "tests/fixtures/contracts/legacy-v1.json").read_text())
    # Fixtures are independent stored legacy data, not generated from new models.
    values = list(fixtures.values()) if isinstance(fixtures, dict) else fixtures
    with old_db.engine.begin() as connection:
        for pid in {a["project_id"] for a in values}:
            connection.execute(projects.insert().values(id=pid, name="Existing", description="Preserve", created_at=now()))
        for value in values:
            connection.execute(artifacts.insert().values(id=value["id"], project_id=value["project_id"], kind=value["kind"], payload=value, created_at=now()))
        for i, state in enumerate(("queued", "running", "succeeded", "failed")):
            connection.execute(jobs.insert().values(id=f"old-{i}", project_id=values[0]["project_id"],
                request_key=f"request-{i}", kind="report", payload={"z": [2, 1], "a": {"β": 2}}, state=state,
                result_id=values[0]["id"] if state == "succeeded" else None,
                error="Previous failure" if state == "failed" else None, created_at=now(),
                started_at=now() - timedelta(hours=1) if state != "queued" else None))
        before = connection.execute(text("SELECT id, CAST(payload AS TEXT) FROM artifacts ORDER BY id")).all()
        job_before = connection.execute(text("SELECT id, CAST(payload AS TEXT) FROM jobs ORDER BY id")).all()
    migrate(old_db)
    with old_db.session() as session:
        assert session.execute(text("SELECT id, CAST(payload AS TEXT) FROM artifacts ORDER BY id")).all() == before
        assert session.execute(text("SELECT id, CAST(payload AS TEXT) FROM jobs ORDER BY id")).all() == job_before
        rows = session.scalars(select(JobRow).order_by(JobRow.id)).all()
        assert [r.state for r in rows] == ["queued", "failed", "succeeded", "failed"]
        assert rows[1].error_code == "WORKER_INTERRUPTED" and rows[1].finished_at
        assert rows[2].result_id == values[0]["id"] and rows[3].error == "Previous failure"
        assert all(r.request_digest == request_digest(r.kind, r.payload) for r in rows)
        assert all(r.claim_token == 0 and r.deadline_at is None for r in rows)
    with old_db.session.begin() as session:
        assert submit_job(session, values[0]["project_id"], "report", {"a": {"β": 2}, "z": [2, 1]}, "request-0").id == "old-0"


def test_upgrade_refuses_inconsistent_legacy_data_without_partial_ddl(old_db):
    with old_db.engine.begin() as connection:
        connection.execute(text("INSERT INTO projects VALUES ('p', 'Existing', '', CURRENT_TIMESTAMP)"))
        connection.execute(text("INSERT INTO artifacts VALUES ('bad', 'p', 'dataset', :payload, CURRENT_TIMESTAMP)"),
                           {"payload": json.dumps({"id": "wrong", "project_id": "p", "kind": "dataset"})})
    with pytest.raises(RuntimeError, match="inconsistent artifact"):
        migrate(old_db)
    assert "request_digest" not in {c["name"] for c in inspect(old_db.engine).get_columns("jobs")}
    with old_db.engine.connect() as connection:
        assert connection.scalar(text("SELECT version_num FROM alembic_version")) == "0001"


def test_empty_upgrade_downgrade_roundtrip(old_db):
    migrate(old_db)
    migrate(old_db, "0001", downgrade=True)
    assert "request_digest" not in {c["name"] for c in inspect(old_db.engine).get_columns("jobs")}
    migrate(old_db)


def test_migration_matches_orm_metadata(db):
    with db.engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_server_default": True})
        assert compare_metadata(context, Base.metadata) == []


def test_request_canonicalization_and_project_wide_key(db):
    first = queue(db, payload={"b": 2, "a": [1, 2]})
    assert queue(db, payload={"a": [1, 2], "b": 2}) == first
    for kwargs in ({"payload": {"a": [2, 1], "b": 2}}, {"kind": "evidence"}):
        with pytest.raises(DomainError) as err:
            queue(db, **kwargs)
        assert err.value.status == 409
    assert queue(db, project_id="q") != first
    with pytest.raises(ValueError):
        queue(db, key="nonfinite", payload={"x": float("nan")})
    with pytest.raises(RuntimeError, match="cannot downgrade"):
        migrate(db, "0001", downgrade=True)


@pytest.mark.parametrize("change", [
    {"payload": {"altered": True}}, {"kind": "audit"}, {"request_key": "new"},
    {"project_id": "q"}, {"request_digest": "a" * 64}, {"retry_of_job_id": "different"},
])
def test_accepted_identity_cannot_be_changed_even_with_raw_sql(db, change):
    job_id = queue(db)
    with pytest.raises(IntegrityError), db.engine.begin() as connection:
        connection.execute(update(JobRow).where(JobRow.id == job_id).values(**change))
    with db.session() as session:
        assert session.get(JobRow, job_id).request_key == "key"


def test_scoped_foreign_keys_and_artifact_payload_alignment(db):
    with db.session.begin() as session:
        add_artifact(session, "a", "q")
    job_id = queue(db)
    other = queue(db, project_id="q")
    for change in ({"result_id": "a"}, {"result_id": "missing"}):
        with pytest.raises(IntegrityError), db.engine.begin() as connection:
            connection.execute(update(JobRow).where(JobRow.id == job_id).values(**change))
    with pytest.raises(IntegrityError):
        queue(db, key="bad-retry", retry_of_job_id=other)
    with pytest.raises(IntegrityError):
        queue(db, key="missing-retry", retry_of_job_id="missing")
    assert queue(db, key="good-retry", retry_of_job_id=job_id)
    for field in ("id", "project_id", "kind"):
        with pytest.raises(IntegrityError), db.session.begin() as session:
            row = ArtifactRow(id="bad", project_id="p", kind="dataset",
                              payload={"id": "bad", "project_id": "p", "kind": "dataset"})
            row.payload[field] = "mismatch"
            session.add(row)
    with pytest.raises(IntegrityError), db.engine.begin() as connection:
        connection.execute(update(ArtifactRow).where(ArtifactRow.id == "a").values(payload={"id": "a", "project_id": "q", "kind": "dataset", "changed": True}))
    if db.engine.dialect.name == "postgresql":
        # Even a JSON text rewrite with equivalent object values is a mutation.
        with pytest.raises(IntegrityError), db.engine.begin() as connection:
            connection.execute(text("UPDATE artifacts SET payload = CAST(CAST(payload AS jsonb) AS json) WHERE id = 'a'"))


def test_claim_deadline_fence_and_atomic_publication(db):
    job_id = queue(db)
    claimed = claim_next(db, 90, "worker-a")
    assert claimed == JobClaim(job_id, 1, "worker-a")
    assert claim_next(db, 90, "worker-b") is None
    with db.session() as session:
        row = session.get(JobRow, job_id)
        assert (row.deadline_at - row.started_at).total_seconds() == 90
    for change in ({"deadline_at": now() + timedelta(days=1)}, {"claim_token": 0}, {"worker_id": "worker-b"}):
        with pytest.raises(IntegrityError), db.engine.begin() as connection:
            connection.execute(update(JobRow).where(JobRow.id == job_id).values(**change))
    with pytest.raises(StaleClaim), db.session.begin() as session:
        add_artifact(session, "rolled-back")
        finish_claim(session, JobClaim(job_id, 2, "worker-a"), state="succeeded", result_id="rolled-back")
    with db.session() as session:
        assert session.get(ArtifactRow, "rolled-back") is None
    with db.session.begin() as session:
        add_artifact(session)
        finish_claim(session, claimed, state="succeeded", result_id="a")
    assert not fail_claim(db, claimed, error="Late error", error_code="INTERNAL_ERROR")
    with db.session() as session:
        row = session.get(JobRow, job_id)
        assert row.state == "succeeded" and row.result_id == "a" and row.error is None
    with pytest.raises(IntegrityError), db.engine.begin() as connection:
        connection.execute(update(JobRow).where(JobRow.id == job_id).values(state="failed"))


def test_expired_claim_is_not_renewed_by_new_timeout(db):
    with db.session.begin() as session:
        stamp = database_now(session)
        job = JobRow(id="expired", project_id="p", request_key="expired", kind="report", payload={},
                     state="running", claim_token=1, worker_id="old", started_at=stamp - timedelta(seconds=120),
                     deadline_at=stamp - timedelta(seconds=1))
        session.add(job)
    with pytest.raises(StaleClaim), db.session.begin() as session:
        finish_claim(session, JobClaim("expired", 1, "old"), state="succeeded")
    assert claim_next(db, 86400, "new") is None
    with db.session() as session:
        row = session.get(JobRow, "expired")
        assert row.state == "failed" and row.error_code == "JOB_TIMED_OUT" and row.claim_token == 2
    assert not fail_claim(db, JobClaim("expired", 1, "old"), error="Late", error_code="INTERNAL_ERROR")


def test_postgres_concurrent_requests_and_claims(db):
    if db.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL concurrency semantics")
    barrier = Barrier(8)
    def submit(_):
        barrier.wait(timeout=15)
        return queue(db)
    with ThreadPoolExecutor(max_workers=8) as pool:
        ids = list(pool.map(submit, range(8)))
    assert len(set(ids)) == 1
    with db.session() as session:
        assert session.scalar(select(func.count()).select_from(JobRow)) == 1
    for i in range(7):
        queue(db, key=f"parallel-{i}")
    barrier = Barrier(8)
    def take(i):
        barrier.wait(timeout=15)
        return claim_next(db, 90, f"worker-{i}")
    with ThreadPoolExecutor(max_workers=8) as pool:
        claims = list(pool.map(take, range(8)))
    assert None not in claims and len({c.job_id for c in claims}) == 8
    with db.session() as session:
        assert session.scalar(select(func.count()).select_from(JobRow).where(JobRow.state == "running", JobRow.claim_token == 1)) == 8


def test_postgres_conflicting_requests_have_one_durable_winner(db):
    if db.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL concurrency semantics")
    barrier = Barrier(2)
    def submit(i):
        barrier.wait(timeout=15)
        try:
            return queue(db, payload={"choice": i})
        except DomainError as error:
            return error.status
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(submit, range(2)))
    assert outcomes.count(409) == 1
    with db.session() as session:
        row = session.scalar(select(JobRow))
        assert row.id in outcomes
        assert row.request_digest == request_digest(row.kind, row.payload)
        assert session.scalar(select(func.count()).select_from(JobRow)) == 1


def test_postgres_publication_races_failure_atomically(db):
    if db.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL concurrency semantics")
    job_id = queue(db)
    claimed = claim_next(db, 90, "publisher")
    barrier = Barrier(2)

    def publish():
        barrier.wait(timeout=15)
        try:
            with db.session.begin() as session:
                add_artifact(session)
                finish_claim(session, claimed, state="succeeded", result_id="a")
            return True
        except StaleClaim:
            return False

    def fail():
        barrier.wait(timeout=15)
        return fail_claim(db, claimed, error="Stopped", error_code="WORKER_INTERRUPTED")

    with ThreadPoolExecutor(max_workers=2) as pool:
        published = pool.submit(publish)
        failed = pool.submit(fail)
        outcomes = (published.result(timeout=20), failed.result(timeout=20))
    assert sum(outcomes) == 1
    with db.session() as session:
        row = session.get(JobRow, job_id)
        assert row.state == ("succeeded" if outcomes[0] else "failed")
        assert row.result_id == ("a" if outcomes[0] else None)
        assert (session.get(ArtifactRow, "a") is not None) == outcomes[0]


def test_postgres_cross_project_result_race_never_commits(db):
    if db.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL concurrency semantics")
    with db.session.begin() as session:
        add_artifact(session, "foreign", "q")
    job_id = queue(db)
    claimed = claim_next(db, 90, "publisher")
    barrier = Barrier(2)

    def attempt(result_id):
        barrier.wait(timeout=15)
        try:
            with db.session.begin() as session:
                if result_id == "local":
                    add_artifact(session, "local")
                finish_claim(session, claimed, state="succeeded", result_id=result_id)
            return True
        except (IntegrityError, StaleClaim):
            return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        accepted = list(pool.map(attempt, ("local", "foreign")))
    assert accepted == [True, False]
    with db.session() as session:
        assert session.get(JobRow, job_id).result_id == "local"

"""B05 typed lineage and download-authority acceptance."""
import pytest
from fastapi.testclient import TestClient

from workbench.api import create_app
from workbench.artifacts import ArtifactResolver, artifact_download, resolve_material
from workbench.contracts import Audit, Benchmark, Evidence, Provenance, Report, Split
from workbench.db import ArtifactRow, JobRow, MaterialRow, ProjectRow
from workbench.errors import DomainError
from workbench.execution import TaskResult
from workbench.intake import attach, dataset
from workbench.job_metadata import claim_next
from workbench.services import capture_report, save
from workbench.storage import LocalStore
from workbench.submission import SubmissionScope, SubmissionService
from workbench.worker import prepare_claim, publish_result
from test_worker import runtime


def unsafe_insert(session, *values):
    # Simulate legacy/corrupt records without using the checked writer. Identity
    # constraints remain active; only JSON lineage lacks relational foreign keys.
    for value in values:
        session.add(ArtifactRow(id=value.id, project_id=value.project_id, kind=value.kind,
                                payload=value.model_dump(mode="json")))


def error(code, call, status=None):
    with pytest.raises(DomainError) as caught:
        call()
    assert caught.value.error_code == code
    if status is not None:
        assert caught.value.status == status
    return caught.value


def test_typed_references_are_edges_even_without_legacy_parent_arrays(runtime):
    db, _, data = runtime
    with db.session.begin() as s:
        audit = save(s, Audit(project_id="p", dataset_id=data.id, config={}, result={}))
        part = save(s, Split(project_id="p", dataset_id=data.id, audit_id=audit.id,
                             config={}, assignments=["train", "validation", "test"], result={}))
        run = save(s, Benchmark(project_id="p", dataset_id=data.id, split_id=part.id, model="mean",
                                seed=0, status="failed", config={}))
    with db.session() as s:
        graph = ArtifactResolver(s, "p").closure([run.id])
        assert {a.id for a in graph} == {data.id, audit.id, part.id, run.id}
        assert next(a for a in graph if a.id == audit.id).parents == []  # No backfill.
        error("LINEAGE_MISMATCH", lambda: ArtifactResolver(s, "p").resolve(data.id, "audit"), 422)
        error("ARTIFACT_NOT_FOUND", lambda: ArtifactResolver(s, "other").resolve(data.id), 404)
        error("POLICY_DENIED", lambda: ArtifactResolver(s, "p", {run.id, part.id, data.id}).resolve(run.id), 403)


@pytest.mark.parametrize("relationship", ["parents", "typed", "provenance-input", "provenance-output", "report", "source"])
@pytest.mark.parametrize("foreign", [False, True])
def test_missing_or_foreign_dependency_is_integrity_failure(runtime, relationship, foreign):
    db, settings, data = runtime
    target = "absent"
    with db.session.begin() as s:
        if foreign:
            s.add(ProjectRow(id="q", name="Other"))
            s.flush()
            target = dataset(s, LocalStore(settings.storage_root), settings, "q", b"x\n1\n2\n3\n", "foreign.csv").id
        value = Audit(project_id="p", dataset_id=target if relationship == "typed" else data.id,
                      parents=[target] if relationship == "parents" else [], config={}, result={})
        if relationship.startswith("provenance"):
            value = Provenance(project_id="p", activity="test", inputs=[target] if relationship.endswith("input") else [],
                               outputs=[target] if relationship.endswith("output") else [], parameters={})
        elif relationship == "report":
            value = Report(project_id="p", blob_key="a" * 64, sha256="a" * 64, artifact_ids=[target])
        elif relationship == "source":
            from workbench.scientific_contracts import DatasetV2, SourceDeclarations
            source = SourceDeclarations.model_validate({"citation": {"origin": "source_derived", "value": "Supported citation",
                "supporting_references": [{"kind": "artifact", "id": target}]}})
            value = DatasetV2(project_id="p", filename="data.csv", blob_key=data.blob_key, sha256=data.sha256,
                rows=data.rows, columns=data.columns, source=source,
                unresolved_fields=[name for name in SourceDeclarations.model_fields if name != "citation"])
        unsafe_insert(s, value)
        if relationship == "report":
            unsafe_insert(s, Provenance(project_id="p", activity="report", inputs=[], outputs=[value.id], parameters={}))
    with db.session() as s:
        error("INTEGRITY_FAILED", lambda: ArtifactResolver(s, "p").resolve(value.id), 500)
        error("INTEGRITY_FAILED", lambda: capture_report(s, "p"), 500)


@pytest.mark.parametrize("fault", ["wrong-kind", "wrong-dataset", "config", "digest", "cycle"])
def test_corrupt_stored_graphs_are_rejected(runtime, fault):
    db, settings, data = runtime
    with db.session.begin() as s:
        other = dataset(s, LocalStore(settings.storage_root), settings, "p", b"x\n1\n2\n3\n", "other.csv")
        audit = Audit(project_id="p", dataset_id=other.id if fault == "wrong-dataset" else data.id, config={}, result={})
        unsafe_insert(s, audit)
        value = Split(project_id="p", dataset_id=data.id, audit_id=data.id if fault == "wrong-kind" else audit.id,
                       config={}, assignments=["train", "validation", "test"], result={})
        if fault == "config":
            unsafe_insert(s, value)
            value = Benchmark(project_id="p", dataset_id=data.id, split_id=value.id, model="mean", seed=0,
                               status="failed", config={"dataset_id": other.id})
        elif fault == "digest":
            value = Report(project_id="p", blob_key="a" * 64, sha256="b" * 64, artifact_ids=[])
        elif fault == "cycle":
            value = Provenance(id="cycle-one", project_id="p", activity="test", inputs=["cycle-two"], outputs=[], parameters={})
            unsafe_insert(s, Provenance(id="cycle-two", project_id="p", activity="test", inputs=[], outputs=[value.id], parameters={}))
        unsafe_insert(s, value)
    with db.session() as s:
        error("INTEGRITY_FAILED", lambda: ArtifactResolver(s, "p").resolve(value.id), 500)


def test_graph_limits_are_bounded_without_recursion(runtime):
    db, _, data = runtime
    with db.session.begin() as s:
        previous = data.id
        for index in range(12):
            node = Provenance(id=f"chain-{index}", project_id="p", activity="test", inputs=[previous], outputs=[], parameters={})
            unsafe_insert(s, node)
            previous = node.id
    with db.session() as s:
        error("UNSUPPORTED_CAPABILITY", lambda: ArtifactResolver(s, "p", max_depth=5).resolve(previous), 422)
        error("UNSUPPORTED_CAPABILITY", lambda: ArtifactResolver(s, "p", max_nodes=5).resolve(previous), 422)
        assert len(ArtifactResolver(s, "p").closure([previous])) == 13


def test_material_dataset_binding_must_match_exact_bytes(runtime):
    db, settings, data = runtime
    store = LocalStore(settings.storage_root)
    key = store.put(b"other bytes")
    with db.session.begin() as s:
        bad = MaterialRow(project_id="p", request_key="bad-binding", request_digest="a" * 64,
            filename="data.csv", media_type="text/csv", blob_key=key, sha256=key, dataset_id=data.id)
        s.add(bad)
    with db.session() as s:
        error("INTEGRITY_FAILED", lambda: resolve_material(s, "p", bad.id), 500)
        error("INTEGRITY_FAILED", lambda: capture_report(s, "p"), 500)


def test_checked_publication_rejects_hidden_lineage_and_input_substitution(runtime):
    db, settings, data = runtime
    store = LocalStore(settings.storage_root)
    with db.session.begin() as s:
        other = dataset(s, store, settings, "p", b"x\n1\n2\n3\n", "other.csv")
    job = SubmissionService(db, store, settings).submit(SubmissionScope("p"), "audit", {"dataset_id": data.id}, request_key="audit")
    claim = claim_next(db, 60, "worker")
    work, _ = prepare_claim(db, claim)
    for changed in ({"dataset_id": other.id}, {"parents": [other.id]}, {"config": {"target_column": "changed"}}):
        value = Audit(id=work.result_id, project_id="p", dataset_id=data.id, parents=[data.id], config={}, result={})
        value = value.model_copy(update=changed)
        error("INTEGRITY_FAILED", lambda: publish_result(db, claim, work, TaskResult(artifact=value.model_dump(mode="json"))), 500)
    with db.session() as s:
        assert s.get(JobRow, job.id).state == "running"
        assert s.get(ArtifactRow, work.result_id) is None
    with db.session.begin() as s:
        error("INTEGRITY_FAILED", lambda: save(s, Audit(project_id="p", dataset_id="missing", config={}, result={})), 500)


def test_downloads_authenticate_authority_and_select_exact_bytes(runtime):
    db, settings, data = runtime
    store = LocalStore(settings.storage_root)
    original, bundle = b"%PDF-1.4\noriginal bytes", b"exact bundle bytes"
    pdf_key, bundle_key = store.put(original), store.put(bundle)
    with db.session.begin() as s:
        evidence = save(s, Evidence(project_id="p", title="PDF", pdf_key=pdf_key, sha256=pdf_key, bundle_key=bundle_key, result={}))
        unusual = save(s, Evidence(id='legacy"\r\nname', project_id="p", title="PDF", pdf_key=pdf_key,
                                  sha256=pdf_key, bundle_key=bundle_key, result={}))
    with db.session() as s:
        assert artifact_download(s, "p", unusual.id).filename == "evidence-legacy___name.zip"
    app = create_app(settings)
    try:
        with TestClient(app) as client:
            path = f"/api/v1/projects/p/artifacts/{evidence.id}/download"
            assert client.get(path).status_code == 401
            client.headers["Authorization"] = "Bearer " + settings.api_token.get_secret_value()
            assert client.get(path).content == bundle
            pdf = client.get(path + "?representation=original")
            assert pdf.content == original and pdf.headers["content-type"] == "application/pdf"
            assert pdf.headers["content-disposition"].endswith('.pdf"')
            assert client.get(path + "?representation=../../escape").status_code == 422
            assert client.get(f"/api/v1/projects/p/artifacts/{pdf_key}/download").status_code == 404
            assert client.get(f"/api/v1/projects/other/artifacts/{evidence.id}/download").status_code == 404
            assert client.get(f"/api/v1/projects/p/artifacts/{data.id}/download?representation=bundle").status_code == 404
    finally:
        app.state.db.engine.dispose()


def test_corrupt_metadata_does_not_reveal_payload_or_read_blobs(runtime, monkeypatch):
    db, settings, data = runtime
    with db.session.begin() as s:
        value = Report(project_id="p", blob_key=data.blob_key, sha256=data.sha256, artifact_ids=["private-missing-parent"])
        unsafe_insert(s, value)
        s.add(ArtifactRow(id="malformed", project_id="p", kind="dataset", payload={"id": "malformed", "project_id": "p",
            "kind": "dataset", "schema_version": "9.0", "secret": "must-not-echo"}))
    app = create_app(settings)
    monkeypatch.setattr(app.state.store, "get", lambda key: pytest.fail("Invalid lineage must not authorize blob reads"))
    try:
        with TestClient(app) as client:
            client.headers["Authorization"] = "Bearer " + settings.api_token.get_secret_value()
            for path in (f"artifacts/{value.id}/download", "artifacts/malformed", "artifacts"):
                response = client.get("/api/v1/projects/p/" + path)
                assert response.status_code == 500 and response.json()["error_code"] == "INTEGRITY_FAILED"
                assert "must-not-echo" not in response.text and "private-missing" not in response.text
    finally:
        app.state.db.engine.dispose()

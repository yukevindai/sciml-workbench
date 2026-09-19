"""C06 typed receipts, scoped live search and independent public API use."""
from types import SimpleNamespace

from fastapi.testclient import TestClient
import httpx
import pytest

from workbench.bootstrap import main as provision
from workbench.config import Settings
from workbench.failure_memory import FailureMemory, FailureSearchResult
from workbench.scientific_contracts import FailureReceipt


@pytest.fixture
def memory(tmp_path):
    settings = Settings(_env_file=None, database_url="sqlite://", storage_root=tmp_path,
                        api_token="a" * 48, efm_password="c06-test-password")
    provision(settings)
    provision(settings)  # Replay through the real public operator CLI.
    return FailureMemory(settings)


def project(identifier="p", name="Same name"):
    return SimpleNamespace(id=identifier, name=name, description="C06 synthetic fixture")


def record(title="C06 precipitation", status="failed"):
    return {"title": title, "performed_at": "2026-09-19T00:00:00Z", "status": status,
            "outcomes": "Synthetic software fixture", "uncertainty_notes": "Not an experiment",
            "source": {"kind": "file", "reference": "c06-fixture"}}


def native(memory):
    client = TestClient(memory.app, base_url="http://localhost")
    client.headers["X-EFM-Request"] = "1"
    login = client.post("/api/login", json={"username": memory.settings.efm_username,
                                          "password": memory.settings.efm_password.get_secret_value()})
    assert login.status_code == 200
    client.headers["X-CSRF-Token"] = login.json()["csrf"]
    return client


def test_typed_receipt_replay_conflict_rename_and_logout(memory, monkeypatch):
    calls = []
    post = httpx.AsyncClient.post
    async def traced(client, url, **kwargs):
        response = await post(client, url, **kwargs)
        calls.append((url, response.status_code))
        return response
    monkeypatch.setattr(httpx.AsyncClient, "post", traced)
    first = memory.save(project(), "stable-operation", record())
    assert isinstance(first, FailureReceipt)
    assert first.external_record_id == first.record["id"]
    assert first.external_project_id == first.record["project_id"]
    assert len(first.request_sha256) == 64 and first.state == "confirmed"
    assert calls[-1] == ("/api/logout", 200)
    again = memory.save(project(name="Renamed locally"), "stable-operation", record())
    assert again == first
    assert calls[-1] == ("/api/logout", 200)
    with pytest.raises(httpx.HTTPStatusError) as conflict:
        memory.save(project(), "stable-operation", record("Changed"))
    assert conflict.value.response.status_code == 409
    assert calls[-1] == ("/api/logout", 200)
    found = memory.search(project(), "precipitation")
    assert [r["id"] for r in found.records] == [first.external_record_id]
    assert memory.settings.efm_password.get_secret_value() not in first.model_dump_json()
    assert "csrf" not in first.model_dump_json()


def test_search_scope_filters_limits_and_no_creation(memory):
    absent = memory.search(project("absent"), "anything")
    assert isinstance(absent, FailureSearchResult) and absent.records == []
    assert absent.external_project_id is None and not absent.limit_reached
    assert absent.coverage == "no_project_mapping"
    with native(memory) as client:
        assert client.get("/api/labs").json() == []
        assert client.get("/api/projects").json() == []
        client.post("/api/logout").raise_for_status()
    first = memory.save(project("one"), "same-key", record())
    second = memory.save(project("two"), "same-key", record())
    success = memory.save(project("one"), "success", record("C06 precipitation recovered", "succeeded"))
    assert first.external_record_id != second.external_record_id
    found = memory.search(project("one"), "precipitation", status="failed", limit=1)
    assert found.limit_reached and found.limit == 1
    assert [r["id"] for r in found.records] == [first.external_record_id]
    assert found.source == "live_upstream_project" and found.limitations
    assert found.coverage == "mapped_project"
    assert [r["id"] for r in memory.search(project("one"), status="succeeded").records] == [success.external_record_id]
    assert memory.search(project("one"), "unmatched-term").records == []


def test_independent_native_records_edits_archives_and_receipt_snapshot(memory):
    receipt = memory.save(project(), "original", record())
    with native(memory) as client:
        response = client.post(f"/api/projects/{receipt.external_project_id}/records", json=record("Native independent record"))
        assert response.status_code == 201
        created = response.json()
        changed = {**receipt.record["record"], "title": "Revised by native application"}
        response = client.put(f"/api/records/{receipt.external_record_id}",
                              json={"expected_version": receipt.record["version"], "record": changed})
        assert response.status_code == 200, response.text
        archived = client.post(f"/api/records/{created['id']}/archive", json={"expected_version": created["version"], "archived": True})
        assert archived.status_code == 200
        client.post("/api/logout").raise_for_status()
    assert receipt.record["record"]["title"] == "C06 precipitation"
    found = memory.search(project(), "Revised")
    assert found.records[0]["id"] == receipt.external_record_id
    assert memory.search(project(), "independent").records == []
    assert memory.search(project(), "independent", archived=True).records[0]["id"] == created["id"]
    # Replay resolves the original ID but returns its current upstream snapshot.
    replayed = memory.save(project(), "original", record())
    assert replayed.external_record_id == receipt.external_record_id
    assert replayed.request_sha256 == receipt.request_sha256
    assert replayed.record["record"]["title"] == "Revised by native application"


@pytest.mark.parametrize("filters", [{"limit": 201}, {"limit": True}, {"status": "invented"},
                                     {"archived": "false"}, {"query": "x" * 1001}])
def test_invalid_search_has_no_upstream_io(memory, monkeypatch, filters):
    def forbidden(*args, **kwargs):
        pytest.fail("Invalid search must fail before creating an HTTP client")
    monkeypatch.setattr(httpx, "AsyncClient", forbidden)
    with pytest.raises(ValueError):
        memory.search(project(), **filters)


def test_ambiguous_remote_mapping_fails_instead_of_mixing_projects(memory):
    receipt = memory.save(project(), "original", record())
    with native(memory) as client:
        projects = client.get("/api/projects").json()
        lab = next(p["lab_id"] for p in projects if p["id"] == receipt.external_project_id)
        assert client.post(f"/api/labs/{lab}/projects", json={"name": "Duplicate [p]"}).status_code == 201
        client.post("/api/logout").raise_for_status()
    with pytest.raises(ValueError, match="Ambiguous"):
        memory.search(project())
    with pytest.raises(ValueError, match="Ambiguous"):
        memory.save(project(), "new", record())


@pytest.mark.parametrize("code", [404, 503])
def test_missing_or_unavailable_search_is_not_an_empty_success(memory, monkeypatch, code):
    memory.save(project(), "original", record())
    get = httpx.AsyncClient.get
    async def unavailable(client, url, **kwargs):
        if url == "/api/search":
            return httpx.Response(code, request=httpx.Request("GET", "http://localhost/api/search"))
        return await get(client, url, **kwargs)
    monkeypatch.setattr(httpx.AsyncClient, "get", unavailable)
    with pytest.raises(httpx.HTTPStatusError) as caught:
        memory.search(project())
    assert caught.value.response.status_code == code

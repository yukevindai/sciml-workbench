"""Failure Memory's public CLI-provisioned ASGI/JSON boundary only."""
import asyncio
from contextlib import asynccontextmanager
from copy import deepcopy
import os
import json
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field, JsonValue

from .request_identity import request_digest
from .scientific_contracts import FailureReceipt


class FailureSearchResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: Literal["live_upstream_project"] = "live_upstream_project"
    coverage: Literal["mapped_project", "no_project_mapping"]
    project_id: str
    external_project_id: str | None
    records: list[dict[str, JsonValue]] = Field(max_length=200)
    limit: int = Field(ge=1, le=200)
    limit_reached: bool
    limitations: list[str] = Field(default_factory=lambda: [
        "Lexical matching, not semantic search; no pagination cursor.",
        "Upstream rejects scopes exceeding 10000 records; results are not an exhaustive history.",
        "Live upstream records may differ from previously saved workbench snapshots.",
    ])


class FailureMemory:
    def __init__(self, settings):
        from failure_memory.app import create_app
        self.settings = settings
        self.app = create_app(settings.storage_root / "failure-memory.sqlite", "http://localhost", False)

    @asynccontextmanager
    async def session(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app),
                                    base_url="http://localhost", timeout=30) as client:
            client.headers["X-EFM-Request"] = "1"
            login = await client.post("/api/login", json={
                "username": self.settings.efm_username,
                "password": self.settings.efm_password.get_secret_value(),
            })
            login.raise_for_status()
            client.headers["X-CSRF-Token"] = login.json()["csrf"]
            try:
                yield client
            except BaseException:
                # Attempt logout without replacing a primary import/search error.
                try:
                    (await client.post("/api/logout")).raise_for_status()
                except httpx.HTTPError:
                    pass
                raise
            else:
                (await client.post("/api/logout")).raise_for_status()

    async def remote_project(self, client, project, *, create):
        labs = await client.get("/api/labs")
        labs.raise_for_status()
        matches = [lab for lab in labs.json() if lab["name"] == "SciML Workbench"]
        if len(matches) > 1:
            raise ValueError("Ambiguous Failure Memory lab; reconcile its identity before proceeding")
        if not matches:
            if not create:
                return None
            response = await client.post("/api/labs", json={"name": "SciML Workbench"})
            response.raise_for_status()
            matches = [response.json()]
        lab = matches[0]
        response = await client.get("/api/projects")
        response.raise_for_status()
        suffix = f" [{project.id}]"
        matches = [item for item in response.json()
                   if item["lab_id"] == lab["id"] and item["name"].endswith(suffix)]
        if len(matches) > 1:
            raise ValueError("Ambiguous Failure Memory project; reconcile its identity before proceeding")
        if matches or not create:
            return matches[0] if matches else None
        response = await client.post(f"/api/labs/{lab['id']}/projects", json={
            "name": f"{project.name[:100]}{suffix}", "description": project.description,
        })
        response.raise_for_status()
        return response.json()

    async def _save_async(self, project, external_id, record) -> FailureReceipt:
        if not isinstance(external_id, str) or not external_id or external_id != external_id.strip() or len(external_id) > 160:
            raise ValueError("Failure import requires a stable external ID of 1–160 characters")
        payload = {"schema_version": "1.0", "connector": "sciml-workbench",
                   "external_id": external_id, "record": deepcopy(record)}
        digest = request_digest("failure_import", {"project_id": project.id, "import": payload})
        async with self.session() as client:
            remote = await self.remote_project(client, project, create=True)
            response = await client.post(f"/api/projects/{remote['id']}/import", json=payload)
            response.raise_for_status()
            snapshot = response.json()["record"]
            if snapshot["project_id"] != remote["id"]:
                raise ValueError("Failure Memory returned a record outside the selected project")
            return FailureReceipt(external_id=external_id, request_sha256=digest,
                                  external_project_id=remote["id"], external_record_id=snapshot["id"], record=snapshot)

    def save(self, project, external_id, record) -> FailureReceipt:
        return self._locked(self._save_async, project, external_id, record)

    def _locked(self, operation, *args):
        # Serialize provisioning/import in the supported single-host topology.
        with (self.settings.storage_root / ".failure-memory.lock").open("a+b") as lock:
            if os.name == "posix":
                import fcntl
                fcntl.flock(lock, fcntl.LOCK_EX)
            else:
                import msvcrt
                if lock.tell() == 0:
                    lock.write(b"\0")
                    lock.flush()
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
            return asyncio.run(operation(*args))

    async def _resolve(self, project):
        async with self.session() as client:
            return (await self.remote_project(client, project, create=True))["id"]

    def resolve(self, project):
        return self._locked(self._resolve, project)

    async def _import_exact(self, project_id, remote_id, body):
        payload = json.loads(body)
        digest = request_digest("failure_import", {"project_id": project_id, "import": payload})
        async with self.session() as client:
            response = await client.post(f"/api/projects/{remote_id}/import", content=body.encode("utf-8"),
                                         headers={"Content-Type": "application/json"})
            response.raise_for_status()
            snapshot = response.json()["record"]
            if snapshot["project_id"] != remote_id:
                raise ValueError("Failure Memory returned a record outside the selected project")
            return FailureReceipt(external_id=payload["external_id"], request_sha256=digest,
                                  external_project_id=remote_id, external_record_id=snapshot["id"], record=snapshot)

    def import_exact(self, project_id, remote_id, body):
        """Trusted journal caller supplies the persisted destination and exact body."""
        return self._locked(self._import_exact, project_id, remote_id, body)

    async def search_async(self, project, query="", *, status=None, archived=False, limit=50) -> FailureSearchResult:
        # Validate before authentication or any possible upstream IO.
        if (not isinstance(query, str) or len(query) > 1000 or type(limit) is not int or not 1 <= limit <= 200
                or type(archived) is not bool or (status is not None and not isinstance(status, str))
                or status not in {None, "failed", "partial", "succeeded", "inconclusive"}):
            raise ValueError("Invalid Failure Memory search filters")
        async with self.session() as client:
            remote = await self.remote_project(client, project, create=False)
            records = []
            if remote:
                params = {"project_id": remote["id"], "q": query, "archived": archived, "limit": limit}
                if status is not None:
                    params["status"] = status
                response = await client.get("/api/search", params=params)
                response.raise_for_status()
                records = response.json()
                if (not isinstance(records, list) or len(records) > limit
                        or any(not isinstance(record, dict) or record.get("project_id") != remote["id"] for record in records)):
                    raise ValueError("Failure Memory returned results outside the selected project")
            return FailureSearchResult(project_id=project.id, external_project_id=remote["id"] if remote else None,
                                       coverage="mapped_project" if remote else "no_project_mapping",
                                       records=records, limit=limit, limit_reached=len(records) == limit)

    def search(self, project, query="", *, status=None, archived=False, limit=50) -> FailureSearchResult:
        """Caller must resolve an authorized workbench project before invoking."""
        return asyncio.run(self.search_async(project, query, status=status, archived=archived, limit=limit))

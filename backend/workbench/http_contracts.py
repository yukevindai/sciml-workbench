"""Public responses; internal ownership/leases/secrets are deliberately absent."""

from typing import Literal
from pydantic import AwareDatetime

from .contract_core import ContractModel, ErrorCode, Identifier


class ProjectResponse(ContractModel):
    id: Identifier
    name: str
    description: str


class LegacyJobResponse(ContractModel):
    id: Identifier
    project_id: Identifier
    kind: Literal["audit", "split", "benchmark", "evidence", "failure", "report"]
    state: Literal["queued", "running", "succeeded", "failed"]
    result_id: Identifier | None
    error: str | None
    created_at: AwareDatetime
    started_at: AwareDatetime | None
    finished_at: AwareDatetime | None


class JobResponse(LegacyJobResponse):
    kind: Literal["audit", "split", "benchmark", "evidence", "failure", "report", "report_verify", "scientific_replay"]
    error_code: ErrorCode | None = None
    retry_of_job_id: Identifier | None = None
    deadline_at: AwareDatetime | None = None

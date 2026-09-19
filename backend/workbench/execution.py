"""Private process messages. These are not HTTP or persisted artifact contracts."""

from pathlib import Path
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator
from .contract_core import ErrorCode

MAX_RESULT_BYTES = 32 * 1024 * 1024


class Work(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job_id: str
    result_id: str
    project_id: str
    kind: Literal["audit", "split", "benchmark", "evidence", "failure", "report"]
    payload: dict
    artifacts: dict[str, dict] = Field(default_factory=dict)
    project: dict | None = None
    report: dict | None = None
    external_import: str | None = None
    external_project_id: str | None = None


class TaskSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    storage_root: Path
    efm_username: str = "workbench"
    efm_password: SecretStr = SecretStr("")


class TaskResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    artifact: dict | None = None
    receipt: dict | None = None
    external_project_id: str | None = None
    error: str | None = Field(default=None, max_length=1500)
    error_code: ErrorCode | None = None

    @model_validator(mode="after")
    def one_outcome(self):
        if self.external_project_id is not None and (self.artifact is not None or self.receipt is not None):
            raise ValueError("Conflicting task outcomes")
        if self.receipt is not None and self.artifact is None:
            raise ValueError("Receipt requires an import result")
        if self.artifact is not None or self.external_project_id is not None:
            if self.error is not None or self.error_code is not None:
                raise ValueError("Conflicting task outcomes")
        elif not self.error or not self.error_code:
            raise ValueError("Missing task outcome")
        return self


class TaskFailure(ValueError):
    def __init__(self, message, code="WORKER_INTERRUPTED"):
        super().__init__(message)
        self.error_code = code

"""Public responses; internal ownership/leases/secrets are deliberately absent."""

from typing import Annotated, Literal
from pydantic import Field
from .contracts import Audit, Benchmark, Dataset, Evidence, Failure, Provenance, Report, Split
from .scientific_contracts import DatasetV2, FailureV2, EvaluationProtocol, ClaimSet
from .research_contracts import AgentExecutionRecord
from .contract_core import Digest

IntakeDataset = Annotated[Dataset | DatasetV2, Field(discriminator="schema_version")]
IntakeFailure = Annotated[Failure | FailureV2, Field(discriminator="schema_version")]
IntakeArtifact = Annotated[IntakeDataset | Audit | Split | Benchmark | Evidence | IntakeFailure | Provenance | Report | EvaluationProtocol | ClaimSet | AgentExecutionRecord,
                           Field(discriminator="kind")]
from pydantic import AwareDatetime

from .contract_core import ContractModel, ErrorCode, Identifier


class ProjectResponse(ContractModel):
    id: Identifier
    name: str
    description: str


class MaterialResponse(ContractModel):
    id: Identifier
    project_id: Identifier
    filename: str
    media_type: Literal["text/csv", "application/pdf"]
    sha256: Digest
    dataset_id: Identifier | None


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

"""Stable workbench envelopes; namespaced upstream results are retained verbatim."""

from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import uuid4
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator


def uid():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc)


class Strict(BaseModel):
    model_config = ConfigDict(
        extra="forbid", allow_inf_nan=False, str_strip_whitespace=True,
        json_schema_serialization_defaults_required=True,
    )


class Source(Strict):
    citation: str = Field(min_length=1, max_length=2000)
    url: str = Field(default="Not supplied", max_length=2000)
    license: str = Field(min_length=1, max_length=200)
    data_kind: Literal["empirical", "synthetic"]
    transformations: str = Field(min_length=1, max_length=3000)


class Envelope(Strict):
    schema_version: Literal["1.0"] = "1.0"
    id: str = Field(default_factory=uid)
    project_id: str
    created_at: datetime = Field(default_factory=now)
    parents: list[str] = Field(default_factory=list)
    software: dict[str, str] = Field(default_factory=dict)


class Dataset(Envelope):
    kind: Literal["dataset"] = "dataset"
    filename: str
    blob_key: str
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    rows: int = Field(gt=0)
    columns: list[str]
    source: Source


class Audit(Envelope):
    kind: Literal["audit"] = "audit"
    dataset_id: str
    config: dict
    result: dict


class Split(Envelope):
    kind: Literal["split"] = "split"
    dataset_id: str
    audit_id: str
    config: dict
    assignments: list[Literal["train", "validation", "test", "excluded"]]
    result: dict


class Benchmark(Envelope):
    kind: Literal["benchmark"] = "benchmark"
    dataset_id: str
    split_id: str
    model: Literal["mean", "ridge"]
    seed: int
    status: Literal["succeeded", "failed"]
    result: dict = Field(default_factory=dict)
    error: str | None = None
    bundle_key: str | None = None
    config: dict


class Evidence(Envelope):
    kind: Literal["evidence"] = "evidence"
    title: str
    pdf_key: str
    sha256: str
    result: dict
    bundle_key: str


class Failure(Envelope):
    kind: Literal["failure"] = "failure"
    benchmark_id: str
    external_project_id: str
    external_record_id: str
    reason: str
    record: dict


class Provenance(Envelope):
    kind: Literal["provenance"] = "provenance"
    activity: str
    inputs: list[str]
    outputs: list[str]
    parameters: dict


class Report(Envelope):
    kind: Literal["report"] = "report"
    blob_key: str
    sha256: str
    artifact_ids: list[str]


Artifact = Annotated[
    Dataset | Audit | Split | Benchmark | Evidence | Failure | Provenance | Report,
    Field(discriminator="kind"),
]
artifact_adapter = TypeAdapter(Artifact)


class ProjectInput(Strict):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)


class AuditInput(Strict):
    dataset_id: str
    config: dict = Field(default_factory=dict)


class SplitInput(Strict):
    dataset_id: str
    audit_id: str
    config: dict


class BenchmarkInput(Strict):
    dataset_id: str
    split_id: str
    target: str = Field(min_length=1)
    numeric_features: list[str] = Field(min_length=1)
    categorical_features: list[str] = Field(default_factory=list)
    row_id: str = Field(min_length=1)
    group_columns: list[str] = Field(min_length=1)
    units: dict[str, str]
    independence_unit: str = Field(min_length=1)
    independence_status: Literal["documented", "proxy", "synthetic"]
    independence_rationale: str = Field(min_length=1)
    generalization: str = Field(min_length=1)
    limitations: list[str] = Field(min_length=1)
    domain: Literal[
        "batteries",
        "electrolytes",
        "adsorption",
        "catalysis",
        "separations",
        "thermodynamics",
        "transport",
        "materials",
        "process_optimization",
    ] = "materials"
    accepted_warnings: dict[str, str] = Field(default_factory=dict)
    model: Literal["mean", "ridge"] = "ridge"
    seed: int = Field(default=0, ge=0, lt=2**32)

    @model_validator(mode="after")
    def declarations(self):
        if any(not x.strip() for x in self.accepted_warnings.values()):
            raise ValueError(
                "Every accepted warning requires a scientific justification"
            )
        if self.target in self.numeric_features + self.categorical_features:
            raise ValueError("Target cannot be a feature")
        return self


class FailureInput(Strict):
    benchmark_id: str
    reason: str = Field(min_length=1, max_length=3000)
    uncertainty_notes: str = Field(min_length=1, max_length=3000)

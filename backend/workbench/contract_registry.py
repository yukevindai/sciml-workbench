"""Explicit kind/version readers. Registration does not enable a writer or tool."""

from types import MappingProxyType
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field, TypeAdapter

from . import contracts as legacy
from .contract_core import finite_json
from .research_contracts import AgentExecutionRecord
from .scientific_contracts import ClaimSet, DatasetV2, EvaluationProtocol, FailureV2

LEGACY_MODELS = (
    legacy.Dataset, legacy.Audit, legacy.Split, legacy.Benchmark,
    legacy.Evidence, legacy.Failure, legacy.Provenance, legacy.Report,
)
NEW_ARTIFACT_MODELS = (DatasetV2, FailureV2, ClaimSet, EvaluationProtocol, AgentExecutionRecord)
ARTIFACT_READERS = MappingProxyType({
    (model.model_fields["kind"].default, model.model_fields["schema_version"].default): model
    for model in (*LEGACY_MODELS, *NEW_ARTIFACT_MODELS)
})

VersionedDataset = Annotated[legacy.Dataset | DatasetV2, Field(discriminator="schema_version")]
VersionedFailure = Annotated[legacy.Failure | FailureV2, Field(discriminator="schema_version")]


def require_discriminators(payload):
    value = payload.model_dump(mode="json") if isinstance(payload, BaseModel) else payload
    if not isinstance(value, dict):
        raise ValueError("Artifact must be a JSON object")
    kind, version = value.get("kind"), value.get("schema_version")
    if not isinstance(kind, str) or not isinstance(version, str) or (kind, version) not in ARTIFACT_READERS:
        raise ValueError("Unsupported or missing artifact kind/schema_version")
    finite_json(value)
    return payload


VersionedArtifact = Annotated[
    VersionedDataset | legacy.Audit | legacy.Split | legacy.Benchmark | legacy.Evidence
    | VersionedFailure | legacy.Provenance | legacy.Report | ClaimSet | EvaluationProtocol
    | AgentExecutionRecord,
    Field(discriminator="kind", json_schema_extra={"type": "object", "required": ["kind", "schema_version"]}),
    BeforeValidator(require_discriminators),
]
versioned_artifact_adapter = TypeAdapter(VersionedArtifact)
legacy_artifact_adapter = legacy.artifact_adapter


def read_artifact(payload):
    """Require both discriminators; never infer a new record's version or migrate it."""
    require_discriminators(payload)
    return versioned_artifact_adapter.validate_python(payload)

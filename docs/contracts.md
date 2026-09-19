# Versioned contracts

Pydantic definitions are authoritative. Generated JSON Schema, OpenAPI, TypeScript, and browser validators are checked into Git. B01 publishes the shapes needed by subsequent tickets; it does not introduce agent execution, new persistence tables, or new scientific methods.

## Ownership and generated files

| Source | Responsibility | Generated output |
|---|---|---|
| `backend/workbench/contracts.py` | Existing eight 1.0 artifact types and manual operation requests | Existing `contracts/v1/{kind}.json`, unchanged |
| `scientific_contracts.py` | Dataset 2.0, Failure 2.0, evidence/metric references, claim sets and evaluation protocols | `contracts/v2/`, new files in `contracts/v1/`, `contracts/records/v1/` |
| `research_contracts.py` | Runs, plans, assignments, questions, control requests, tool envelopes/descriptors, usage, safe events, agent execution records | Versioned record schemas and `contracts/v1/agent_execution.json` |
| `contract_core.py` | Shared scalar constraints, policy references, error vocabulary/envelope | Shared definitions in the catalog and referencing schemas |
| `contract_registry.py` | Explicit artifact kind/version dispatch | `VersionedArtifact` in the schema catalog and generated TypeScript |
| `http_contracts.py`, `api.py` | Implemented route request/response shapes | `contracts/openapi.json`, `contracts/http-responses.json` |
| `schema_catalog.py` | Export inventory and OpenAPI components | `contracts/catalog.json` |

The protected `GET /api/v1/schema` serves the actual OpenAPI document, including named new contract components. It advertises only implemented routes. A component's presence does not enable an endpoint, authorize an operation, or advertise a tested provider.

Frontend generated files live under `frontend/app/lib/generated/`. `contracts.ts` contains input/storage contract types; `http.ts` describes serialized responses, including server-populated defaults. `validators.cjs` and its declarations contain precompiled response validators. No remote schema lookup or runtime schema compilation is needed in the browser. Generation resolves only local schema references.

`frontend/app/lib/types.ts` aliases the generated wire types. Local audit/split form configuration and checked display projections are separate from authoritative artifact shapes. `api()` requires a response decoder, so a generic TypeScript cast cannot silently install an invalid HTTP payload as application state. Upstream result dictionaries remain opaque; display helpers inspect supported fields without changing the original artifact.

## Regeneration and drift checks

From the repository root, using the installed backend environment:

```bash
python scripts/export_schemas.py
npm --prefix frontend run contracts:generate
```

Review and commit both source changes and generated outputs together. To check without rewriting files:

```bash
python scripts/export_schemas.py --check
npm --prefix frontend run contracts:check
pytest backend/tests/test_contracts.py -q
npm --prefix frontend run test:contracts
npm --prefix frontend run build
```

On Windows, substitute `.venv\Scripts\python.exe` and `npm.cmd` as appropriate. Text checks normalize checkout line endings. Python export checks also reject unexpected JSON schema files, so removing a registry entry cannot leave an unnoticed stale schema behind. The export constructs an isolated API instance for its OpenAPI metadata; it does not connect to the research database, provision Failure Memory, run science, or call a provider.

CI runs both drift checks and the frontend contract tests in addition to its backend and application checks. Browser validation uses pinned Ajv and ajv-formats; TypeScript generation uses pinned json-schema-to-typescript. The npm lockfile retains their resolution.

## Version selection and migration rules

Artifact versions, runtime record versions, HTTP API versions, upstream versions, and archive manifest versions are independent.

1. The eight legacy validation schemas and their stored meaning remain unchanged. Frozen fixtures cover dataset, audit, split, benchmark, evidence, failure, provenance, and report, with schema digests tied to baseline `efea153`.
2. Existing imports from `workbench.contracts` and its kind-only `artifact_adapter` remain legacy-only. They reject new major versions. The serialization-schema setting now marks emitted defaults as required in response schemas; it does not change legacy validation schemas or payload serialization.
3. `workbench.contract_registry.read_artifact()` and `versioned_artifact_adapter` require explicit `kind` and `schema_version`. They select among 13 registered pairs, reject unknown/missing discriminators and non-finite numeric values, and never rewrite input payloads. The explicit legacy reader still supports its historical defaults when a legacy caller omits a version.
4. Dataset and failure keep their artifact kinds and use version `2.0`. Claim sets, evaluation protocols, and agent execution records introduce new kinds at `1.0`. Standalone evidence references and runtime records use a `contract` name plus their own `schema_version`.
5. Do not mutate old database JSON, backfill invented facts, or globally route legacy code through a new writer. Before B03 or another producer emits new versions, update its scoped storage/read, adapter, report/replay, and frontend consumers together. The current manual API and report/replay path still produce/consume legacy artifacts. B01's registry is available for that integration; it does not silently enable it.
6. Unknown major versions fail explicitly. Even additive fields can break strict readers; introduce an explicit contract revision and compatibility policy rather than relying on clients ignoring extra fields. Preserve the old reader and immutable source record during any migration. Derived projections need their own identity/provenance and must not masquerade as updated originals.
7. No database migration or new environment variable is required by B01. B02/B11 own persistence changes. The current archive manifest remains 1.0; C08/C09 own expanded manifest 2.0 assembly and compatibility/replay integration.

## Scientific record semantics

Dataset 2.0 preserves exact-byte `sha256`/`blob_key`, original header spelling, row count, and source declarations. Each declaration is discriminated by origin:

- `unknown`: value is null; it is never silently synthetic or licensed.
- `user_supplied`: a typed non-null value and user-message/operator-assertion reference.
- `source_derived`: a typed non-null value and source-span/artifact reference.
- `inferred`: a typed non-null value, supporting reference, rationale, uncertainty, and optional bounded confidence.

`unresolved_fields` must exactly match the declarations whose origin is unknown. Inferred values remain inferred; they do not become confirmed facts by satisfying a schema. Units, target, and grouping reference exact column names. Structural checks cannot establish a license, independence, or scientific validity: B03/C01/C11 and the dispatcher must resolve references and apply scientific admission.

Failure 2.0 has a discriminated human or agent actor. Agent actors require run/action, provider/model/prompt, and policy/rule attribution. A human session reference is an opaque audit reference, never the session cookie. The observation records an admission/execution error, a missed predeclared criterion, or a human assessment. Agent actors cannot assert a researcher assessment; cancellation and provider/policy errors are not valid scientific failure codes. Criterion observations must actually miss their numerical threshold and reference the assessed benchmark. Verifying that a criterion was declared before results existed belongs to C07/C12, not shape validation.

Published Failure 2.0 requires a confirmed supported upstream receipt and exact request digest. Unknown import outcomes belong to B07's operation journal and must not be turned into confirmed failure artifacts. Hypotheses remain separate from observed errors/criteria.

Available evidence references require source/representation/excerpt SHA-256 values, extraction version, and a nonempty Unicode-code-point interval. The convention is `[start, end)` in the exact preserved extracted UTF-8 text representation: do not normalize newlines after hashing. Hash the UTF-8 encoding of that exact substring for `excerpt_sha256`. Include `page` only when extraction establishes a reliable mapping; otherwise it is null. Unavailable evidence has a reason and source identity, with no invented locator or page. C11 resolves offsets against preserved text and verifies hashes.

Metric `field_path` uses JSON Pointer syntax, including `~0` and `~1` escapes. Claim contracts distinguish reference consistency from semantic review. A valid pointer alone is not evidence that a statement is scientifically supported. Evaluation contracts capture candidates, target/features, fingerprints, selection rule, seal/release timestamps, and exposure history. C12 must enforce these across every access path and check the installed upstream capability.

Pydantic cross-field checks include unresolved declarations, actor/observation compatibility, criterion comparison, plan acyclicity, reviewer read-only tools, budget allocation bounds, and protocol/record consistency. JSON Schema and generated browser validators enforce structural constraints; they do not duplicate every Python cross-field validator, query project ownership, redact arbitrary text, or enforce authorization. Consumers must still call server services. Integer counters/revisions stay within JavaScript's exact-integer range. New stored timestamps are timezone-aware.

## API compatibility and errors

The manual routes now declare response models. Project/artifact/job shapes remain compatible; queued scientific jobs keep the same four states. Known UTC job timestamps read from SQLite regain their UTC offset in the response projection, without changing stored records. The richer future `JobResponse` is published separately from the current `LegacyJobResponse` and is not advertised as implemented by current routes.

Errors preserve the original string `error` and validation `details` array. They add stable `error_code` and a server-generated `request_id`; normal API responses also include `X-Request-ID`. Codes cover authorization, lookup, validation, lineage, idempotency, runtime, integrity, and future agent failures. The error schema publishes the vocabulary; a future code does not imply its service exists. Validation errors omit input values; unexpected failures use a fixed safe message. Diagnostic IDs are correlation references, not credentials.

Future run/control contracts contain expected revisions, not writable checkpoints, leases, or arbitrary tool permissions. Tool arguments/results remain bounded by the eventual typed E03 dispatcher; their transport envelopes are not permission to execute arbitrary JSON. E01 owns policy semantics/defaults, E05 owns atomic accounting, B12 owns route/state transitions, and E14 owns exposure/redaction. B01 schemas provide shared shapes for those services.

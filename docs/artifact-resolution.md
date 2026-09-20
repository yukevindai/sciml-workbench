# Artifact resolution and download authority

`workbench.artifacts.ArtifactResolver` is the shared metadata boundary for artifact reads, dependency checks and candidate publication. It is used by API list/detail/download, submission admission/replay, worker input preparation, checked artifact writes and project report capture. `services.artifact` remains a compatibility wrapper. `services.DomainError` remains import-compatible; its definition now lives in `errors.py` to avoid circular service dependencies.

## Resolution rules

- Direct lookup requires an artifact record in the requested project. Missing and cross-project roots both return 404 `ARTIFACT_NOT_FOUND`; a requested wrong kind returns 422 `LINEAGE_MISMATCH`.
- Stored payload identity, project and kind must agree with the metadata row, and explicit schema dispatch must succeed. Invalid stored payloads return safe 500 `INTEGRITY_FAILED` errors without echoing their contents.
- Dependencies include `parents` plus workbench-typed references: audit dataset; split dataset/audit; benchmark dataset/split; failure benchmark; provenance inputs/outputs; report artifact IDs; and Dataset 2.0 declaration references explicitly typed as artifacts. Missing, cross-project and wrong-kind dependencies are integrity failures, including when a legacy record omits its redundant `parents` entry.
- Split/audit and benchmark/split datasets must agree. Benchmark configuration dataset/split IDs, when present, must agree with the envelope. Original blob keys must match their recorded SHA-256. Referenced blob keys must have canonical digest syntax; storage still verifies actual bytes on read.
- Explicit allowlists cover every resolved artifact, including transitive dependencies, and are checked on replay. An allowlist does not override project ownership. Material scope is checked independently; CSV bindings must resolve a same-project dataset with the same exact-byte digest.
- Traversal is iterative, detects cycles and rejects duplicate parents. A resolver allows at most 10,000 unique artifacts and 256 traversal levels. Limit failures use 422 `UNSUPPORTED_CAPABILITY`. Cached values are confined to that resolver and its fixed scope; there is no cross-request authority cache.

`closure(roots)` returns the validated dependency closure for later scoped capture consumers. It does not promise topological ordering or a transactional report/publication snapshot. Typed relationships are checked without rewriting old records, adding fabricated parent entries or altering their schema versions. Opaque upstream result/config/record dictionaries are not scanned for arbitrary strings that resemble IDs; only known workbench reference fields are interpreted.

The runtime supports the eight original artifact kinds at 1.0 plus Dataset 2.0, Failure 2.0, EvaluationProtocol 1.0 and ClaimSet 1.0. C07 resolves outcome benchmark/protocol dependencies and checks source jobs, objective observations and predeclared criteria; see [unsuccessful outcomes](unsuccessful-outcomes.md). C11 resolves named source anchors and claim dependencies; its [reference service](evidence-references.md) verifies exact bytes/offsets and metric values. C12's [read boundary](evaluation-exposure.md) enforces evaluation exposure separately from graph resolution. Other B01 contracts remain shape-only. Unknown versions, missing anchors and out-of-scope dependencies fail closed. Valid references do not establish semantic support or scientific independence.

## Publication and operations

`operation_inputs` centralizes typed input resolution and checks that user-selected dataset/audit/split references agree. New requests with conflicting selections return `LINEAGE_MISMATCH`; a broken already-stored parent chain is an integrity error. Checked `save` validates candidate contracts and their complete graph against persisted or pending same-transaction records before adding the candidate.

Worker publication additionally binds result IDs, kind, project, parent set, typed input references and operation-owned configuration to the accepted detached work. A result cannot substitute another valid same-project dataset, alter audit/split configuration, change benchmark selection, or return a PDF/report for different inputs. Failure rolls back candidate/provenance publication. The [B08 publication service](publication.md) now owns claim validation, output-byte preflight, authoritative input comparison and the atomic artifact/provenance/terminal transaction.

Reports validate included artifact graphs and material bindings before reading blobs. B06 now provides [frozen project and selected-run capture](report-capture.md); C08/C09 own further archive validation and replay semantics. Old archives are not rewritten.

## Authenticated downloads

`GET /api/v1/projects/{pid}/artifacts/{aid}/download` still requires bearer authentication and resolves the scoped artifact and its lineage before asking storage for bytes. There is no raw blob-key download route.

The optional `representation` query is `default`, `original` or `bundle`:

| Kind | Default | Original | Bundle |
|---|---|---|---|
| Dataset | CSV | Exact uploaded CSV | Unavailable |
| Evidence | ZIP bundle | Exact original PDF | ZIP bundle |
| Benchmark | ZIP bundle, if present | Unavailable | ZIP bundle, if present |
| Report | ZIP archive | ZIP archive | ZIP archive |
| Other artifact kinds | Unavailable | Unavailable | Unavailable |

Unavailable representations return 404; invalid selector values return 422. Media type and extension derive from the resolved representation. Download filenames use a sanitized artifact/material identifier, never the uploaded filename or storage path. Original material downloads similarly validate the project binding and dataset relationship. Storage-integrity and unavailable-volume failures retain D02's 500/503 codes.

No migration, environment variable or dependency change is required. OpenAPI adds only the optional representation selector; existing download URLs retain their meaning. B09 owns pagination/projections and E03/C12 own agent exposure controls beyond these input scopes.

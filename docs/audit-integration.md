# ChemData Auditor integration (C02)

`workbench.adapters.run_audit(csv_bytes, config)` calls the pinned public `chemdata_auditor.AuditConfig` and `audit` APIs and returns a typed `AuditOutput`. It performs no dataset repair or scientific admission. Callers resolve authorized immutable inputs before execution; the adapter has no database, project lookup or publication authority.

## Result boundary

| Field | Meaning |
|---|---|
| `execution_status` | Always `completed` for a returned result, including results with error-severity findings. Invalid inputs raise instead. |
| `scientific_acceptance` | Always `not_assessed`. Neither empty findings nor successful execution certifies validity or benchmark admission. |
| `source_sha256` | SHA-256 of exact input CSV bytes. This is distinct from the upstream dataframe fingerprint. |
| `config` | Detached copy of requested configuration, without silently filling or replacing user options. |
| `result` | Typed upstream report: `n_rows`, findings, checks run/skipped, and full metadata. Serialization preserves the public `to_dict()` result. |

Each finding retains its code, severity, column names, complete zero-based row positions, message, suggestion and details. Upstream metadata retains effective configuration/defaults, dependency versions, fingerprint format, canonical unit declarations and interpretation limits. Neither strings nor column names are trimmed by these internal models. Scientific checks, numerical behavior and result generation remain upstream; the types only validate transport shape.

Configuration is copied before calling upstream so nested mutable caller data is not shared with the result. Invalid options, invalid bounds or missing configured columns raise `AuditInputError`, classified as `VALIDATION_FAILED` by the existing task/worker path. No successful audit artifact is published for these execution failures. Runtime output limits and worker deadlines remain unchanged.

## Manual and scoped callers

The existing manual `POST /api/v1/projects/{p}/audit` and trusted `SubmissionService` action path both queue work for the same scientific worker. `services.execute` consumes the typed output and stores the requested configuration and verbatim serialized upstream report in the unchanged Audit 1.0 artifact. Dataset lineage, job completion and idempotency remain service responsibilities.

Future agent tools must use the scoped durable submission service rather than execute science inline. C02 verifies that service's action/attempt identity path with real upstream execution; it does not add an agent runtime or tool registry. E03/E04 own that wiring, and A03 owns UI interpretation of findings. Existing manual artifact reads still provide the complete upstream report.

Report replay also consumes the typed adapter and writes the upstream report dictionary, preserving existing replay file shape. No public schema, existing artifact, dependency pin or database migration changes are required. The adapter's Python return type changes from `dict` to `AuditOutput`; repository consumers now use `.result.model_dump(mode="json")` when they need the prior report dictionary.

## Input preservation and verification

The audit parser retains strings with `dtype=str, keep_default_na=False`; text such as `NA` is not silently interpreted as missing, identifiers retain leading zeros, and column spelling remains exact. Parsing a BOM/CRLF CSV does not rewrite the stored original. Unit handling or other upstream in-memory calculations do not authorize a modified upload or new dataset.

Reusable clean/problematic fixtures live in `backend/tests/fixtures/audit/`. Acceptance compares typed output directly with the installed public auditor's serialization and verifies known duplicate, out-of-bounds, invalid-numeric and provenance-gap findings and row positions. Durable tests exercise manual and scoped action submissions, including exact-byte downloads and unchanged Dataset 2.0 unknown source declarations. Invalid configuration produces a failed job without a result artifact.

Run `python -m pytest backend/tests/test_audit_adapter.py -q`. See [C02 acceptance](tickets/C02.md) for additional regression checks and [C01](scientific-public-surface.md) for exact pins and available checks. These tests establish integration behavior, not scientific validity of an arbitrary research dataset.

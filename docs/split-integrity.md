# SciSplit publication and exchange integrity (C03)

The workbench calls the pinned public `SplitConfig` and `split` APIs for all partition design and diagnostics. It validates transport integrity before publishing or exchanging results; it does not implement scientific splitting, regenerate row identities, drop excluded rows, or repair inputs.

## Validated boundaries

- **Execution:** the original CSV SHA-256, storage key, row count and column order must agree with the resolved dataset before splitting. `run_split` preserves requested configuration and validates the public result against the actual parsed row count. Public report configuration must match the effective upstream configuration.
- **Publication:** the worker checks one assignment per dataset row, supported labels, all four positional lists, diagnostic counts and requested configuration before saving the split. Positions must be integer, in range, unique across partitions and aligned with assignments. Every original row must appear exactly once, including excluded rows. Training and test partitions must be nonempty; validation may be empty for a supported two-way split.
- **Benchmark exchange:** request dataset/split IDs must match the supplied artifacts; split dataset/project ownership must match. The exact bytes/digest, row count, column order and full positional cover are checked again. The selected row-ID column must exist and contain unique, nonblank strings. IDs are preserved exactly, including leading zeros. Exchange uses strict `zip` after validation, so unequal lengths cannot truncate silently.
- **Replay:** stored splits are checked against their recorded dataset bytes and row count before running SciSplit. Recomputed assignments must equal stored assignments. The output remains the complete upstream report, including diagnostics, findings and excluded positions.

`split_integrity.py` contains only workbench consistency checks. It does not reproduce an upstream dataframe fingerprint or any split/group/metric algorithm. Dataset SHA-256 binds exact uploaded bytes and order; the upstream `metadata.dataset_sha256` remains its separately labeled dataframe fingerprint. Existing content storage, lineage resolution, job fencing and scoped submission still apply.

## Excluded rows and scientific scope

An explicit temporal/extrapolation `crossing_policy="exclude"` can exclude whole groups crossing a scientific boundary. Workbench retains their labels, positions, diagnostics and upstream findings in the full Split 1.0 artifact. A split with exclusions is not silently converted to a smaller dataset.

The current ChemE benchmark protocol rejects excluded rows and requires nonempty train/validation/test sets. Workbench passes the complete exchange to its public admission gate and preserves that rejection. A successful split therefore does not imply benchmark admission. A deliberate new curated dataset is a separate operation requiring provenance, not a side effect of exchange.

## Available designs and errors

The pinned base installation supports random, formulation, composition, publication, laboratory, cluster, time/temporal and extrapolation designs with valid declared configuration. Scaffold/molecular designs require the optional RDKit chemistry dependency; the base installation does not provide it. Unknown strategy names and missing molecular capability fail with `UNSUPPORTED_CAPABILITY`. Invalid scientific configurations, such as groups crossing a boundary under `crossing_policy="error"`, fail with `VALIDATION_FAILED`.

Inconsistent dataset/partition transport fails with `INTEGRITY_FAILED`. Benchmark execution propagates this as an operational job failure without publishing a misleading scientific rejection artifact. Ordinary upstream benchmark admission errors retain the existing failed-benchmark behavior.

No dependency pin, Split 1.0/public API schema or migration changes. Existing records remain readable; malformed legacy splits can no longer be exchanged/replayed successfully merely because their outer schema parses. New publication always requires complete upstream positions, diagnostics, configuration and findings. The C01 fixture now uses a real Split artifact and explicit request IDs to exercise this boundary.

## Verification

`backend/tests/test_split_integrity.py` runs real public APIs for all nine base strategy names, checks repeatability for fixed seeds/configuration, exercises temporal/extrapolation exclusions, and validates full diagnostics against public serialization. An eight-row boundary fixture retains `005`/`006` as excluded IDs. Corruption tests cover short/long/unknown labels, duplicate/missing/out-of-range/boolean positions, misalignment, wrong counts/configuration, altered digest/row order, mismatched ownership and bad row identities.

Tests also run a real benchmark exchange, the upstream exclusion rejection, durable split publication/read through the API, and report replay with corrupted split cover or changed input order. Corrupt exchange must raise an integrity error rather than return a scientific failure artifact. See [C03 acceptance](tickets/C03.md) for executed checks and limitations. General report archive hardening and numerical replay tolerances remain C09 work; these checks do not establish scientific validity or tamper-proof provenance.

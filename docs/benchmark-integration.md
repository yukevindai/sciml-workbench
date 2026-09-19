# ChemE baseline and run bundle (C04)

The adapter constructs the documented external task card and frozen partitions, then calls the pinned package-root `cheme_benchmarks.prepare` and `run_baseline`. Scientific admission, preprocessing, fitting, candidate selection, prediction and metrics remain upstream. A local task is not a claim of admission to the official benchmark suite.

## Admission and original units

The upstream gate enforces a complete unit declaration, recognized units, disjoint eligible features, target/identity leakage restrictions, preserved independent-unit groups, explicit target declaration in the split, and configured audit findings. Error findings cannot be waived as warnings. Warning acceptance requires explicit code-to-justification entries, which remain in the task card. Unresolved Dataset 2.0 source declarations remain blocked by the existing projector/submission boundary.

The pinned `prepare` implementation replaces audit unit rules with synthetic unit columns populated from the task card. This verifies declared units but would erase a check against **original per-row unit metadata**. When the selected audit config declares unit columns, workbench now calls the public Auditor first, using those columns and the benchmark's requested canonical units (retaining other unit rules and declared aliases).

- Public-Auditor error findings reject the baseline before preparation.
- A `unit_conversion` finding on a modeled numeric feature or target also stops this handoff. Auditor converts only its internal working copy, while the baseline would still receive raw values. A deliberate curated dataset in the declared units is required; workbench does not silently convert uploaded values.
- A successful preflight is retained in `original-units-audit.json`, including the actual findings and effective configuration. Original requested audit rules remain in `benchmark.json`.

This is an admission rule based on public upstream findings, not a replacement unit-conversion algorithm. It is conservative: alternate labels that produce a conversion finding require curation or an appropriate explicit upstream alias declaration even if a researcher expects them to be equivalent. Without declared unit columns, no software check can infer the physical truth of a supplied unit label from bare numbers. Source fields and configured provenance checks likewise do not authenticate a citation, license or scientific independence.

## Complete successful run bundle

The adapter returns the complete upstream result dictionary and a ZIP containing:

| Files | Retained information |
|---|---|
| `data.csv`, `benchmark.json`, `partitions.json` | Exact uploaded bytes, full external card, and C03-validated frozen identities/assignments |
| `original-units-audit.json` (when configured) | Successful public-Auditor check of original unit metadata |
| `prepared/spec.json`, `dataset.csv`, `partitions.json` | Upstream prepared task, exact data and frozen assignments |
| `prepared/audit.json`, `scisplit.json`, `manifest.json` | Full upstream admission audit, split diagnostics, file digests, identity, software and admission status |
| `run/run.json`, `predictions.csv`, `manifest.json` | Run/method identity, seed, selected parameters, validation search, software, scope, metrics, predictions and file digests |

The returned result equals `run/run.json`. Both validation and test metrics and predictions remain present; C04 does not add validation-only execution or implement the C12 exposure boundary. Workbench performs no scientific metric computation. Tests independently check the stored predictions using public `load_prepared` and `score_predictions`.

The persisted Benchmark 1.0 artifact retains the full result, request configuration, lineage and content-addressed bundle reference. Admission failure retains the existing failed artifact behavior: an error with empty result and no run bundle, not zero/fabricated metrics. C07 owns richer unsuccessful-outcome records. C03 transport/storage integrity failures remain operational failures, not scientific rejection artifacts.

## Verification scope

The C04 suite runs both workbench-supported models, `mean` and `ridge`, against the actual installed upstream packages. It checks exact bundle inventory, original/prepared bytes and task cards, manifests, prediction digest, run identity and all returned metrics. Deliberate admission fixtures cover absent/unknown units, incompatible per-row units, conversion requirements, identity-feature leakage, unavailable features, a target-copy warning, grouping mismatch, configured provenance gaps and a missing source field. Explicit warning acceptance is verified separately.

A durable API/worker fixture verifies that an audit containing incompatible-unit findings can complete, but its subsequent baseline fails without metrics or bundle; an attempted warning waiver cannot override the unit error, and original downloads remain byte-identical. All data are synthetic software fixtures, not new empirical evidence. See [C04 acceptance](tickets/C04.md) for results and unrun checks.

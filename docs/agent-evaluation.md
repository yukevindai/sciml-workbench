# Agent evaluation discipline (E12)

`agent_evaluation.selection_view` is the shared agent-facing consumer of C12's
sealed protocols and filtered results. It accepts only trusted selection scopes;
all defined agent roles receive the same quarantine. Role names, reviewer status
and release of a comparison never authorize test data during selection.

Views explicitly label the operation a **predeclared comparison**, state that
validation and test were computed together, and advertise
`validation_driven_selection: false` and `ranking_permitted: false`. The pinned
public API does not support validation-only selection or separate final-test
execution, so the workbench does not implement replacement metrics, choose a
winner or reinterpret the comparison as validation-driven optimization.
After a run has accepted a candidate for a dataset, it cannot seal another
protocol for the same dataset bytes, even by requesting an exploratory label.
This prevents adaptive resealing from bypassing the unsupported-selection limit;
a subsequent exploratory analysis requires a separately authorized run.

The `read_evaluation` tool has no purpose, partition or winner argument. It
returns only C12's allowlisted validation scalars and current exposure status.
Raw artifacts, predictions, bundles, report bytes and untyped failure/memory
prose stay outside this path. E09 does not reuse benchmarks across protocols.
Memory projections exclude test-derived judgments as well as numeric scores.

## Exposure and finalization

C12 continues to own release and exposure semantics. A trusted final-purpose
reader can read test scalars only after all sealed candidates have accepted,
terminal jobs. Such reads retain the original `agent_final` exposure event and
add a stable run-specific exposure marker in the same transaction. Both are
committed before content is returned. Existing pre-E12 final exposures remain
recognizable through their accepted evaluation/job bindings.

After final-test exposure, the same run cannot dispatch new audits, splits,
evaluation seals or baselines. The fence is enforced at E03 dispatch and at
C12's agent seal/candidate entry points. A later authorized exploratory run
must still preserve C12's dataset/split exposure history. No role can reset
history using a new artifact or run ID and claim an untouched holdout.

Scientific scores remain immutable, but eligibility is current state. Replaying
an accepted `read_evaluation` action recomputes the permitted projection and its
current exposure label; it never returns a cached clean-holdout claim after a
manual or final read has exposed the data. The original action receipt remains
historical evidence. Replay does not charge another tool call or run science.

No provider-controlled release tool is enabled. [E13](tickets/E13.md) now supplies
the trusted frozen-export final-purpose boundary; [E11](tickets/E11.md) reviewers
remain in selection scope. E10 specialists must use this same consumer.
Tests use synthetic retained metric canaries
to verify masking, not to claim scientific model performance.

For the E15 autonomy evaluation harness and opt-in live pilot, see
[autonomy evaluation](autonomy-evaluation.md).

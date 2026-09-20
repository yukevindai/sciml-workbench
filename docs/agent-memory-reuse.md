# Scoped memory and compatible reuse (E09)

`agent_memory.MemoryService` uses B11's retained `project_memory` ledger. The
registry now exposes `read_memory`, `read_failure` and `search_failures`; all
three use current project/input authority, bounded results and E05 accounting.
They do not search another project or contact the independent upstream service
based on provider arguments.

## Confirmed and provisional memory

A trusted server caller supplies the actor, policy and source run when recording
memory. Agents can record sourced provisional lessons or failure snapshots, but
cannot create confirmed preferences or supersede any record. Operator corrections
require the original identity and expected revision, preserve kind, mark the old
record superseded and create a new immutable revision with a supersession link.
Current retrieval excludes superseded entries. A cached retrieval is rejected
after its returned memory changes; the coordinator must use a new read identity.

Provider-facing preferences currently cover report scope and the mean/ridge
baseline preference. Provisional lessons use reviewed categories for source
declarations, audit findings, independent sample limitations and execution
failures. The returned authority labels explicitly distinguish a user preference
from a scientific fact and a provisional lesson from a confirmed statement.
Arbitrary notes remain stored locally and are never emitted through these tools.
Other preference types require a reviewed projection before being exposed.

Every referenced artifact and its parent closure must remain in the current
authorized scope. Preferences/lessons derived from benchmarks, failures, reports,
claims or evaluation protocols are withheld; even a categorical recommendation
could reveal a test-informed judgment. Lessons from a run with final-test exposure
are also withheld. Legacy/unclassified memory is retained but not silently
promoted to trusted memory. Failed linked jobs are returned separately with safe
error codes, an explicit non-cache label and a deterministic-rejection indicator.
E06 owns the decision not to repeat an unchanged deterministic rejection.

Failure retrieval identifies its source as a **retained workbench snapshot**, not
a current upstream record or live lexical search. Original prose, causal claims,
researcher assessments and criterion outcomes remain quarantined. Failure 2.0
execution observations can expose their typed error code. A missed test criterion
cannot leak through a score-free success/failure label. C06's live upstream API
remains available to its manual caller; agent prose retrieval remains denied.

`MemoryService.read` supports a separately constructed trusted cross-project
scope only when the effective policy explicitly grants that project and its
source artifacts. The registry always uses its authenticated run's project;
the model cannot add project authority, source IDs or a classification.

## Exact scientific reuse

Before queuing an audit, split or evidence-ingestion job, E03 records a versioned
scientific compatibility key and searches at most 100 scoped producer bindings.
The key includes project identity, the exact immutable input/parent graph,
dataset byte digests, normalized upstream configuration defaults, attachment
identity, installed software versions and retained exposure history. The explicit
`ADAPTER_REUSE_VERSION` must change when scientific adapter compatibility changes.
Policy still authorizes every input and must permit reuse at dispatch time.

Only successful jobs with an authorized result and matching key/software can be
reused. Retained source/output blobs are read and hash-verified before returning a
hit, including on receipt replay. Missing/corrupt content fails explicitly.
Original job/artifact identities and provenance are retained. The new action links
the job as shared, returns `reused: true` / `fresh_execution: false`, consumes one
tool call and consumes **zero** new scientific execution attempts.

The matching rule is deliberately conservative: equivalent bytes uploaded under
new artifact identities are not assumed to have the same parent semantics. Changed
configuration, parent identity, adapter/software version or exposure history is
not a hit. Failed attempts never become successful cached outputs. Legacy E03
actions retain their original replay identity, but without a recorded versioned
key their results are not assumed reusable. Benchmark reuse across sealed
protocols, report exports and external failure imports are excluded.

Reuse adds bounded local blob verification inside the project transaction. It
does not run science, invoke a model, call upstream HTTP or create a new result.

## Storage and handoff

Apply migration **0009** through normal setup before startup. It freezes memory
identity, value, provenance, classification and revision at the database level;
only valid-to-superseded status changes are allowed. Deletion remains forbidden by
B11 and downgrade refuses populated memory. Preserve the ledger in backups.

This ticket adds internal services and tools, not a public memory-editing route,
specialist scheduler or live provider. E04/E06 must consume the explicit authority
and reuse labels; E14 remains responsible for comprehensive provider egress.

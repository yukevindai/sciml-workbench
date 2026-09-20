# Agent persistence and operator controls

B11/B12 add application persistence and authenticated operator APIs. They do not enable a coordinator. New HTTP submissions return `503 AGENT_UNAVAILABLE` until D11 supplies an operational admission/scheduling boundary; existing records remain readable and controllable. Tests inject a trusted admission callback without calling a model. An environment flag cannot bypass this gate.

## Database and checkpoint setup

Apply Alembic `0006` during coordinated maintenance after stopping writers. It adds immutable server/project policy revisions, conversations/messages, runs, amendment receipts, plans, assignments, action attempts, job ownership links, questions/answers, reservations/usage, ordered events, evaluation links, and scoped memory. Existing scientific identities and JSON payloads are preserved. Composite foreign keys reject cross-project run/job/protocol relationships. Action keys are unique per run and attempt; event sequence is unique per run. Run JSON identity/state/revisions must match the authoritative columns. Triggers retain history, preserve original intent, prevent decreasing fences, and reject terminal run mutation. Populated downgrade is refused; use a compatible backup restore or a forward migration.

Runtime checkpoints are separate. The tested dependency set pins LangGraph `1.2.11`, PostgreSQL checkpointer `3.1.2`, and their transitive dependencies in `backend/constraints.txt`. During maintenance, run:

```sh
alembic -c backend/alembic.ini upgrade head
python -m workbench.checkpoints
```

The second command uses `WB_DATABASE_URL` and the supported `PostgresSaver.setup()` API; it requires PostgreSQL and is repeatable. It is not run implicitly on API startup. Root checkpoint thread IDs equal persisted run IDs; specialist namespaces equal assignment IDs. Application code never owns or migrates private checkpoint table layouts. See the [checkpointer documentation](https://github.com/langchain-ai/langgraph/blob/main/libs/checkpoint-postgres/README.md).

Back up application ledgers, policy revisions, scientific metadata/blobs, and runtime checkpoint tables together. `RunService.reconcile()` reads authoritative run state, current intersected authority, action outcomes and accepted job mappings. Its API takes no checkpoint payload. A stale checkpoint cannot reset reservations, undo a control, replace an action's canonical arguments, or erase an already submitted job. The scheduler must inspect these records before any dispatch; E08 owns the complete recovery loop.

## Trusted service boundary

Policy provisioning is an internal operator responsibility, not a public policy-write endpoint. Provision validated `AuthorityPolicy` records in `server_policies` and `project_policies` with matching monotonically increasing revisions. Missing policies fail closed. Admission captures the intersection of current server/project policy, requested limits and selected inputs. Later controls cannot broaden the accepted ceiling; authoritative policy is intersected again when preparing actions and binding jobs. Newly produced artifact grants and explicit policy expansion workflows remain E03/E01 integration work.

All service mutations use the project publication lock before reading or changing a run. This serializes duplicate acceptance, controls, action intent, plan/question publication, finalization and event sequence allocation on SQLite and PostgreSQL. Transactions are short; they contain no model call or scientific computation. Trusted writers must follow this lock order, including policy provisioning. `prepare_action` records canonical intent before effects, and `bind_job` belongs in the same transaction as idempotent scientific submission. It rechecks the run revision, control fence, current authority and project ownership. E05 now consumes scientific budgets in that same transaction; typed tool validation and leases belong to E03/D11; these helpers are not provider endpoints.

Usage reservations and entries are durable ledgers. [E05 accounting](budgets.md) now reserves shared allowances, settles reported usage and retains unknown outcomes. Apply migration `0008` for its immutable reservation guards. Run reconciliation includes these ledgers; current usage is projected on terminal reads without changing terminal state. Assignments and scoped memory retain typed ownership/context fields; E06/E09 own their runtime behavior. Evaluation links join persisted runs to C12 protocols, whose existing fingerprint-based exposure history remains authoritative across runs. No historical C12 free-form run attribution is silently converted into a verified run identity.

## API behavior

All routes share the existing bearer-token and origin boundary. The base path is `/api/v1/projects/{pid}/agent-runs`.

| Route | Behavior |
|---|---|
| `POST /` | Accept strict `RunInput` and `Idempotency-Key`; same key/body resolves one run, different body conflicts. Production admission remains gated on D11. |
| `GET /` | Bounded history, `after` equal to the last returned run ID and `limit` up to 100. |
| `GET /{rid}` | Current run, latest plan, questions and truthful control effect. |
| `POST /{rid}/amend` | Expected run/plan revisions, immutable original intent, recorded amendment, invalidated prior plan acceptance and superseded old questions. |
| `POST /{rid}/questions/{qid}/answer` | Exact current question/run revisions and all requested fields; retains an attributed operator message. |
| `POST /{rid}/review-plan` | Accept exact current plan in Review plan mode. A dirty plan after amendment must be regenerated first. |
| `POST /{rid}/pause`, `/resume`, `/cancel` | Expected revision and request key; enforce state transitions and advance the control fence without resetting usage. |
| `GET /{rid}/events` | Durable sequence order, exclusive `after` and bounded `limit` (maximum 500). |
| `GET /{rid}/stream` | Authenticated bounded SSE replay; uses `Last-Event-ID`, then closes. EventSource reconnects after two seconds. No database session waits for future work. |
| `GET /{rid}/result` | Terminal state, validated artifact references and stop reason; unfinished runs conflict. |

Control request keys are shared across a run's operations; reuse for different content or operations conflicts. A compatible replay returns the original recorded control response, even after subsequent state changes. Refetch the run for its current state. Generic Resume cannot bypass outstanding questions or plan review; answering while paused leaves the run paused. Terminal runs cannot be resumed or amended. Autopilot has no plan-acceptance step.

Pause/cancel immediately fence new application dispatch. Responses explicitly say already accepted operations may still settle. These controls do not claim to have killed a scientific process, revoked shared job ownership, or enforced late-publication fencing; D12 owns those effects. Raw checkpoints, leases, arbitrary permissions, private action arguments and reservations have no client-write route.

## Verification

`backend/tests/test_agent_runs.py` exercises committed records, concurrent acceptance/control replay, conflicting controls, stale revisions, review invalidation, attributed answers, current-policy restriction, action/job recovery, cross-project foreign keys, immutable intent, terminal consistency, unavailable admission, authentication and SSE replay. It also runs a real LangGraph graph with PostgresSaver, reloads its stale checkpoint and confirms the paused relational state wins.

Set `TEST_DATABASE_URL` to a disposable PostgreSQL database to enable PostgreSQL cases; the metadata fixture creates and drops uniquely named schemas. Checkpoint setup tests use those same isolated schemas. SQLite skips the PostgreSQL checkpointer case. Migration parity, empty roundtrips and populated scientific migration retention are covered by `test_metadata.py`.

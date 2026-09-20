# Agent egress and untrusted content (E14)

Provider context is a backend projection, not a serialization of a database row,
checkpoint, exception, scientific artifact or specialist response. E14 applies
the current exposure and credential checks at the provider boundary and before
durable budget dispatch. No live provider calls are needed to test this boundary.

## Context and authority

`ContextPart` is an internal Python type; it is not a model tool or HTTP input.
Only trusted projection code may label content `schema` or `aggregates`. E03's
typed readers omit raw rows and arbitrary artifact prose; E09 omits memory notes
and untyped failure prose; E12 retains its selection/test-data restrictions.
Classification is not inferred from a model's claim that text is safe.

Every request checks project, allowed content classes, exposure level, source
artifact/material scope and serialized byte limits. Excerpts and raw content
require explicit scoped source IDs. `ContextPart.derived()` builds summaries,
specialist handoffs and retry context without dropping any source class or ID.
It rejects mixed-project sources. Policy tightening therefore also applies to
derived text that no longer visibly contains the original rows.

Context records are JSON-escaped, individually marked untrusted data, and sent
with a fixed system instruction distinguishing source instructions from backend
authority. This instruction is only a model cue. The provider parser rejects
unoffered tools and extra arguments; the dispatcher independently enforces roles,
project and input scope, current policy, control generation and budgets. Source
text cannot supply a dispatch context or change the accepted objective.

The budget wrapper reads current authority under the existing project/run lock,
including specialist assignment restrictions, and checks egress before reserving
or committing dispatch. The reviewed byte bound includes serialized system/tool
overhead. Retries repeat these checks. Dispatch retains E05's linearization point:
the durable dispatch commit admits an external operation; it cannot be recalled
atomically with a later pause/cancel. HTTP runs without a database lock. Accepted
operations may settle after a stop, while subsequent dispatch is fenced.

## Credentials, diagnostics and retention

`SecretGuard` inventories explicit backend/provider settings, the process
environment and the default `.env` source. It checks configured provider keys,
backend tokens, upstream passwords, database URLs and database passwords,
including common JSON, URL and base64 representations. It also rejects recognizable
credential-bearing URLs, authorization/cookie headers and claim-token assignments.
Runtime-created secrets can be supplied through its `secrets` argument. Bare
claim generations are never projected; whitelisted events omit them.

Checks cover the complete outgoing provider payload, including tool descriptions
and schemas, and bounded provider responses before parsing/export. Credential
denials use fixed error codes without the matching text. A response denied after
dispatch retains unknown usage for reconciliation; it is not treated as free.

Tool results are checked inside the dispatch transaction, including replayed
receipts. A rejection returns `DATA_EXPOSURE_DENIED` and rolls back new action,
reservation and job writes. Agent HTTP responses, including history, plans,
questions, terminal results and SSE replay, are checked after typed serialization.
An HTTP output denial does not undo an already accepted local mutation; its
idempotency key remains the recovery mechanism. Events retain their existing
whitelist and never include prompts, raw responses, checkpoint state or reasoning.

Worker/parser exception text is no longer retained as a job diagnostic: it can
quote protected CSV rows or document contents even when no credential appears.
Fixed messages and existing typed error codes identify failures. Full scientific
files and their integrity hashes remain unchanged in local storage. Authorized
scientific downloads are separate from provider/agent projections.

These checks are defense in depth, not an arbitrary-secret detector or a semantic
classifier. New trusted readers must implement an explicit projection; they must
not relabel raw text as aggregates. New runtime/specialist integration must use
these boundaries and pass backend settings when configuration is injected rather
than loaded from environment. Agent scheduling remains disabled pending D11 and
coordinator integration; no live prompt-injection resistance claim is made.

## Verification

`backend/tests/test_egress.py` exercises real HTTPX request serialization and
provider responses, source scope and derived classification, cross-project model
calls, secret tool results and transactional rollback, policy tightening, browser
history/SSE, and raw diagnostic suppression. Existing provider, run, budget,
registry, memory, evaluation and worker tests cover the surrounding enforcement.

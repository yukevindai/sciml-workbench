# Research studio

The workspace navigation is Ask, Projects, Workflows, Agent market, and Tools.
Scientific results keep their direct inspection links. Scientific entry forms and
motion controls are no longer part of the product; animation follows the system
reduced-motion preference.

## Agents and reusable tools

In **Tools**, choose **Create with AI** to describe a tool's purpose, inputs,
output format and constraints. A selected project and configured agent provider
are required. **Generate draft** starts a durable, budgeted request without
research attachments or executable capabilities; progress includes elapsed time.
**Stop generation** cancels it. You can reopen the builder to restore its activity,
and an uncertain submission retries the same request key.

Choose **Review and edit draft**, adjust the suggested instructions and integrated
capabilities, then **Save tool**. Generating never saves or executes a tool.
Unsupported capabilities are rejected; arbitrary code and new external services
are not created. **Create tool** keeps the manual form available without AI.
The public demo simulates this flow with a labeled prewritten example and no API calls.

Customizing a built-in agent creates a new profile. The API rejects attempts to
update or archive built-ins. Existing runs retain immutable profile and tool
snapshots. Custom research tools combine named instructions with a subset of the
integrated capabilities. They can be attached to agents or used as graph steps.
A tool step narrows the run's allowed capabilities; it cannot grant permissions,
load code, run shell commands, or add arbitrary network destinations.

## Graphs and execution

The two default templates demonstrate parallel evidence investigation and
conditional, bounded evaluation. The editor supports moving nodes with a pointer
or arrow keys, zoom/fit, click-to-connect ports, and keyboard-accessible connection
pickers. Save validates unique/reachable nodes, matching ports, a single trigger,
finish nodes, and acyclic connections. Repeat nodes represent one to five bounded
iterations of a research task. Conditions test retained artifact availability or
whether incoming steps completed. Connections carry either execution signals or
retained artifact references; they do not relabel generated prose as user input.

A workflow snapshots its graph, agent rosters, tool recipes, input scope, and
policy ceiling. Project locks serialize advancement and cancellation. Child runs
are submitted through RunService with deterministic idempotency keys. The graph's
maximum child count divides its cumulative limits, while normal project-wide
accounting still applies. Currently authorized derived predecessor artifacts may
flow across artifact connections; live revocation invalidates their authority.
Parallel execution is bounded to three child runs. Questions and plan approval
remain in the linked Ask conversation for each child.

Execution progresses from the existing agent worker or Vercel agent scheduler
lane. The browser only saves, controls, and observes it. Cancelling a workflow also
cancels active child runs. A permission or dependency failure stops the graph and
its children; earlier committed results remain retained.

## Daily triggers

Daily schedules are explicitly enabled from the Run panel. They use the saved
question, inputs, policy ceiling, and definition revision. They execute at most
once per UTC day when the normal scheduler wakes; no minute-specific timing is
promised. Runs of the same schedule cannot overlap. Stopping a schedule affects
future runs; stopping the current workflow is separate. Editing/archiving a saved
definition requires restarting its schedule. Missing dependencies or revoked
permissions disable the schedule. Normal cumulative project limits remain active.

## Storage and rollout

Definitions, schedules, and graph state use distinct kinds in the existing
`agent_market_entries` JSON table (migration 0013). No additional database
migration or new external storage dependency is required. Deploy the backend
before the frontend. Keep the existing private frontend login and backend bearer
boundary. Model settings and project grants are unchanged.

Verification includes graph validation, fan-out/join, branches, bounded iteration,
restarts, request idempotency, cancellations, schedule overlap prevention,
immutable recipes, and capability narrowing. Real provider output is deliberately
not used in tests.


## Canvas and draft controls

Drag empty canvas space with the primary or middle mouse button to pan. Arrow keys
pan a focused canvas; dragging a step grip moves that step. Cancel creation closes
a new draft immediately if untouched and confirms before discarding edits.

## Product support

Help is present only inside the signed-in workspace. Product Support answers usage
questions from the product guide using the configured agent provider. It has no
tools and sends no research attachments. Questions and answers are retained in the
selected project's run history. Searchable local guidance works without a provider
or selected project. Closing the panel does not stop an active support request.

## Scientific stress tests

Stress tests use immutable built-in workflows and reviewer profiles: one general
scientific challenger or three independent reviewers (methods, statistics,
evidence). Each receives the same selected, authorized inputs. They do not receive
one another's prose. The council shares the request's budget across three runs.

The rubric requires evidence or an explicit gap, severity, confidence with reasons,
alternative explanations, resolving tests, strengths, and counterarguments. It
forbids fabricated citations and quality scores. The same configured provider may
have shared blind spots; this is critical feedback, not peer-review certification.

Users select an idea, paper, or result, supply a claim, and optionally attach CSV/PDF
materials or selected retained results. Each review links to its full conversation
for findings, source artifacts, plan approvals, and questions. Stop test cancels
active children and prevents more work. Idempotent retries preserve the exact start
request after uncertain acceptance. Existing deployment workers, policy checks,
provider verification, and storage are required; no new service is introduced.

## Public interactive demo

`/demo` and the supported `/demo/<view>` pages are public. The landing page,
product-preview tabs, navigation and sign-in page link to them. They render the
same workspace components with bundled synthetic fixtures and a lazy-loaded,
browser-only transport. Ask and council runs show a short scripted progression;
agent, team, tool, project and workflow edits stay in memory until a refresh.
The demo notice stays on every screen, and Reset demo clears only demo state.

No backend or provider is involved. `api()` selects the local transport only on
the dedicated demo path; unsupported operations fail without a network fallback.
Run feeds use local polling instead of EventSource. Workspace/result links stay
under `/demo`, and download controls explain that archives are illustrative.
Uploads are blocked, schedules never execute, and live Product Support is not
mounted. The Demo guide searches static product guidance instead.

Demo drafts and selections use a separate storage prefix, including when a signed-in
operator explores the demo. The public proxy allowlist includes exact demo views,
not `/api` or arbitrary demo subpaths. Existing session and server-side API checks
remain in force. Bundled examples in `frontend/app/lib/demo/seed.json` come from
the deterministic synthetic browser fixtures; they are not real research records.
The sample report's verification display is prewritten, not a new integrity check.

Run `npm --prefix frontend run test:e2e -- public-demo.spec.ts` against the built
frontend to verify public navigation, local mutations, scripted runs, reset,
upload refusal, mobile layout and absence of API traffic. These tests abort any
attempted API request and fail if one occurs; no configured model key is needed.

# Research studio

The workspace navigation is Ask, Projects, Workflows, Agent market, and Tools.
Scientific results keep their direct inspection links. Scientific entry forms and
motion controls are no longer part of the product; animation follows the system
reduced-motion preference.

## Agents and reusable tools

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

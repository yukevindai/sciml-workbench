# Agent market

Open **Agent market** in the workspace sidebar. The private catalog contains the existing PI/coordinator, data specialist, researcher, experiment analyst and scientific reviewer. Customize a built-in to save a separate editable copy, or create an agent from scratch. Choose its name, role, skills, working instructions and integrated tools. Built-ins remain available to everyone using this workspace login.

Create a team with one to eight agents and choose its lead. Teams are reusable across projects. Agents and teams can be edited or archived; edits use revision checks to prevent overwriting another saved edit. Archiving keeps historical runs intact. A team or project that references an archived agent must be reassigned before new work can start.

## Assign work

- **Assign a task** on an agent or team opens Ask with that assignment selected.
- **Ask** and **Detailed request** let you override the assignment for the next prompt.
- **Use as project default** saves an assignment for subsequent requests in that project. It is also available on the Projects page.
- **Project default** inherits the saved assignment. **Automatic** explicitly uses the original built-in adaptive workflow.
- **Only use this agent/team** is enabled by default. Turning it off permits the built-in agents and their tools to assist.

Run admission resolves and snapshots the complete roster, lead, profile revisions, skills, instructions and tool selections. A later catalog edit cannot change an accepted run. New requests and continuations resolve current selections at admission. The saved run and activity views show the assignment and named specialist contributions.

## Execution behavior

The selected lead supplies the coordinator identity and working preferences. Team tools are the union of the roster's selected tools, intersected with the existing server, project and run policies. The coordinator performs tool operations on behalf of that team. Specialist calls remain advisory and cannot dispatch science or recursively delegate. This preserves the existing execution, budget, review and provenance boundaries.

Delegation checks the selected agent ID and its matching skill on the server. Exclusive rosters never silently recruit an outside specialist, including during final scientific review. Include an agent with the Scientific Review skill for reviewed narrative findings. If none is available, the existing finalizer omits unreviewed claims and records the limitation. No-tool agents can answer from supplied context; they cannot grant themselves integrated tools. Free-form instructions guide behavior but cannot grant tools, models, credentials or broader data access.

Skills currently correspond to integrated planning, data/evaluation, evidence, experiment-memory and scientific-review workflows. Working instructions provide domain customization. The catalog does not install executable plugins, arbitrary Python, external tool servers or user-selected models.

## Deployment

Deploy frontend and backend from the same revision, and apply the additive migration:

```sh
alembic -c backend/alembic.ini upgrade head
```

Migration `0013` creates `agent_market_entries` and `project_agent_selections`. Existing runs and unassigned projects preserve automatic behavior. The catalog works while model execution is disabled; running a prompt still requires the existing provider, policies and worker setup.

This repository currently has one private operator login per deployment. The catalog follows that workspace boundary; it does not introduce individual user accounts or public marketplace sharing.

"""Frozen application schema for migration 0006 (runtime tables are separate)."""
import sqlalchemy as sa


def tables(metadata):
    def col(name, type_=sa.String(160), **kw):
        return sa.Column(name, type_, nullable=kw.pop("nullable", False), **kw)

    def table(name, *columns):
        return sa.Table(name, metadata, *columns)

    def identity():
        return [col("id", primary_key=True), col("project_id", sa.String(36)),
                sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
                sa.UniqueConstraint("project_id", "id")]

    def run_scope():
        return [col("run_id"), sa.ForeignKeyConstraint(
            ["project_id", "run_id"], ["agent_runs.project_id", "agent_runs.id"])]

    table("project_policies", col("project_id", sa.String(36), primary_key=True),
          col("revision", sa.BigInteger, primary_key=True), col("payload", sa.JSON),
          sa.ForeignKeyConstraint(["project_id"], ["projects.id"]), sa.CheckConstraint("revision > 0"))
    table("server_policies", col("revision", sa.BigInteger, primary_key=True), col("payload", sa.JSON),
          sa.CheckConstraint("revision > 0"))
    table("research_conversations", *identity(), col("created_at", sa.DateTime(timezone=True)))
    table("research_messages", *identity(), col("conversation_id"), col("sequence", sa.BigInteger),
          col("actor"), col("content", sa.Text), col("created_at", sa.DateTime(timezone=True)),
          sa.ForeignKeyConstraint(["project_id", "conversation_id"],
                                  ["research_conversations.project_id", "research_conversations.id"]),
          sa.UniqueConstraint("conversation_id", "sequence"), sa.CheckConstraint("sequence > 0"),
          sa.CheckConstraint("actor IN ('operator', 'assistant')"))
    runs = table("agent_runs", *identity(), col("request_key"), col("request_digest", sa.String(64)),
          col("original_request", sa.JSON), col("payload", sa.JSON), col("policy", sa.JSON),
          col("state"), col("control_revision", sa.BigInteger), col("plan_revision", sa.BigInteger),
          col("accepted_plan_revision", sa.BigInteger), col("event_sequence", sa.BigInteger),
          col("plan_dirty", sa.Boolean),
          col("claim_token", sa.BigInteger), col("created_at", sa.DateTime(timezone=True)),
          sa.UniqueConstraint("project_id", "request_key"),
          sa.CheckConstraint("control_revision > 0 AND plan_revision >= 0 AND accepted_plan_revision >= 0 AND event_sequence >= 0 AND claim_token >= 0"),
          sa.CheckConstraint("state IN ('queued','running','waiting_for_job','waiting_for_input','paused','completed','partially_completed','failed','cancelled')"))
    for field in ('id', 'project_id', 'state', 'control_revision', 'plan_revision'):
        value = (runs.c.payload[field].as_integer() if field.endswith('revision')
                 else runs.c.payload[field].as_string())
        runs.append_constraint(sa.CheckConstraint(value.is_not(None) & (value == runs.c[field]),
                                                   name='ck_agent_runs_payload_' + field))
    table("agent_run_amendments", *identity(), *run_scope(), col("request_key"),
          col("request_digest", sa.String(64)), col("operation"), col("payload", sa.JSON),
          col("response", sa.JSON), col("created_at", sa.DateTime(timezone=True)),
          sa.UniqueConstraint("run_id", "request_key"))
    table("agent_plans", *identity(), *run_scope(), col("revision", sa.BigInteger), col("payload", sa.JSON),
          sa.UniqueConstraint("run_id", "revision"), sa.CheckConstraint("revision > 0"))
    table("agent_assignments", *identity(), *run_scope(), col("payload", sa.JSON), col("state"),
          col("result", sa.JSON, nullable=True), sa.UniqueConstraint("run_id", "id"))
    table("agent_actions", *identity(), *run_scope(), col("action_key"), col("attempt", sa.BigInteger),
          col("request_digest", sa.String(64)), col("request", sa.JSON), col("state"),
          col("control_revision", sa.BigInteger), col("claim_token", sa.BigInteger),
          col("assignment_id", nullable=True), col("outcome", sa.JSON, nullable=True),
          sa.ForeignKeyConstraint(["run_id", "assignment_id"], ["agent_assignments.run_id", "agent_assignments.id"]),
          sa.UniqueConstraint("run_id", "action_key", "attempt"), sa.UniqueConstraint("run_id", "id"),
          sa.CheckConstraint("attempt > 0"),
          sa.CheckConstraint("state IN ('prepared','submitted','completed','failed','unknown','cancelled')"))
    table("run_job_links", col("run_id", primary_key=True), col("action_id", primary_key=True),
          col("project_id", sa.String(36)), col("job_id", sa.String(36)), col("ownership"),
          sa.ForeignKeyConstraint(["run_id", "action_id"], ["agent_actions.run_id", "agent_actions.id"]),
          sa.ForeignKeyConstraint(["project_id", "run_id"], ["agent_runs.project_id", "agent_runs.id"]),
          sa.ForeignKeyConstraint(["project_id", "job_id"], ["jobs.project_id", "jobs.id"]),
          sa.CheckConstraint("ownership IN ('owned','shared','detached')"))
    table("agent_questions", *identity(), *run_scope(), col("revision", sa.BigInteger),
          col("payload", sa.JSON), col("answer", sa.JSON, nullable=True), col("status"),
          sa.CheckConstraint("revision > 0"),
          sa.CheckConstraint("status IN ('open','answered','superseded','expired','cancelled')"))
    for name in ("usage_reservations", "usage_entries"):
        table(name, *identity(), *run_scope(), col("request_id"), col("assignment_id", nullable=True),
              col("payload", sa.JSON), col("created_at", sa.DateTime(timezone=True)),
              sa.ForeignKeyConstraint(["run_id", "assignment_id"], ["agent_assignments.run_id", "agent_assignments.id"]),
              sa.UniqueConstraint("run_id", "request_id"))
    table("agent_events", col("run_id", primary_key=True), col("sequence", sa.BigInteger, primary_key=True),
          col("project_id", sa.String(36)), col("payload", sa.JSON),
          sa.ForeignKeyConstraint(["project_id", "run_id"], ["agent_runs.project_id", "agent_runs.id"]),
          sa.CheckConstraint("sequence > 0"))
    table("agent_evaluation_links", col("run_id", primary_key=True), col("protocol_id", sa.String(36), primary_key=True),
          col("project_id", sa.String(36)),
          sa.ForeignKeyConstraint(["project_id", "run_id"], ["agent_runs.project_id", "agent_runs.id"]),
          sa.ForeignKeyConstraint(["project_id", "protocol_id"], ["evaluations.project_id", "evaluations.protocol_id"]))
    table("project_memory", *identity(), col("revision", sa.BigInteger), col("kind"), col("status"),
          col("value", sa.JSON), col("attribution"), col("source_run_id", nullable=True),
          col("source_artifact_ids", sa.JSON), col("exposure"),
          sa.ForeignKeyConstraint(["project_id", "source_run_id"], ["agent_runs.project_id", "agent_runs.id"]),
          sa.CheckConstraint("revision > 0"), sa.CheckConstraint("status IN ('valid','superseded')"),
          sa.CheckConstraint("kind IN ('confirmed_preference','provisional_finding','failure_snapshot')"))


NAMES = ('server_policies', 'project_policies', 'research_conversations', 'research_messages',
         'agent_runs', 'agent_run_amendments', 'agent_plans', 'agent_assignments', 'agent_actions',
         'run_job_links', 'agent_questions', 'usage_reservations', 'usage_entries', 'agent_events',
         'agent_evaluation_links', 'project_memory')

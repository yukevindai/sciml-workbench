"""Agent application ledgers; checkpoint tables belong to PostgresSaver."""
from .db import Base
from .agent_schema_v6 import tables

tables(Base.metadata)


class ServerPolicyRow(Base):
    __table__ = Base.metadata.tables['server_policies']


class ProjectPolicyRow(Base):
    __table__ = Base.metadata.tables['project_policies']


class ConversationRow(Base):
    __table__ = Base.metadata.tables['research_conversations']


class MessageRow(Base):
    __table__ = Base.metadata.tables['research_messages']


class RunRow(Base):
    __table__ = Base.metadata.tables['agent_runs']


class AmendmentRow(Base):
    __table__ = Base.metadata.tables['agent_run_amendments']


class PlanRow(Base):
    __table__ = Base.metadata.tables['agent_plans']


class AssignmentRow(Base):
    __table__ = Base.metadata.tables['agent_assignments']


class ActionRow(Base):
    __table__ = Base.metadata.tables['agent_actions']


class RunJobRow(Base):
    __table__ = Base.metadata.tables['run_job_links']


class QuestionRow(Base):
    __table__ = Base.metadata.tables['agent_questions']


class ReservationRow(Base):
    __table__ = Base.metadata.tables['usage_reservations']


class UsageRow(Base):
    __table__ = Base.metadata.tables['usage_entries']


class EventRow(Base):
    __table__ = Base.metadata.tables['agent_events']


class EvaluationLinkRow(Base):
    __table__ = Base.metadata.tables['agent_evaluation_links']


class MemoryRow(Base):
    __table__ = Base.metadata.tables['project_memory']


from .scheduler_schema_v10 import table as lease_table


class LeaseRow(Base):
    __table__ = lease_table(Base.metadata)

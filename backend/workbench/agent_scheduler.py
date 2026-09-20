"""D11: one bounded advancement per lease, independent of scientific workers.

The E04 coordinator is injected. It receives a fenced RunService and authoritative
ledgers; checkpoint state is advisory. No model or scientific call holds a lease
transaction. A yielded scientific wait consumes no coordinator capacity.
"""
from dataclasses import dataclass
from datetime import timedelta, timezone
from sqlalchemy import select, func

from .agent_db import RunRow, LeaseRow, RunJobRow
from .agent_runs import RunService
from .db import JobRow
from .job_metadata import database_now
from .errors import DomainError


@dataclass(frozen=True)
class AgentClaim:
    project_id: str
    run_id: str
    token: int
    worker_id: str


def assert_authority(s, row, claim, *, states=frozenset({'running'})):
    lease = s.get(LeaseRow, row.id, populate_existing=True)
    if lease is None and claim is None:
        return  # Existing trusted non-scheduler integrations.
    expiry = lease.expires_at if lease else None
    if expiry and expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if (not isinstance(claim, AgentClaim) or not lease or not expiry
            or expiry <= database_now(s) or lease.worker_id != claim.worker_id
            or lease.token != claim.token or row.claim_token != claim.token
            or row.id != claim.run_id or row.project_id != claim.project_id
            or row.state not in states):
        raise DomainError('Agent lease is stale', 409, 'RUN_REVISION_CHANGED')


class Scheduler:
    def __init__(self, db, *, lease_seconds=60):
        if not isinstance(lease_seconds, int) or not 1 <= lease_seconds <= 300:
            raise ValueError('Lease must be 1 to 300 seconds')
        self.db, self.lease_seconds = db, lease_seconds
        self.runs = RunService()

    def claim(self, worker_id):
        if not worker_id or len(worker_id) > 160:
            raise ValueError('Worker identity must contain 1 to 160 characters')
        # Discovery holds no row locks. All mutations use project-before-run order.
        with self.db.session() as s:
            candidates = s.execute(select(RunRow.project_id, RunRow.id).outerjoin(LeaseRow, LeaseRow.run_id == RunRow.id).where(
                RunRow.state.in_(['queued', 'running', 'waiting_for_job']))
                .order_by(func.coalesce(LeaseRow.last_claimed_at, RunRow.created_at), RunRow.id)).all()
        for pid, rid in candidates:
            with self.db.session.begin() as s:
                row = self.runs.get(s, pid, rid, lock=True)
                if row.state not in {'queued', 'running', 'waiting_for_job'}:
                    continue
                lease = s.get(LeaseRow, rid)
                stamp = database_now(s)
                expiry = lease.expires_at if lease else None
                if expiry and expiry.tzinfo is None:
                    expiry = expiry.replace(tzinfo=timezone.utc)
                if lease and lease.token == row.claim_token and expiry and expiry > stamp:
                    continue
                waiting = s.scalar(select(JobRow.id).join(RunJobRow, RunJobRow.job_id == JobRow.id).where(
                    RunJobRow.run_id == rid, RunJobRow.ownership != 'detached',
                    JobRow.state.in_(['queued', 'running'])).limit(1))
                if waiting:
                    # Also handles a crash after job submission, before yielding.
                    if row.state != 'waiting_for_job':
                        self.runs.save(row, {**row.payload, 'state': 'waiting_for_job'})
                        self.runs.event(s, row, 'state_changed')
                    if lease:
                        lease.worker_id, lease.expires_at = None, None
                    continue
                recovered = row.state == 'running'
                row.claim_token += 1
                if lease is None:
                    lease = LeaseRow(run_id=rid, project_id=pid, token=0, recoveries=0)
                    s.add(lease)
                lease.token, lease.worker_id = row.claim_token, worker_id
                lease.expires_at = stamp + timedelta(seconds=self.lease_seconds)
                lease.last_claimed_at = stamp
                lease.recoveries += int(recovered)
                self.runs.save(row, {**row.payload, 'state': 'running'})
                self.runs.event(s, row, 'state_changed')
                return AgentClaim(pid, rid, row.claim_token, worker_id)
        return None

    def advance(self, claim, checkpointer, step):
        """Execute one E04 graph step and publish its checkpoint only if current.

        step(snapshot, previous_state, fenced_runs) returns (state, next_status).
        Effects must use fenced_runs (including ToolRegistry's runs argument).
        No automatic retry of a provider call or unknown external effect occurs.
        """
        runs = RunService(claim=claim)
        with self.db.session.begin() as s:
            row = runs.get(s, claim.project_id, claim.run_id, lock=True)
            assert_authority(s, row, claim)
            snapshot = runs.reconcile(s, row.project_id, row.id)
            pointer = s.get(LeaseRow, row.id).checkpoint
        previous = checkpointer.get_tuple(pointer) if pointer else None
        if pointer and previous is None:
            raise RuntimeError('Committed checkpoint is missing; restore before advancing')
        state, status = step(snapshot, previous.checkpoint['channel_values'].get('state') if previous else None, runs)
        # E04 finalization uses the fenced ledger service, never a returned state
        # string. Terminal ledgers need no further graph checkpoint publication.
        from .agent_runs import TERMINAL
        with self.db.session.begin() as s:
            row = runs.get(s, claim.project_id, claim.run_id, lock=True)
            if row.state in TERMINAL:
                return row.state
            assert_authority(s, row, claim, states={'running', 'waiting_for_input'})
            if row.state == 'waiting_for_input':
                status = row.state
        if status not in {'queued', 'waiting_for_job', 'waiting_for_input'}:
            raise ValueError('An advancement must yield a supported next state')
        import json
        if len(json.dumps(state, allow_nan=False).encode('utf-8')) > 262144:
            raise ValueError('Coordinator state exceeds the checkpoint size bound')
        from langgraph.checkpoint.base import empty_checkpoint
        checkpoint = empty_checkpoint()
        checkpoint['channel_values'] = {'state': state}
        checkpoint['channel_versions'] = {'state': 1}
        # Separate namespaces prevent a stale writer from replacing a newer head.
        config = {'configurable': {'thread_id': claim.run_id, 'checkpoint_ns': f'lease-{claim.token}'}}
        pointer = checkpointer.put(config, checkpoint, {'source': 'update', 'step': claim.token, 'parents': {}}, {'state': 1})
        with self.db.session.begin() as s:
            row = runs.get(s, claim.project_id, claim.run_id, lock=True)
            assert_authority(s, row, claim, states={'running', 'waiting_for_input'})
            lease = s.get(LeaseRow, row.id)
            lease.checkpoint, lease.worker_id, lease.expires_at = pointer, None, None
            runs.save(row, {**row.payload, 'state': status})
            runs.event(s, row, 'state_changed')
        return status

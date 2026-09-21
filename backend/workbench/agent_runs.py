"""Transactional run authority. All mutations acquire project then run locks.

No checkpoint input is accepted here. D11/E03 must use the returned authoritative
records, not serialized graph copies, before dispatching any effect.
"""
from copy import deepcopy
from sqlalchemy import select
from .agent_db import (ServerPolicyRow, ProjectPolicyRow, RunRow, AmendmentRow, EventRow,
    PlanRow, QuestionRow, ActionRow, RunJobRow, ConversationRow, MessageRow)
from .agent_policy import AuthorityPolicy, intersect_policy, authorize_action, PolicyDenied, interruption_reason
from .barriers import lock_project
from .contracts import now, uid
from .db import ArtifactRow, MaterialRow
from .errors import DomainError
from .request_identity import request_digest
from .research_contracts import ResearchRun, RunEvent, ResearchPlan, ResearchQuestion

TERMINAL = {'completed', 'partially_completed', 'failed', 'cancelled'}


def conflict(message='Run revision changed', code='RUN_REVISION_CHANGED'):
    raise DomainError(message, 409, code)


def key_check(key):
    if not key or len(key) > 160 or key.strip() != key:
        raise DomainError('A nonblank request key of at most 160 characters is required')


class RunService:
    def __init__(self, admission=None, *, claim=None):
        self.admission = admission or self.unavailable
        self.claim = claim

    def assert_dispatch(self, s, row):
        from .agent_scheduler import assert_authority
        assert_authority(s, row, self.claim)

    @staticmethod
    def unavailable():
        raise DomainError('Agent coordinator integration is unavailable (E04)', 503, 'AGENT_UNAVAILABLE')

    def get(self, s, pid, rid, *, lock=False):
        if lock:
            lock_project(s, pid)
        row = s.scalar(select(RunRow).where(RunRow.project_id == pid, RunRow.id == rid)
                       .execution_options(populate_existing=True))
        if row is None:
            raise DomainError('Run not found in project', 404, 'REFERENCE_INVALID')
        return row

    def policies(self, s, pid, expected=None):
        server = s.scalar(select(ServerPolicyRow).order_by(ServerPolicyRow.revision.desc()).limit(1))
        project = s.scalar(select(ProjectPolicyRow).where(ProjectPolicyRow.project_id == pid)
                           .order_by(ProjectPolicyRow.revision.desc()).limit(1))
        if not server or not project:
            raise DomainError('Trusted server and project policies are required', 503, 'AGENT_UNAVAILABLE')
        if expected is not None and project.revision != expected:
            conflict('Project policy revision changed')
        return AuthorityPolicy.model_validate(server.payload), AuthorityPolicy.model_validate(project.payload)

    def inputs(self, s, pid, scope, policy):
        if pid not in policy.project_ids or not set(scope.artifact_ids) <= policy.artifact_ids or not set(scope.material_ids) <= policy.material_ids:
            raise DomainError('Inputs exceed current authority', 403, 'POLICY_DENIED')
        for ids, model in ((scope.artifact_ids, ArtifactRow), (scope.material_ids, MaterialRow)):
            for ident in ids:
                row = s.get(model, ident)
                if row is None or row.project_id != pid:
                    raise DomainError('Input not found in project', 404, 'REFERENCE_INVALID')
        if scope.conversation_id:
            conversation = s.get(ConversationRow, scope.conversation_id)
            if not conversation or conversation.project_id != pid:
                raise DomainError('Conversation not found in project', 404, 'REFERENCE_INVALID')
            if scope.message_cutoff and not s.scalar(select(MessageRow.id).where(
                    MessageRow.conversation_id == conversation.id, MessageRow.sequence == scope.message_cutoff)):
                raise DomainError('Conversation cutoff does not exist', 422, 'REFERENCE_INVALID')

    def effective_policy(self, s, row):
        server, project = self.policies(s, row.project_id)
        policy = intersect_policy(server, project, AuthorityPolicy.model_validate(row.policy))
        # Generated artifacts are capabilities derived from accepted run actions,
        # never IDs asserted by the model. Rebuild the closure against *current*
        # authority so revoking an input also revokes its descendants.
        from .tool_scope import derived_artifacts
        derived = derived_artifacts(s, row, policy)
        return policy.model_copy(update={'artifact_ids': policy.artifact_ids | derived})

    def event(self, s, row, event_type, **fields):
        row.event_sequence += 1
        payload = RunEvent(run_id=row.id, sequence=row.event_sequence, created_at=now(),
            event_type=event_type, run_revision=row.control_revision, state=row.state, **fields)
        s.add(EventRow(run_id=row.id, project_id=row.project_id, sequence=row.event_sequence,
                       payload=payload.model_dump(mode='json')))

    def save(self, row, value):
        value = ResearchRun.model_validate(value)
        row.payload = value.model_dump(mode='json')
        row.state, row.control_revision, row.plan_revision = value.state, value.control_revision, value.plan_revision

    def create(self, s, pid, body, key):
        key_check(key)
        lock_project(s, pid)
        digest = request_digest('agent_run', body.model_dump(mode='json'))
        old = s.scalar(select(RunRow).where(RunRow.project_id == pid, RunRow.request_key == key))
        if old:
            if old.request_digest != digest:
                conflict('Request key already binds different run input', 'IDEMPOTENCY_CONFLICT')
            return old.payload
        self.admission()
        server, project = self.policies(s, pid, body.policy_revision)
        requested = project.model_copy(update={'limits': body.limits,
            'artifact_ids': frozenset(body.inputs.artifact_ids), 'material_ids': frozenset(body.inputs.material_ids)})
        policy = intersect_policy(server, project, requested)
        self.inputs(s, pid, body.inputs, policy)
        value = ResearchRun(id=uid(), project_id=pid, created_at=now(), objective=body.objective,
            inputs=body.inputs, policy=policy.reference(), mode=body.mode, state='queued', control_revision=1,
            plan_revision=0, limits=policy.limits, open_question_ids=[], result_artifact_ids=[],
            usage=dict(billed_token_categories={}, reserved_tokens=0, model_requests=0, tool_calls=0,
                scientific_attempts=0, active_seconds=0, unknown_request_ids=[],
                cost={'status': 'unknown', 'reason': 'No settled usage'}))
        row = RunRow(id=value.id, project_id=pid, request_key=key, request_digest=digest,
            original_request=body.model_dump(mode='json'), payload=value.model_dump(mode='json'),
            policy=policy.model_dump(mode='json'), state=value.state, control_revision=1, plan_revision=0,
            accepted_plan_revision=0, event_sequence=0, claim_token=0, plan_dirty=False, created_at=value.created_at)
        s.add(row)
        s.flush()
        self.event(s, row, 'accepted')
        s.flush()
        return row.payload

    def mutate(self, s, pid, rid, operation, body, key, qid=None):
        key_check(key)
        row = self.get(s, pid, rid, lock=True)
        digest = request_digest(operation, {'body': body.model_dump(mode='json'), 'question_id': qid})
        old = s.scalar(select(AmendmentRow).where(AmendmentRow.run_id == rid, AmendmentRow.request_key == key))
        if old:
            if old.request_digest != digest:
                conflict('Request key already binds a different control', 'IDEMPOTENCY_CONFLICT')
            return old.response
        if row.control_revision != body.expected_run_revision:
            conflict()
        if row.state in TERMINAL:
            conflict('Terminal runs cannot be changed')
        value = deepcopy(row.payload)
        event_type = 'state_changed'
        if operation == 'pause':
            if row.state == 'paused':
                conflict('Run is already paused')
            value['state'] = 'paused'
        elif operation == 'cancel':
            from .agent_controls import cancel_jobs
            cancel_jobs(s, row)
            value.update(state='cancelled', finished_at=now(), stop_reason='Cancelled by operator')
            for question in s.scalars(select(QuestionRow).where(QuestionRow.run_id == rid, QuestionRow.status == 'open')):
                question.status = 'cancelled'
                question.payload = {**question.payload, 'status': 'cancelled'}
            value['open_question_ids'] = []
        elif operation == 'resume':
            if row.state not in {'paused', 'waiting_for_input'}:
                conflict('Only paused or input-waiting runs can resume')
            if value['open_question_ids'] or (value['mode'] == 'review_plan' and (row.plan_dirty or row.accepted_plan_revision != row.plan_revision)):
                conflict('Outstanding questions or plan review must be resolved')
            self.inputs(s, pid, ResearchRun.model_validate(row.payload).inputs, self.effective_policy(s, row))
            value['state'] = 'queued'
        elif operation == 'review-plan':
            if value['mode'] != 'review_plan' or body.expected_plan_revision != row.plan_revision or row.plan_revision == 0 or row.plan_dirty:
                conflict('Plan review does not match current reviewable plan')
            row.accepted_plan_revision = row.plan_revision
            if row.state == 'waiting_for_input' and not value['open_question_ids']:
                value['state'] = 'queued'
        elif operation == 'amend':
            from .agent_db import finalization_for
            if finalization_for(s, rid):
                conflict('Finalization has frozen the run; use a linked continuation after termination')
            if body.expected_plan_revision != row.plan_revision:
                conflict('Plan revision changed')
            server, project = self.policies(s, pid, body.policy_revision)
            # An amendment may narrow or refresh authority, never exceed the accepted ceiling.
            policy = intersect_policy(server, project, AuthorityPolicy.model_validate(row.policy))
            inputs = body.inputs or ResearchRun.model_validate(value).inputs
            self.inputs(s, pid, inputs, policy)
            value.update(inputs=inputs.model_dump(mode='json'), objective=body.objective or value['objective'],
                         policy=policy.reference().model_dump(mode='json'), limits=policy.limits.model_dump(mode='json'))
            row.policy = policy.model_dump(mode='json')
            row.accepted_plan_revision = 0
            row.plan_dirty = True
            if value['mode'] == 'review_plan' and row.state != 'paused':
                value['state'] = 'waiting_for_input'
            for question in s.scalars(select(QuestionRow).where(QuestionRow.run_id == rid, QuestionRow.status == 'open')):
                question.status = 'superseded'
                question.payload = {**question.payload, 'status': 'superseded'}
            value['open_question_ids'] = []
        elif operation == 'answer':
            question = s.scalar(select(QuestionRow).where(QuestionRow.id == qid, QuestionRow.run_id == rid))
            if not question or question.status != 'open' or question.revision != body.expected_question_revision:
                conflict('Question is no longer current', 'QUESTION_STALE')
            typed = ResearchQuestion.model_validate(question.payload)
            if typed.expires_at and typed.expires_at <= now():
                conflict('Question has expired', 'QUESTION_STALE')
            if set(body.answers) != {q.id for q in typed.questions}:
                raise DomainError('Answer every field in the current question')
            # A durable attributed message is retained even for runs without an initial conversation.
            cid = value['inputs'].get('conversation_id')
            if not cid:
                cid = uid()
                s.add(ConversationRow(id=cid, project_id=pid, created_at=now()))
                s.flush()
            last = s.scalar(select(MessageRow.sequence).where(MessageRow.conversation_id == cid).order_by(MessageRow.sequence.desc()).limit(1)) or 0
            mid = uid()
            import json
            s.add(MessageRow(id=mid, project_id=pid, conversation_id=cid, sequence=last + 1,
                actor='operator', content=json.dumps(body.answers), created_at=now()))
            question.answer = {'answers': body.answers, 'message_id': mid, 'actor': 'operator'}
            question.status = 'answered'
            question.payload = {**question.payload, 'status': 'answered', 'answer_message_id': mid}
            value['open_question_ids'] = [q for q in value['open_question_ids'] if q != qid]
            if row.state == 'waiting_for_input' and not value['open_question_ids'] and (value['mode'] == 'autopilot' or (not row.plan_dirty and row.accepted_plan_revision == row.plan_revision)):
                value['state'] = 'queued'
            event_type = 'question_changed'
        else:
            raise ValueError('Unknown control')
        value['control_revision'] += 1
        row.claim_token += 1
        self.save(row, value)
        self.event(s, row, event_type, question_id=qid)
        s.add(AmendmentRow(id=uid(), project_id=pid, run_id=rid, request_key=key, request_digest=digest,
            operation=operation, payload=body.model_dump(mode='json'), response=row.payload, created_at=now()))
        s.flush()
        return row.payload

    def continue_from(self, s, pid, rid, body, key):
        """Continue terminal research with a new policy-checked, linked identity.

        The source run and its accounting remain immutable. Normal creation
        admission, input authority and request-key checks apply to the new run.
        """
        source = self.get(s, pid, rid, lock=True)
        if source.state not in TERMINAL:
            conflict('Only terminal runs require a linked continuation')
        old = s.scalar(select(RunRow).where(RunRow.project_id == pid, RunRow.request_key == key))
        if old and old.payload.get('continued_from_run_id') != rid:
            conflict('Request key belongs to a different continuation', 'IDEMPOTENCY_CONFLICT')
        value = self.create(s, pid, body, key)
        if old:
            return value
        row = self.get(s, pid, value['id'], lock=True)
        self.save(row, {**value, 'continued_from_run_id': rid})
        s.flush()
        return row.payload

    def events(self, s, pid, rid, after=0, limit=100):
        self.get(s, pid, rid)
        return [e.payload for e in s.scalars(select(EventRow).where(EventRow.run_id == rid,
            EventRow.sequence > after).order_by(EventRow.sequence).limit(limit))]

    def history(self, s, pid, after='', limit=50):
        from .services import project
        project(s, pid)
        return [self.projected_payload(s, r) for r in s.scalars(select(RunRow).where(RunRow.project_id == pid,
            RunRow.id > after).order_by(RunRow.id).limit(limit))]

    def reconcile(self, s, pid, rid):
        """Checkpoint recovery receives authoritative records, never a merged checkpoint."""
        row = self.get(s, pid, rid, lock=True)
        from .agent_db import ReservationRow, UsageRow
        return {'run': self.projected_payload(s, row), 'policy': self.effective_policy(s, row).model_dump(mode='json'),
            'reservations': [{'request_id': r.request_id, 'payload': r.payload} for r in s.scalars(
                select(ReservationRow).where(ReservationRow.run_id == rid))],
            'usage_entries': [{'request_id': r.request_id, 'payload': r.payload} for r in s.scalars(
                select(UsageRow).where(UsageRow.run_id == rid))],
            'claim_token': row.claim_token, 'plan_dirty': row.plan_dirty,
            'actions': [{'id': a.id, 'state': a.state, 'request': a.request, 'outcome': a.outcome}
                for a in s.scalars(select(ActionRow).where(ActionRow.run_id == rid))],
            'jobs': [{'action_id': j.action_id, 'job_id': j.job_id, 'ownership': j.ownership}
                for j in s.scalars(select(RunJobRow).where(RunJobRow.run_id == rid))]}

    def publish_plan(self, s, pid, rid, plan: ResearchPlan, expected_revision):
        row = self.get(s, pid, rid, lock=True)
        self.assert_dispatch(s, row)
        if row.control_revision != expected_revision or row.state in TERMINAL | {'paused'}:
            conflict()
        if plan.project_id != pid or plan.run_id != rid or plan.revision != row.plan_revision + 1:
            conflict('Plan ownership or revision does not match')
        s.add(PlanRow(id=plan.id, project_id=pid, run_id=rid, revision=plan.revision,
                      payload=plan.model_dump(mode='json')))
        value = deepcopy(row.payload)
        value.update(plan_revision=plan.revision, control_revision=row.control_revision + 1)
        if value['mode'] == 'review_plan':
            value['state'] = 'waiting_for_input'
        self.save(row, value)
        row.plan_dirty = False
        self.event(s, row, 'plan_changed')
        s.flush()
        return row.payload

    def ask(self, s, pid, rid, question: ResearchQuestion, expected_revision):
        row = self.get(s, pid, rid, lock=True)
        self.assert_dispatch(s, row)
        if row.control_revision != expected_revision or row.state in TERMINAL | {'paused'}:
            conflict()
        if question.project_id != pid or question.run_id != rid or question.run_revision != expected_revision or question.status != 'open':
            raise DomainError('Invalid question ownership or revision')
        s.add(QuestionRow(id=question.id, project_id=pid, run_id=rid, revision=question.revision,
                         status='open', payload=question.model_dump(mode='json'), answer=None))
        value = deepcopy(row.payload)
        value.update(control_revision=row.control_revision + 1, state='waiting_for_input',
                     open_question_ids=[*value['open_question_ids'], question.id])
        self.save(row, value)
        self.event(s, row, 'question_changed', question_id=question.id)
        s.flush()
        return row.payload

    def prepare_action(self, s, pid, rid, action_key, request, expected_revision, *, attempt=1):
        """Trusted E03 intent boundary. Replay returns accepted intent before any effect.

        Typed tool validation and aggregate reservations remain E03/E05 duties.
        The request includes tool, version, arguments and input/protocol identity.
        """
        key_check(action_key)
        row = self.get(s, pid, rid, lock=True)
        self.assert_dispatch(s, row)
        from .agent_db import finalization_for
        if finalization_for(s, rid) and request['tool'] not in {
                'build_report', 'verify_report', 'inspect_project', 'inspect_dataset',
                'list_artifacts', 'read_artifact', 'read_job', 'read_evaluation',
                'read_memory', 'read_failure', 'search_failures', 'read_evidence_span', 'search_evidence'}:
            conflict('Finalization fences further scientific work')
        digest = request_digest('agent_action', request)
        old = s.scalar(select(ActionRow).where(ActionRow.run_id == rid,
            ActionRow.action_key == action_key, ActionRow.attempt == attempt))
        if old:
            if old.request_digest != digest:
                conflict('Action key already binds different arguments', 'IDEMPOTENCY_CONFLICT')
            if old.state != 'prepared':
                return old
            if old.control_revision != row.control_revision or old.claim_token != row.claim_token:
                conflict('Prepared action belongs to an earlier run revision')
        if row.control_revision != expected_revision or row.state in TERMINAL | {'paused'}:
            conflict('Run is fenced against new actions')
        if row.payload['open_question_ids']:
            conflict('Resolve pending questions before preparing an action')
        policy = self.effective_policy(s, row)
        try:
            authorize_action(policy, project_id=pid, tool=request['tool'],
                material_ids=frozenset(request.get('material_ids', [])),
                artifact_ids=frozenset(request.get('artifact_ids', [])),
                scientific_model=request.get('scientific_model'))
        except PolicyDenied:
            raise DomainError('Action exceeds current authority', 403, 'POLICY_DENIED') from None
        if interruption_reason(mode=row.payload['mode'], plan_accepted=(not row.plan_dirty and row.plan_revision > 0 and row.accepted_plan_revision == row.plan_revision), tool=request['tool']):
            conflict('Current plan requires review')
        if old:
            return old
        if attempt < 1:
            raise DomainError('Attempt must be positive')
        if attempt > 1:
            previous = s.scalar(select(ActionRow).where(ActionRow.run_id == rid,
                ActionRow.action_key == action_key, ActionRow.attempt == attempt - 1))
            if not previous or previous.state != 'failed':
                conflict('Only a known failed attempt may be retried')
        action = ActionRow(id=uid(), project_id=pid, run_id=rid, action_key=action_key,
            attempt=attempt, request_digest=digest, request=request, state='prepared', assignment_id=None, outcome=None,
            control_revision=row.control_revision, claim_token=row.claim_token)
        s.add(action)
        self.event(s, row, 'action_changed', action_id=action.id)
        s.flush()
        return action

    def bind_job(self, s, pid, rid, aid, job_id, *, ownership='owned', finalization=False):
        """Call in the project-locked transaction containing scientific submission.

        Acquire the project barrier before submit_job's savepoint, as B04 does.
        This is essential for rollback with SQLite's deferred transaction mode.
        """
        row = self.get(s, pid, rid, lock=True)
        action = s.scalar(select(ActionRow).where(ActionRow.id == aid, ActionRow.run_id == rid))
        self.assert_dispatch(s, row)
        if not action:
            raise DomainError('Action does not belong to run', 404, 'REFERENCE_INVALID')
        old = s.get(RunJobRow, (rid, aid))
        if old:
            if old.job_id != job_id:
                conflict('Action already binds a different job', 'IDEMPOTENCY_CONFLICT')
            return old
        if action.state != 'prepared' or row.state in TERMINAL | {'paused'} or action.control_revision != row.control_revision or action.claim_token != row.claim_token:
            conflict('Action cannot submit a job in the current state')
        from .db import JobRow
        job = s.get(JobRow, job_id)
        if not job or job.project_id != pid:
            raise DomainError('Job does not belong to project', 404, 'REFERENCE_INVALID')
        if ownership not in {'owned', 'shared'}:
            raise DomainError('Invalid job ownership')
        policy = self.effective_policy(s, row)
        try:
            authorize_action(policy, project_id=pid, tool=action.request['tool'],
                material_ids=frozenset(action.request.get('material_ids', [])),
                artifact_ids=frozenset(action.request.get('artifact_ids', [])),
                scientific_model=action.request.get('scientific_model'))
        except PolicyDenied:
            raise DomainError('Action exceeds current authority', 403, 'POLICY_DENIED') from None
        # E05: job acceptance, linkage and budget consumption share one transaction.
        from .budgets import BudgetService, Resources
        budgets = BudgetService(self)
        request_id = 'job:' + aid
        resources = Resources(tool_calls=1, scientific_attempts=1 if ownership == 'owned' else 0,
                              transient_retries=1 if action.attempt > 1 else 0)
        budgets.reserve(s, pid, rid, request_id, resources,
            request_sha256=request_digest('scientific_job', {'job_id': job.id, 'ownership': ownership, 'finalization': finalization}),
            expected_revision=action.control_revision, claim_token=action.claim_token,
            assignment_id=action.assignment_id, finalization=finalization)
        if budgets.dispatch(s, pid, rid, request_id):
            budgets.settle(s, pid, rid, request_id, resources)
        link = RunJobRow(run_id=rid, action_id=aid, project_id=pid, job_id=job_id, ownership=ownership)
        s.add(link)
        action.state, action.outcome = 'submitted', {'job_id': job_id}
        self.event(s, row, 'action_changed', action_id=aid)
        s.flush()
        return link

    def projected_payload(self, s, row):
        """Terminal state stays immutable while late billed usage remains visible."""
        from .agent_db import ReservationRow
        from .budgets import BudgetService
        rows = s.scalars(select(ReservationRow).where(ReservationRow.run_id == row.id)).all()
        if not rows or any(r.payload.get('intent', {}).get('version') != 'e05.v1' for r in rows):
            return row.payload
        value = deepcopy(row.payload)
        value['usage'] = BudgetService(self).snapshot(s, row.project_id, row.id).model_dump(mode='json')
        return value

    def finish(self, s, pid, rid, expected_revision, *, state, artifact_ids, stop_reason=None):
        """Trusted finalization commits validated references and its event atomically."""
        row = self.get(s, pid, rid, lock=True)
        self.assert_dispatch(s, row)
        if row.control_revision != expected_revision or row.state in TERMINAL | {'paused'}:
            conflict()
        if state not in {'completed', 'partially_completed', 'failed'}:
            raise DomainError('Invalid finalization state')
        if len(set(artifact_ids)) != len(artifact_ids):
            raise DomainError('Duplicate result artifacts')
        for aid in artifact_ids:
            artifact = s.get(ArtifactRow, aid)
            if not artifact or artifact.project_id != pid:
                raise DomainError('Result artifact not found in project', 404, 'REFERENCE_INVALID')
        active = s.scalar(select(ActionRow.id).where(ActionRow.run_id == rid,
            ActionRow.state.in_(['prepared', 'submitted', 'unknown'])).limit(1))
        if active:
            conflict('Reconcile outstanding actions before finalization')
        value = deepcopy(row.payload)
        value.update(state=state, finished_at=now(), stop_reason=stop_reason,
            result_artifact_ids=artifact_ids, control_revision=row.control_revision + 1)
        self.save(row, value)
        row.claim_token += 1
        self.event(s, row, 'result_published', artifact_ids=artifact_ids)
        s.flush()
        return row.payload

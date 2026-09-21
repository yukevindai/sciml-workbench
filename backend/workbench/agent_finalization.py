"""E13 durable review/capture/export/verification, without provider-held authority."""
import io
import json
import hashlib
from pathlib import Path
from importlib.metadata import version

from sqlalchemy import select

from .agent_db import FinalizationRow, ActionRow, AssignmentRow, PlanRow, RunJobRow, RuntimeVersionRow
from .agent_review import checked_candidate, candidate_digest, apply_review
from .artifacts import ArtifactResolver
from .contracts import now
from .db import JobRow
from .egress import SecretGuard
from .errors import DomainError
from .model_provider import ProviderError, ADAPTER_VERSION
from .projections import ReadScope
from .reports import ReportSelection
from .request_identity import request_digest
from .research_contracts import AgentExecutionRecord, ExecutionVersions, ResearchPlan
from .scientific_contracts import Claim, ClaimSet
from .services import save, software
from .storage import StorageError
from .submission import SubmissionService, SubmissionScope


def execution_versions(model, provider, prompt):
    source = hashlib.sha256()
    for path in sorted(Path(__file__).parent.glob('*.py')):
        source.update(path.name.encode() + b'\0' + path.read_bytes())
    from .egress import SYSTEM_BOUNDARY
    return ExecutionVersions(workbench_revision=software()['workbench'] + '+' + source.hexdigest(), provider='anthropic', model=model,
        model_revision=provider.resolved_model(model), provider_sdk=ADAPTER_VERSION + ';httpx/' + version('httpx'),
        runtime='langgraph/' + version('langgraph'), checkpointer='langgraph-checkpoint-postgres/' + version('langgraph-checkpoint-postgres'),
        prompt=request_digest('coordinator_prompt', [SYSTEM_BOUNDARY, prompt]), tool_catalog='1.0')


def retain_versions(session, run, versions):
    payload = ExecutionVersions.model_validate(versions).model_dump(mode='json')
    digest = request_digest('runtime_versions', payload)
    if session.get(RuntimeVersionRow, (run.id, digest)) is None:
        session.add(RuntimeVersionRow(run_id=run.id, project_id=run.project_id, sha256=digest,
            payload=payload, created_at=now()))
        session.flush()


class Finalizer:
    def __init__(self, db, store, settings, runs, *, reviewer=None):
        self.db, self.store, self.settings, self.runs, self.reviewer = db, store, settings, runs, reviewer
        self.guard = SecretGuard(settings)

    def begin(self, pid, rid, *, claims, versions, export=False, stop_reason=None):
        """Freeze one candidate before any review/provider or export effect."""
        versions = ExecutionVersions.model_validate(versions)
        with self.db.session.begin() as s:
            run = self.runs.get(s, pid, rid, lock=True)
            self.runs.assert_dispatch(s, run)
            retain_versions(s, run, versions)
            plan = s.scalar(select(PlanRow).where(PlanRow.run_id == rid, PlanRow.revision == run.plan_revision))
            export = bool(export or (plan and any('report' in step['expected_artifact_kinds'] for step in plan.payload['steps'])))
            old = s.get(FinalizationRow, rid)
            if old:
                # A changed candidate is not a retry and cannot inherit review.
                if (old.candidate['submitted_digest'] != candidate_digest(claims)
                        or old.candidate['export'] != export or old.candidate['stop_reason'] != stop_reason):
                    raise DomainError('Finalization candidate is already frozen', 409, 'IDEMPOTENCY_CONFLICT')
                return
            if run.plan_dirty or run.payload['open_question_ids']:
                raise DomainError('Resolve the current plan and questions first', 409, 'RUN_REVISION_CHANGED')
            if s.scalar(select(ActionRow.id).where(ActionRow.run_id == rid,
                    ActionRow.state.in_(['prepared', 'submitted', 'unknown'])).limit(1)):
                raise DomainError('Reconcile accepted effects before finalization', 409, 'PROJECT_BUSY')
            policy = self.runs.effective_policy(s, run)
            jobs = frozenset(s.scalars(select(RunJobRow.job_id).where(RunJobRow.run_id == rid, RunJobRow.ownership != 'detached')))
            scope = ReadScope(pid, 'agent', rid, policy.artifact_ids, jobs)
            checked, removed = checked_candidate(s, self.store, scope, claims)
            self.guard.check([c.model_dump(mode='json') for c in checked])
            candidate = {'submitted_digest': candidate_digest(claims), 'claims': [c.model_dump(mode='json') for c in checked],
                'export': export, 'stop_reason': stop_reason, 'removed': removed}
            if len(json.dumps(candidate).encode()) > 128000:
                raise DomainError('Final candidate exceeds capture bound', 422, 'VALIDATION_FAILED')
            initial_versions = s.scalar(select(RuntimeVersionRow).where(RuntimeVersionRow.run_id == rid)
                .order_by(RuntimeVersionRow.created_at, RuntimeVersionRow.sha256)).payload
            s.add(FinalizationRow(run_id=rid, project_id=pid, control_revision=run.control_revision,
                candidate_sha256=candidate_digest(checked), candidate=candidate, versions=initial_versions,
                state='review' if checked else 'capture', result={'issues': ['Invalid claims removed'] if removed else [], 'retries': 0},
                created_at=now()))

    def advance(self, pid, rid):
        with self.db.session.begin() as s:
            run = self.runs.get(s, pid, rid, lock=True)
            self.runs.assert_dispatch(s, run)
            from .agent_recovery import reconcile_effects
            reconcile_effects(s, self.runs, pid, rid)
            row = s.get(FinalizationRow, rid)
            if row is None or row.project_id != pid:
                raise DomainError('Finalization not found', 404, 'REFERENCE_INVALID')
            state = row.state
        if state == 'review':
            return self._review(pid, rid)
        if state == 'capture':
            try:
                return self._capture(pid, rid)
            except (DomainError, StorageError, ValueError) as exc:
                if isinstance(exc, DomainError) and exc.error_code == 'RUN_REVISION_CHANGED':
                    raise
                # A factual record is still useful when export admission fails.
                return self._capture(pid, rid, export_failed=True)
        if state == 'export':
            return self._verify(pid, rid)
        raise DomainError('Finalization is already terminal', 409, 'RUN_REVISION_CHANGED')

    def _review(self, pid, rid):
        with self.db.session() as s:
            row = s.get(FinalizationRow, rid)
            claims = [Claim.model_validate(c) for c in row.candidate['claims']]
        accepted, issues, review = [], [], None
        try:
            if self.reviewer is None:
                raise ProviderError('review_unavailable')
            result, assignment_id = self.reviewer.review(pid, rid, claims)
            accepted, removed = apply_review(claims, result, assignment_id)
            if removed:
                issues.append('Unsupported or qualified claims removed')
            review = {'assignment_id': assignment_id, **result.model_dump(mode='json'),
                'model': self.reviewer.model, 'model_revision': self.reviewer.provider.resolved_model(self.reviewer.model),
                'adapter': ADAPTER_VERSION, 'prompt_version': 'independent-review/1.0'}
        except (ProviderError, DomainError, ValueError, StorageError) as exc:
            if isinstance(exc, DomainError) and exc.error_code == 'RUN_REVISION_CHANGED':
                raise
            issues.append('Independent review unavailable; narrative claims omitted')
        with self.db.session.begin() as s:
            run = self.runs.get(s, pid, rid, lock=True)
            self.runs.assert_dispatch(s, run)
            row = s.get(FinalizationRow, rid)
            row.result = {**row.result, 'claims': [c.model_dump(mode='json') for c in accepted],
                'review': review, 'issues': row.result['issues'] + issues}
            row.state = 'capture'
        return {}, 'queued'

    def _safe_text(self, value):
        from .egress import EgressDenied
        try:
            self.guard.check(value)
            return value
        except EgressDenied:
            return '[withheld by credential filter]'

    def _capture(self, pid, rid, export_failed=False):
        with self.db.session.begin() as s:
            run = self.runs.get(s, pid, rid, lock=True)
            self.runs.assert_dispatch(s, run)
            row = s.get(FinalizationRow, rid)
            if row.state != 'capture':
                raise DomainError('Capture state changed', 409, 'RUN_REVISION_CHANGED')
            policy = self.runs.effective_policy(s, run)
            resolver = ArtifactResolver(s, pid, policy.artifact_ids)
            science = [a for a in resolver.closure(policy.artifact_ids)
                if a.kind not in {'report', 'agent_execution', 'claim_set'}
                and not (a.kind == 'provenance' and a.activity == 'report')]
            aids = {a.id for a in science}
            links = list(s.scalars(select(RunJobRow).where(RunJobRow.run_id == rid, RunJobRow.ownership != 'detached')))
            jobs = [s.get(JobRow, link.job_id) for link in links]
            jobs = [j for j in jobs if j.kind != 'report']
            if any(j.state not in {'succeeded', 'failed'} for j in jobs):
                raise DomainError('Science is still active', 409, 'PROJECT_BUSY')
            issues = list(row.result['issues'])
            if export_failed:
                issues.append('Report admission or capture failed; export is unverified')
            if row.candidate['stop_reason']:
                issues.append(row.candidate['stop_reason'])
            if any(j.state == 'failed' for j in jobs):
                issues.append('Some scientific jobs failed')
            if s.scalar(select(AssignmentRow.id).where(AssignmentRow.run_id == rid,
                    AssignmentRow.state != 'completed').limit(1)):
                issues.append('Some specialist work is incomplete')
            usage = self.runs.projected_payload(s, run)['usage']
            if usage['unknown_request_ids']:
                issues.append('Some provider usage outcomes remain unknown')
            claims = [Claim.model_validate(c) for c in row.result.get('claims', [])]
            scoped_claims = [c for c in claims if (
                {r.source_artifact_id for r in c.source_references}
                | {r.artifact_id for r in c.metric_references} | ({c.split_id} if c.split_id else set())) <= aids]
            if len(scoped_claims) != len(claims):
                issues.append('Claim authority was narrowed; affected claims omitted')
            claims = scoped_claims
            if claims:
                parents = sorted({r.source_artifact_id for c in claims for r in c.source_references}
                    | {r.artifact_id for c in claims for r in c.metric_references} | {c.split_id for c in claims if c.split_id})
                claim_set = save(s, ClaimSet(project_id=pid, parents=parents, run_id=rid, revision=1, claims=claims))
                row.claim_set_id = claim_set.id
                aids.add(claim_set.id)
                s.flush()
            plans = [ResearchPlan.model_validate(p.payload) for p in s.scalars(select(PlanRow).where(PlanRow.run_id == rid).order_by(PlanRow.revision))]
            for plan in plans:
                plan.rationale_summary = self._safe_text(plan.rationale_summary)
                for step in plan.steps:
                    step.objective = self._safe_text(step.objective)
                    step.completion_criteria = [self._safe_text(v) for v in step.completion_criteria]
            actions = list(s.scalars(select(ActionRow).where(ActionRow.run_id == rid).order_by(ActionRow.id)))
            want_export = row.candidate['export'] and not export_failed
            if (not set(run.payload['inputs']['artifact_ids']) <= policy.artifact_ids
                    or not set(run.payload['inputs']['material_ids']) <= policy.material_ids):
                want_export = False
                issues.append('Original input authority was narrowed; export withheld')
            export_action = None
            if want_export:
                # Exact scientific selection is fixed before export and cannot
                # include the producer report or its own publication event.
                export_action = self.runs.prepare_action(s, pid, rid, 'final-export',
                    {'tool': 'build_report', 'registry_version': '1.0', 'arguments': {},
                     'artifact_ids': sorted(aids), 'material_ids': sorted(policy.material_ids), 'scientific_model': None}, run.control_revision)
            record = AgentExecutionRecord(project_id=pid, parents=sorted(aids), run_id=rid, software=software(),
                objective=self._safe_text(run.payload['objective']), inputs=run.payload['inputs'],
                policy=policy.reference(), plan_revisions=plans, decisions=[],
                assignment_ids=list(s.scalars(select(AssignmentRow.id).where(AssignmentRow.run_id == rid).order_by(AssignmentRow.id))),
                actions=[dict(action_id=a.id, attempt_id=str(a.attempt), tool=a.request['tool'],
                    tool_version=a.request.get('registry_version', '1.0'), request_sha256=a.request_digest,
                    state=a.state, job_id=(a.outcome or {}).get('job_id'),
                    artifact_ids=(a.outcome or {}).get('artifact_ids', [])) for a in actions],
                limits=run.payload['limits'], usage=usage, versions=row.versions,
                state_at_cutoff=run.state, event_cutoff=run.event_sequence, captured_at=now(),
                pending_finalization_action_ids=[export_action.id] if export_action else [])
            self.guard.check(record.model_dump(mode='json'))
            if len(record.model_dump_json().encode()) > 262144:
                raise DomainError('Execution record exceeds capture bound', 422, 'VALIDATION_FAILED')
            save(s, record)
            row.execution_id = record.id
            aids.add(record.id)
            s.flush()
            row.result = {**row.result, 'issues': issues}
            # Final exposure belongs to the frozen export, never to reviewer or
            # subsequent coordinator context. C12 requires all candidates terminal.
            if want_export:
                from .evaluation import evaluation_view, release_evaluation
                from .db import EvaluationJobRow
                for artifact in science:
                    if artifact.kind == 'benchmark':
                        protocol_id = s.scalar(select(EvaluationJobRow.protocol_id).join(JobRow,
                            JobRow.id == EvaluationJobRow.job_id).where(JobRow.project_id == pid,
                            JobRow.result_id == artifact.id))
                        release_evaluation(self.db, SubmissionScope(pid, frozenset(aids), policy.material_ids, rid),
                            protocol_id, session=s)
                        evaluation_view(s, ReadScope(pid, 'agent', rid, frozenset(aids),
                            frozenset(j.id for j in jobs), protocol_id=protocol_id, purpose='final'), artifact)
                selection = ReportSelection(frozenset(aids), frozenset(j.id for j in jobs),
                    run.control_revision, record.event_cutoff, policy.material_ids)
                scope = SubmissionScope(pid, frozenset(aids), policy.material_ids, rid, selection)
                job = SubmissionService(self.db, self.store, self.settings)._submit(scope, 'report', {},
                    action_id=export_action.id, attempt_id='1', session=s)
                self.runs.bind_job(s, pid, rid, export_action.id, job.id,
                    finalization=policy.limits.finalization_scientific_attempts > 0)
                row.report_job_id = job.id
                row.state = 'export'
            row.result = {**row.result, 'issues': issues, 'artifact_ids': sorted(aids),
                'expected_kinds': sorted({k for step in plans[-1].steps for k in step.expected_artifact_kinds}) if plans else [],
                'coverage_known': bool(plans) and all(step.expected_artifact_kinds or step.status == 'completed' for step in plans[-1].steps)}
            if not want_export:
                return self._finish(s, run, row, verified=not row.candidate['export'])
        return {}, 'waiting_for_job'

    def _finish(self, s, run, row, *, verified, report_id=None):
        aids = list(row.result['artifact_ids']) + ([report_id] if report_id else [])
        issues = list(row.result['issues'])
        allowed = self.runs.effective_policy(s, run).artifact_ids
        if not set(aids) <= allowed:
            issues.append('Result authority was narrowed after capture')
            aids = [aid for aid in aids if aid in allowed]
            if report_id not in allowed:
                verified, report_id = False, None
        kinds = {ArtifactResolver(s, run.project_id, allowed).resolve(aid).kind for aid in aids}
        if not row.result['coverage_known'] or not set(row.result['expected_kinds']) <= kinds:
            issues.append('Accepted plan output coverage is incomplete')
        if not verified:
            issues.append('Report export was not verified')
        status = 'partially_completed' if issues else 'completed'
        row.result = {**row.result, 'issues': issues, 'verification': 'structural' if report_id and verified else 'not_run',
                      'scientific_replay': 'not_run', 'report_id': report_id}
        row.state = 'verified' if verified else 'failed'
        self.runs.finish(s, run.project_id, run.id, run.control_revision, state=status,
            artifact_ids=aids, stop_reason='; '.join(dict.fromkeys(issues)) if issues else None)
        return {}, status

    def _verify(self, pid, rid):
        with self.db.session.begin() as s:
            run = self.runs.get(s, pid, rid, lock=True)
            self.runs.assert_dispatch(s, run)
            row = s.get(FinalizationRow, rid)
            job = s.get(JobRow, row.report_job_id)
            if job.state in {'queued', 'running'}:
                return {}, 'waiting_for_job'
            if job.state == 'failed':
                return self._retry_or_finish(s, run, row, job)
            policy = self.runs.effective_policy(s, run)
            if job.result_id not in policy.artifact_ids:
                return self._finish(s, run, row, verified=False)
            report = ArtifactResolver(s, pid, policy.artifact_ids).resolve(job.result_id, 'report')
            expected = job.payload['snapshot_digest']
            blob_key = report.blob_key
        verified = False
        try:
            from .archive import verify_archive
            raw = self.store.get(blob_key)
            from .archive import reject_configured_secrets
            reject_configured_secrets(raw, self.settings)
            files, _ = verify_archive(io.BytesIO(raw))
            captured = json.loads(files['snapshot.json'])
            verified = request_digest('report_snapshot_v1', captured) == expected
        except (StorageError, ValueError, DomainError):
            pass
        with self.db.session.begin() as s:
            run = self.runs.get(s, pid, rid, lock=True)
            self.runs.assert_dispatch(s, run)
            row = s.get(FinalizationRow, rid)
            return self._finish(s, run, row, verified=verified, report_id=job.result_id if verified else None)

    def _retry_or_finish(self, s, run, row, job):
        # Retry at most once, retaining the exact C08 capture and selection.
        if row.result['retries'] or job.error_code not in {'INTERNAL_ERROR', 'WORKER_INTERRUPTED', 'JOB_TIMED_OUT'}:
            return self._finish(s, run, row, verified=False)
        request = job.payload['request']
        selection = ReportSelection(frozenset(request['artifact_ids']), frozenset(request['job_ids']),
            request['revision'], request['execution_cutoff'], frozenset(request['material_ids']))
        scope = SubmissionScope(run.project_id, selection.artifact_ids, selection.material_ids, run.id, selection)
        previous = s.scalar(select(ActionRow).join(RunJobRow, RunJobRow.action_id == ActionRow.id).where(
            RunJobRow.run_id == run.id, RunJobRow.job_id == job.id))
        try:
            # Nested transaction makes rejected retry accounting leave no intent.
            with s.begin_nested():
                action = self.runs.prepare_action(s, run.project_id, run.id, 'final-export', previous.request,
                    run.control_revision, attempt=2)
                retry = SubmissionService(self.db, self.store, self.settings)._submit(scope, 'report', {},
                    action_id=action.id, attempt_id='2', retry_of_job_id=job.id, session=s)
                policy = self.runs.effective_policy(s, run)
                self.runs.bind_job(s, run.project_id, run.id, action.id, retry.id,
                    finalization=policy.limits.finalization_scientific_attempts > 0)
                row.report_job_id = retry.id
                row.result = {**row.result, 'retries': 1}
            return {}, 'waiting_for_job'
        except DomainError as exc:
            if exc.error_code == 'RUN_REVISION_CHANGED':
                raise
            return self._finish(s, run, row, verified=False)

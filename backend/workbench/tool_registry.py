"""E03 server-only typed dispatch. No provider arguments establish authority.

All supported handlers perform metadata work in one project-locked transaction.
Science runs only in the existing durable worker. Unsupported blueprint tools
are not advertised; this module does not enable the agent scheduler.
"""
from dataclasses import dataclass, fields, MISSING
import json
from typing import Literal, get_type_hints

from pydantic import ConfigDict, Field, JsonValue, ValidationError, create_model
from sqlalchemy import select

from .agent_db import RunJobRow, ActionRow
from .agent_policy import PolicyDenied, authorize_action
from .agent_runs import RunService, TERMINAL
from .artifacts import ArtifactResolver, operation_inputs, resolve_material
from .budgets import BudgetService, Resources
from .capabilities import capabilities
from .contract_core import ContractModel, Identifier, ErrorCode
from .contracts import BenchmarkInput
from .db import JobRow
from .errors import DomainError
from .evaluation import evaluation_row, evaluation_status, seal_evaluation, submit_candidate
from .model_provider import ToolDefinition, ContextPart
from .egress import SecretGuard, EgressDenied
from .projections import ReadScope, ReadService
from .reports import ReportSelection
from .submission import SubmissionScope, SubmissionService
from .storage import StorageError


class ToolInput(ContractModel):
    model_config = ConfigDict(extra='forbid', strict=True, allow_inf_nan=False)


def config_model(name, cls):
    """Expose the installed pinned public configuration, rejecting unknown keys."""
    hints = get_type_hints(cls)
    definitions = {}
    for field in fields(cls):
        default = (Field(default_factory=field.default_factory) if field.default_factory is not MISSING
                   else ... if field.default is MISSING else field.default)
        definitions[field.name] = (hints[field.name], default)
    return create_model(name, __base__=ToolInput, **definitions)


from chemdata_auditor import AuditConfig, SplitConfig
AuditOptions = config_model('AuditOptions', AuditConfig)
SplitOptions = config_model('SplitOptions', SplitConfig)


class Empty(ToolInput):
    pass


class ArtifactInput(ToolInput):
    artifact_id: Identifier


class DatasetInput(ToolInput):
    dataset_id: Identifier


class JobInput(ToolInput):
    job_id: Identifier


class ListInput(ToolInput):
    kind: Literal['dataset', 'audit', 'split', 'benchmark', 'evidence', 'failure', 'provenance', 'report', 'evaluation_protocol', 'claim_set'] | None = None
    after: str | None = Field(default=None, max_length=2048)
    limit: int = Field(default=20, ge=1, le=50)


class AuditInput(DatasetInput):
    config: AuditOptions = Field(default_factory=AuditOptions)


class SplitInput(DatasetInput):
    audit_id: Identifier
    config: SplitOptions


class EvidenceInput(ToolInput):
    material_id: Identifier


class MemoryInput(ToolInput):
    after: str = Field(default='', max_length=160)
    limit: int = Field(default=20, ge=1, le=50)


class SealInput(ToolInput):
    candidates: dict[Identifier, BenchmarkInput] = Field(min_length=1, max_length=16)
    primary_metric: str = Field(default='group_mae', max_length=160)
    exploratory: bool = False


class CandidateInput(ToolInput):
    protocol_id: Identifier
    candidate_id: Identifier


class EvaluationInput(ToolInput):
    protocol_id: Identifier
    artifact_id: Identifier | None = None


class ToolResult(ContractModel):
    status: Literal['completed', 'submitted', 'blocked', 'failed']
    action_id: Identifier | None = None
    job_id: Identifier | None = None
    artifact_ids: list[Identifier] = Field(default_factory=list)
    data: dict[str, JsonValue] = Field(default_factory=dict, repr=False)
    error_code: ErrorCode | None = None
    message: str | None = None
    content_class: Literal['aggregates', 'schema'] = 'aggregates'
    untrusted_data: Literal[True] = True

    def context(self, project_id):
        return ContextPart(project_id, self.content_class, self.model_dump_json(), tuple(self.artifact_ids))


@dataclass(frozen=True)
class DispatchContext:
    project_id: str
    run_id: str
    expected_revision: int
    claim_token: int
    # Supplied by the coordinator, never copied from a provider call ID.
    action_key: str
    role: Literal['coordinator'] = 'coordinator'


@dataclass(frozen=True)
class Descriptor:
    name: str
    purpose: str
    input_model: type[ToolInput]
    operation: str | None = None
    version: str = '1.0'
    allowed_roles: tuple[str, ...] = ('coordinator',)
    output_model: type[ToolResult] = ToolResult
    content_class: str = 'aggregates'
    max_result_bytes: int = 16000
    prerequisites: tuple[str, ...] = ('current run control', 'current policy', 'scoped immutable lineage')
    accepted_artifact_versions: tuple[str, ...] = ('1.0', '2.0')

    @property
    def effect(self):
        return 'durable_job' if self.operation else 'controlled_write' if self.name == 'seal_evaluation' else 'read'

    @property
    def retry_class(self):
        return 'same_action_replay'

    @property
    def resources(self):
        return Resources(tool_calls=1, scientific_attempts=int(self.operation is not None))

    @property
    def expected_outputs(self):
        return ('job_id',) if self.operation else ('evaluation_protocol',) if self.name == 'seal_evaluation' else ('bounded_projection',)

    @property
    def required_content_classes(self):
        return frozenset({'aggregates', self.content_class})


DESCRIPTORS = {d.name: d for d in (
    Descriptor('inspect_project', 'Inspect scoped project counts and available operations.', Empty),
    Descriptor('inspect_dataset', 'Inspect dataset schema and declaration status; no rows or source text.', DatasetInput, content_class='schema'),
    Descriptor('list_artifacts', 'Page through authorized artifact identities.', ListInput),
    Descriptor('read_artifact', 'Read an aggregate projection; raw payloads and test outputs stay quarantined.', ArtifactInput),
    Descriptor('read_job', 'Read a linked job status without resubmitting it.', JobInput),
    Descriptor('read_memory', 'Read categorical confirmed preferences and provisional lessons; no saved prose.', MemoryInput),
    Descriptor('read_failure', 'Read an authorized retained failure snapshot with assessments quarantined.', ArtifactInput),
    Descriptor('search_failures', 'Page through authorized retained failure snapshots, not live upstream prose.', MemoryInput),
    Descriptor('run_audit', 'Submit a ChemData Auditor job.', AuditInput, 'audit'),
    Descriptor('generate_split', 'Submit a SciSplit job with an immutable audit parent.', SplitInput, 'split'),
    Descriptor('seal_evaluation', 'Seal exact predeclared benchmark candidates.', SealInput),
    Descriptor('run_baseline', 'Submit one sealed ChemE baseline candidate.', CandidateInput, 'benchmark'),
    Descriptor('read_evaluation', 'Read sealed comparison status without releasing test results.', EvaluationInput),
    Descriptor('ingest_evidence', 'Submit text-layer PDF ingestion for an authorized attachment.', EvidenceInput, 'evidence'),
    Descriptor('build_report', 'Freeze authorized run artifacts and submit report construction.', Empty, 'report'),
)}


class ToolRegistry:
    def __init__(self, db, store, settings, *, runs=None):
        self.db, self.store, self.settings = db, store, settings
        self.runs = runs or RunService()
        self.submissions = SubmissionService(db, store, settings)
        self.reads = ReadService(settings.api_token.get_secret_value())
        self.budgets = BudgetService(self.runs)

    def definitions(self, policy, *, role='coordinator'):
        installed = capabilities(self.settings)
        return [ToolDefinition(d.name, d.purpose, d.input_model) for d in DESCRIPTORS.values()
                if d.name in policy.allowed_tools and role in d.allowed_roles
                and d.required_content_classes <= policy.content_classes
                and (d.operation is None or d.operation in installed.operations)]

    def dispatch(self, context, name, arguments):
        """Return only safe errors; a rejected transaction leaves no actions/jobs/usage."""
        try:
            return self._dispatch(context, name, arguments)
        except EgressDenied:
            return ToolResult(status='blocked', error_code='DATA_EXPOSURE_DENIED', message='Tool result blocked by egress policy.')
        except StorageError as exc:
            return ToolResult(status='failed', error_code=exc.error_code, message='Required retained content is unavailable or corrupt.')
        except (ValidationError, TypeError, ValueError, RecursionError):
            return ToolResult(status='blocked', error_code='TOOL_SCHEMA_INVALID', message='Invalid typed tool call.')
        except DomainError as exc:
            code = exc.error_code if exc.error_code in ErrorCode.__args__ else 'POLICY_DENIED'
            return ToolResult(status='blocked', error_code=code, message='Tool call was not admitted; inspect its error code.')
        except Exception:
            # Never feed database, filesystem or adapter exception text to a model.
            # The transaction has rolled back; retry only with the same action key.
            return ToolResult(status='failed', error_code='INTERNAL_ERROR', message='Tool dispatch failed; reconcile the original action identity.')

    def _dispatch(self, context, name, arguments):
        if not isinstance(context, DispatchContext):
            raise DomainError('Trusted dispatch context required', 403, 'POLICY_DENIED')
        descriptor = DESCRIPTORS.get(name) if isinstance(name, str) else None
        if descriptor is None:
            raise DomainError('Tool unavailable', 422, 'UNSUPPORTED_CAPABILITY')
        if context.role not in descriptor.allowed_roles:
            raise DomainError('Role unavailable', 403, 'POLICY_DENIED')
        if not isinstance(arguments, dict) or len(json.dumps(arguments, allow_nan=False).encode()) > 64000:
            raise ValueError()
        args = descriptor.input_model.model_validate(arguments, strict=True)
        payload = args.model_dump(mode='json')
        installed = capabilities(self.settings)
        if descriptor.operation and descriptor.operation not in installed.operations:
            raise DomainError('Operation unavailable', 422, 'UNSUPPORTED_CAPABILITY')
        if name == 'generate_split' and (args.config.strategy not in installed.split_strategies
                or args.config.group_smiles_column or args.config.group_molecular_similarity is not None):
            raise DomainError('Split unavailable', 422, 'UNSUPPORTED_CAPABILITY')
        if name == 'run_audit':
            AuditConfig(**payload['config'])
        if name == 'generate_split':
            SplitConfig(**payload['config'])
        with self.db.session.begin() as s:
            run = self.runs.get(s, context.project_id, context.run_id, lock=True)
            self.runs.assert_dispatch(s, run)
            if (run.control_revision != context.expected_revision or run.claim_token != context.claim_token
                    or run.state in TERMINAL | {'paused', 'waiting_for_input'}):
                raise DomainError('Stale run control', 409, 'RUN_REVISION_CHANGED')
            policy = self.runs.effective_policy(s, run)
            if name in {'run_audit', 'generate_split', 'seal_evaluation', 'run_baseline'}:
                from .agent_evaluation import assert_no_final_tuning
                assert_no_final_tuning(s, run.project_id, run.id)
            if not descriptor.required_content_classes <= policy.content_classes:
                raise DomainError('Projection unavailable', 403, 'DATA_EXPOSURE_DENIED')
            jobs = frozenset(s.scalars(select(RunJobRow.job_id).where(
                RunJobRow.run_id == run.id, RunJobRow.ownership != 'detached')))
            read = ReadScope(run.project_id, 'agent', run.id, policy.artifact_ids, jobs)
            scope = SubmissionScope(run.project_id, policy.artifact_ids, policy.material_ids, run.id)
            aids, mids, scientific_model = self._validate(s, name, args, read, scope, policy, installed)
            prior_action = s.scalar(select(ActionRow).where(ActionRow.run_id == run.id,
                ActionRow.action_key == context.action_key, ActionRow.attempt == 1))
            if name == 'build_report':
                old = prior_action
                if old and old.request.get('tool') == name:
                    aids, mids = set(old.request['artifact_ids']), set(old.request['material_ids'])
            try:
                authorize_action(policy, project_id=run.project_id, tool=name,
                    artifact_ids=frozenset(aids), material_ids=frozenset(mids), scientific_model=scientific_model)
            except PolicyDenied:
                raise DomainError('Policy denied', 403, 'POLICY_DENIED') from None
            request = dict(tool=name, registry_version=descriptor.version, arguments=payload,
                           artifact_ids=sorted(aids), material_ids=sorted(mids), scientific_model=scientific_model)
            from .artifact_reuse import scientific_key, compatible_job
            if descriptor.operation in {'audit', 'split', 'evidence'} and (
                    prior_action is None or 'scientific_key' in prior_action.request):
                request['scientific_key'] = scientific_key(s, scope, descriptor.operation, payload)
            action = self.runs.prepare_action(s, run.project_id, run.id, context.action_key, request, context.expected_revision)
            if action.state in {'completed', 'submitted'}:
                if descriptor.effect == 'read' and action.outcome.get('policy_sha256') != policy.reference().sha256:
                    raise DomainError('Read receipt belongs to earlier authority', 403, 'POLICY_DENIED')
                result = ToolResult.model_validate(action.outcome['result'])
                if result.data.get('reused'):
                    current = compatible_job(s, self.store, scope, descriptor.operation,
                                             request.get('scientific_key'), policy)
                    if current is None or current.id != result.job_id:
                        raise DomainError('Reuse receipt is no longer compatible', 403, 'POLICY_DENIED')
                if name == 'read_evaluation':
                    # Scores remain immutable, but an old clean-holdout label is
                    # not current authority after a manual/final exposure.
                    result = self._read_or_seal(s, name, args, read, scope, installed)
                    result.action_id = action.id
                elif name in {'read_memory', 'read_failure', 'search_failures'}:
                    current = self._read_or_seal(s, name, args, read, scope, installed)
                    if current.data != result.data:
                        raise DomainError('Retrieval changed; use a new action identity', 403, 'DATA_EXPOSURE_DENIED')
            elif action.state != 'prepared':
                raise DomainError('Action not replayable', 409, 'IDEMPOTENCY_CONFLICT')
            elif descriptor.operation:
                reused = compatible_job(s, self.store, scope, descriptor.operation,
                                        request.get('scientific_key'), policy)
                if name == 'build_report':
                    report_jobs = frozenset(s.scalars(select(JobRow.id).where(JobRow.id.in_(jobs), JobRow.kind != 'report')))
                    scope = SubmissionScope(run.project_id, policy.artifact_ids, policy.material_ids, run.id,
                        ReportSelection(frozenset(aids), report_jobs, run.control_revision, run.event_sequence, frozenset(mids)))
                if reused is not None:
                    job = reused
                elif name == 'run_baseline':
                    job = submit_candidate(self.submissions, scope, args.protocol_id, args.candidate_id,
                        action_id=action.id, attempt_id='1', session=s)
                else:
                    job = self.submissions._submit(scope, descriptor.operation, payload,
                        action_id=action.id, attempt_id='1', session=s)
                self.runs.bind_job(s, run.project_id, run.id, action.id, job.id,
                                   ownership='shared' if reused else 'owned')
                result = (ToolResult(status='completed', action_id=action.id, job_id=job.id,
                    artifact_ids=[job.result_id], data={'reused': True, 'original_job_id': job.id,
                        'scientific_key': request['scientific_key'], 'fresh_execution': False})
                    if reused else ToolResult(status='submitted', action_id=action.id, job_id=job.id))
                action.outcome = {**action.outcome, 'result': result.model_dump(mode='json')}
            else:
                key = 'tool:' + action.id
                self.budgets.reserve(s, run.project_id, run.id, key, descriptor.resources,
                    request_sha256=action.request_digest, expected_revision=context.expected_revision, claim_token=context.claim_token)
                self.budgets.dispatch(s, run.project_id, run.id, key)
                result = self._read_or_seal(s, name, args, read, scope, installed)
                result.action_id = action.id
                result.content_class = descriptor.content_class
                self.budgets.settle(s, run.project_id, run.id, key, descriptor.resources)
                action.state = 'completed'
                action.outcome = {'result': result.model_dump(mode='json'), 'artifact_ids': result.artifact_ids,
                                  'policy_sha256': policy.reference().sha256}
                self.runs.event(s, run, 'action_changed', action_id=action.id)
            if len(result.model_dump_json().encode()) > min(descriptor.max_result_bytes, policy.max_context_bytes):
                raise DomainError('Projection exceeds bound', 403, 'DATA_EXPOSURE_DENIED')
            SecretGuard(self.settings).check(result.model_dump(mode="json"))
            return result

    def _validate(self, s, name, args, read, scope, policy, installed):
        aids, mids, model = set(), set(), None
        resolver = ArtifactResolver(s, scope.project_id, scope.artifact_ids)
        if name in {'inspect_dataset', 'run_audit', 'generate_split'}:
            aids.add(args.dataset_id)
            resolver.resolve(args.dataset_id, 'dataset')
        if name == 'read_artifact':
            aids.add(args.artifact_id)
            value = resolver.resolve(args.artifact_id)
            if value.kind not in {'dataset', 'audit', 'split', 'evidence'}:
                raise DomainError('No safe aggregate projection', 403, 'DATA_EXPOSURE_DENIED')
        if name == 'read_failure':
            aids.add(args.artifact_id)
            resolver.resolve(args.artifact_id, 'failure')
        if name == 'generate_split':
            aids.add(args.audit_id)
            operation_inputs(s, scope.project_id, 'split', args.model_dump(mode='json'), allowed_ids=scope.artifact_ids)
        if name == 'ingest_evidence':
            mids.add(args.material_id)
            value = resolve_material(s, scope.project_id, args.material_id, allowed_ids=scope.material_ids, artifact_ids=scope.artifact_ids)
            if value.media_type != 'application/pdf':
                raise ValueError()
        if name == 'read_job':
            self.reads.job(s, read, args.job_id)
        if name in {'read_evaluation', 'run_baseline'}:
            aids.add(args.protocol_id)
            resolver.resolve(args.protocol_id, 'evaluation_protocol')
            evaluation = evaluation_row(s, scope, args.protocol_id)
            if name == 'read_evaluation' and args.artifact_id:
                aids.add(args.artifact_id)
                resolver.resolve(args.artifact_id, 'benchmark')
            if name == 'run_baseline':
                candidate = evaluation.requests.get(args.candidate_id)
                if candidate is None:
                    raise ValueError()
                aids.update(operation_inputs(s, scope.project_id, 'benchmark', candidate, allowed_ids=scope.artifact_ids))
                model = candidate['model']
        if name == 'seal_evaluation':
            for candidate in args.candidates.values():
                if candidate.model not in policy.scientific_models or candidate.model not in installed.benchmark_models:
                    raise DomainError('Model unavailable', 403, 'POLICY_DENIED')
                aids.update(operation_inputs(s, scope.project_id, 'benchmark', candidate.model_dump(mode='json'), allowed_ids=scope.artifact_ids))
        if name == 'build_report':
            for aid in scope.artifact_ids:
                value = resolver.resolve(aid)
                if value.kind != 'report' and not (value.kind == 'provenance' and value.activity == 'report'):
                    aids.add(aid)
            mids.update(scope.material_ids)
        return aids, mids, model

    def _read_or_seal(self, s, name, args, read, scope, installed):
        if name == 'inspect_project':
            data = {'project_id': scope.project_id, 'artifact_count': len(scope.artifact_ids),
                    'material_count': len(scope.material_ids), 'job_count': len(read.job_ids),
                    'operations': installed.operations}
        elif name == 'list_artifacts':
            data = self.reads.artifact_index(s, read, **args.model_dump()).model_dump(mode='json')
        elif name == 'read_job':
            data = self.reads.job(s, read, args.job_id).model_dump(mode='json')
        elif name == 'read_evaluation':
            from .agent_evaluation import selection_view
            data = selection_view(s, read, args.protocol_id, args.artifact_id)
        elif name == 'read_memory':
            from .agent_memory import MemoryService
            policy = self.runs.effective_policy(s, self.runs.get(s, scope.project_id, scope.run_id))
            data = MemoryService().read(s, read, policy, **args.model_dump())
        elif name == 'read_failure':
            from .agent_memory import failure_snapshot
            data = failure_snapshot(s, read, args.artifact_id)
        elif name == 'search_failures':
            from .agent_memory import failure_snapshot
            from .db import ArtifactRow
            rows = list(s.scalars(select(ArtifactRow.id).where(ArtifactRow.project_id == scope.project_id,
                ArtifactRow.kind == 'failure', ArtifactRow.id.in_(scope.artifact_ids), ArtifactRow.id > args.after)
                .order_by(ArtifactRow.id).limit(args.limit + 1)))
            data = {'items': [failure_snapshot(s, read, aid) for aid in rows[:args.limit]],
                    'next_cursor': rows[args.limit - 1] if len(rows) > args.limit else None,
                    'coverage': 'retained_workbench_snapshots', 'live_upstream_search': False}
        elif name == 'seal_evaluation':
            protocol = seal_evaluation(self.db, scope,
                {key: value.model_dump(mode='json') for key, value in args.candidates.items()},
                primary_metric=args.primary_metric, exploratory=args.exploratory, session=s)
            return ToolResult(status='completed', artifact_ids=[protocol.id], data={'protocol_id': protocol.id, 'state': 'sealed'})
        else:
            aid = args.dataset_id if name == 'inspect_dataset' else args.artifact_id
            value = ArtifactResolver(s, scope.project_id, scope.artifact_ids).resolve(aid)
            data = {'artifact_id': value.id, 'kind': value.kind, 'schema_version': value.schema_version}
            if value.kind == 'dataset':
                data.update(rows=value.rows, column_count=len(value.columns))
                if name == 'inspect_dataset':
                    data['columns'] = value.columns
                    data['declarations'] = ({key: declaration.origin for key, declaration in
                        ((key, getattr(value.source, key)) for key in type(value.source).model_fields)}
                        if value.schema_version == '2.0' else {'status': 'legacy_unclassified'})
            elif value.kind == 'audit':
                findings = value.result.get('findings', [])
                data.update(execution_status='completed', scientific_acceptance='not_assessed',
                    finding_count=len(findings), severity_counts={severity: sum(f.get('severity') == severity for f in findings)
                        for severity in ('info', 'warning', 'error')})
            elif value.kind == 'split':
                data['partition_counts'] = {part: value.assignments.count(part) for part in ('train', 'validation', 'test', 'excluded')}
            elif value.kind == 'evidence':
                data['ingestion_status'] = 'completed'
            else:
                raise DomainError('No safe aggregate projection', 403, 'DATA_EXPOSURE_DENIED')
        return ToolResult(status='completed', data=data)

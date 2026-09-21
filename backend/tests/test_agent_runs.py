"""B11/B12 committed-state, race, scope and durable recovery acceptance."""
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select, func, update
from sqlalchemy.exc import IntegrityError
from workbench.agent_db import (RunRow, EventRow, ActionRow, ProjectPolicyRow, ServerPolicyRow,
    ReservationRow, MessageRow, QuestionRow)
from workbench.agent_policy import AuthorityPolicy, default_limits
from workbench.agent_runs import RunService
from workbench.api import create_app
from workbench.config import Settings
from workbench.contracts import uid, now
from workbench.errors import DomainError
from workbench.job_metadata import submit_job
from workbench.research_contracts import (RunInput, RunControlInput, RunAmendmentInput,
    PlanAcceptanceInput, ResearchPlan, ResearchQuestion, QuestionAnswerInput)
from test_metadata import old_db, db, migrate, database_url


@pytest.fixture
def service(db):
    policy = AuthorityPolicy(policy_id='trusted', revision=1, project_ids={'p'},
                             provider_models={'model'})
    with db.session.begin() as s:
        s.add(ServerPolicyRow(revision=1, payload=policy.model_dump(mode='json')))
        s.add(ProjectPolicyRow(project_id='p', revision=1, payload=policy.model_dump(mode='json')))
    return RunService(admission=lambda: None)


def body(**changes):
    return RunInput(objective='Audit the declared inputs', inputs={'material_ids': [], 'artifact_ids': []},
                    policy_revision=1, limits=default_limits(), **changes)


def create(db, service, key='create', **changes):
    with db.session.begin() as s:
        return service.create(s, 'p', body(**changes), key)


def mutate(db, service, run, op, key=None, **fields):
    cls = {'amend': RunAmendmentInput, 'review-plan': PlanAcceptanceInput,
           'answer': QuestionAnswerInput}.get(op, RunControlInput)
    qid = fields.pop('qid', None)
    with db.session.begin() as s:
        return service.mutate(s, 'p', run['id'], op,
            cls(expected_run_revision=run['control_revision'], **fields), key or uid(), qid)


def plan(db, service, run):
    with db.session.begin() as s:
        return service.publish_plan(s, 'p', run['id'], ResearchPlan(id=uid(), project_id='p',
            created_at=now(), run_id=run['id'], revision=run['plan_revision'] + 1,
            rationale_summary='Inspect the data', steps=[dict(id='inspect', objective='Inspect',
                depends_on=[], allowed_input_ids=[], expected_artifact_kinds=[],
                completion_criteria=['Report findings'], status='ready')]), run['control_revision'])


def test_concurrent_create_and_control_replay(db, service):
    with ThreadPoolExecutor(max_workers=6) as pool:
        runs = list(pool.map(lambda _: create(db, service), range(6)))
    assert len({r['id'] for r in runs}) == 1
    run = runs[0]
    with ThreadPoolExecutor(max_workers=6) as pool:
        paused = list(pool.map(lambda _: mutate(db, service, run, 'pause', 'pause-key'), range(6)))
    assert all(p == paused[0] for p in paused)
    with db.session() as s:
        assert s.scalar(select(func.count()).select_from(RunRow)) == 1
        assert s.scalar(select(func.count()).select_from(EventRow)) == 2
        assert service.events(s, 'p', run['id'])[1]['sequence'] == 2
    with pytest.raises(DomainError, match='different run'):
        with db.session.begin() as s:
            service.create(s, 'p', body().model_copy(update={'objective': 'Different'}), 'create')


def test_controls_revisions_terminal_and_usage(db, service):
    run = create(db, service)
    with pytest.raises(DomainError, match='Only paused'):
        mutate(db, service, run, 'resume')
    paused = mutate(db, service, run, 'pause', 'pause')
    with pytest.raises(DomainError, match='revision'):
        mutate(db, service, run, 'amend', expected_plan_revision=0, objective='changed')
    resumed = mutate(db, service, paused, 'resume')
    assert resumed['usage'] == run['usage']
    cancelled = mutate(db, service, resumed, 'cancel')
    assert cancelled['finished_at'] and cancelled['stop_reason']
    assert mutate(db, service, run, 'pause', 'pause') == paused
    with pytest.raises(DomainError, match='Terminal'):
        mutate(db, service, cancelled, 'resume')
    with pytest.raises(IntegrityError), db.engine.begin() as c:
        c.execute(update(RunRow).where(RunRow.id == run['id']).values(state='queued'))


def test_review_and_amendment_cannot_accept_stale_plan(db, service):
    run = plan(db, service, create(db, service, mode='review_plan'))
    with pytest.raises(DomainError, match='Outstanding'):
        mutate(db, service, run, 'resume')
    accepted = mutate(db, service, run, 'review-plan', 'accept', expected_plan_revision=1)
    assert accepted['state'] == 'queued'
    assert mutate(db, service, run, 'review-plan', 'accept', expected_plan_revision=1) == accepted
    amended = mutate(db, service, accepted, 'amend', expected_plan_revision=1, objective='New objective')
    with pytest.raises(DomainError, match='reviewable'):
        mutate(db, service, amended, 'review-plan', expected_plan_revision=1)
    replacement = plan(db, service, amended)
    assert mutate(db, service, replacement, 'review-plan', expected_plan_revision=2)['state'] == 'queued'


def test_questions_are_attributed_and_cannot_be_bypassed(db, service):
    run = create(db, service)
    qid = uid()
    with db.session.begin() as s:
        run = service.ask(s, 'p', run['id'], ResearchQuestion(id=qid, project_id='p', created_at=now(),
            run_id=run['id'], revision=1, run_revision=1, status='open', questions=[dict(
                id='target', field='target', prompt='Which target?', blocked_step_ids=['split'],
                options=[], evidence=[])]), 1)
    with pytest.raises(DomainError, match='Outstanding'):
        mutate(db, service, run, 'resume')
    with pytest.raises(DomainError, match='every field'):
        mutate(db, service, run, 'answer', qid=qid, expected_question_revision=1, answers={'other': 'x'})
    answered = mutate(db, service, run, 'answer', 'answer', qid=qid, expected_question_revision=1, answers={'target': 'yield'})
    assert answered['state'] == 'queued' and answered['open_question_ids'] == []
    assert mutate(db, service, run, 'answer', 'answer', qid=qid, expected_question_revision=1, answers={'target': 'yield'}) == answered
    with db.session() as s:
        question = s.get(QuestionRow, qid)
        message = s.get(MessageRow, question.payload['answer_message_id'])
        assert message.actor == 'operator' and 'yield' in message.content


def test_action_job_intent_recovery_and_scope(db, service):
    run = create(db, service)
    request = {'tool': 'run_audit', 'version': '1', 'arguments': {}}
    with db.session.begin() as s:
        action = service.prepare_action(s, 'p', run['id'], 'audit', request, 1)
        job = submit_job(s, 'p', 'report', {}, 'scientific')
        service.bind_job(s, 'p', run['id'], action.id, job.id)
        s.add(ReservationRow(id=uid(), project_id='p', run_id=run['id'], request_id='provider-unknown',
            assignment_id=None, payload={'tokens': 200, 'state': 'unknown'}, created_at=now()))
    # A fresh service/session simulates restart after submission before checkpoint.
    service = RunService(admission=lambda: None)
    with db.session.begin() as s:
        replay = service.prepare_action(s, 'p', run['id'], 'audit', request, 1)
        assert replay.id == action.id and replay.state == 'submitted'
        restored = service.reconcile(s, 'p', run['id'])
        assert restored['jobs'][0]['job_id'] == job.id
        assert s.scalar(select(ReservationRow).where(ReservationRow.request_id == 'provider-unknown')).payload['state'] == 'unknown'
        with pytest.raises(DomainError):
            service.get(s, 'q', run['id'])
    with pytest.raises(DomainError, match='different arguments'), db.session.begin() as s:
        service.prepare_action(s, 'p', run['id'], 'audit', {**request, 'arguments': {'different': True}}, 1)
    with pytest.raises(IntegrityError), db.engine.begin() as c:
        c.execute(update(ActionRow).where(ActionRow.id == action.id).values(request={'checkpoint': 'overwrite'}))
    with pytest.raises(IntegrityError), db.session.begin() as s:
        s.add(EventRow(run_id=run['id'], project_id='p', sequence=1, payload={}))
    with pytest.raises(RuntimeError, match='retained'):
        migrate(db, '0005', downgrade=True)


def test_current_policy_restricts_saved_authority_and_amendment(db, service):
    run = create(db, service)
    denied = AuthorityPolicy(policy_id='trusted', revision=2, project_ids={'p'}, allowed_tools=set())
    with db.session.begin() as s:
        s.add(ProjectPolicyRow(project_id='p', revision=2, payload=denied.model_dump(mode='json')))
    with pytest.raises(DomainError, match='current authority'), db.session.begin() as s:
        service.prepare_action(s, 'p', run['id'], 'audit', {'tool': 'run_audit'}, 1)
    with pytest.raises(DomainError, match='policy revision'):
        mutate(db, service, run, 'amend', expected_plan_revision=0, policy_revision=1)
    changed = mutate(db, service, run, 'amend', expected_plan_revision=0, policy_revision=2)
    with db.session() as s:
        assert not service.effective_policy(s, s.get(RunRow, run['id'])).allowed_tools
    assert changed['policy']['revision'] == 2


def test_prepared_action_is_fenced_by_amendment(db, service):
    run = create(db, service)
    with db.session.begin() as s:
        action = service.prepare_action(s, 'p', run['id'], 'audit', {'tool': 'run_audit'}, 1)
        job = submit_job(s, 'p', 'report', {}, 'job')
    mutate(db, service, run, 'amend', expected_plan_revision=0, objective='Changed')
    with pytest.raises(DomainError, match='current state'), db.session.begin() as s:
        service.bind_job(s, 'p', run['id'], action.id, job.id)
    with pytest.raises(DomainError, match='earlier run revision'), db.session.begin() as s:
        service.prepare_action(s, 'p', run['id'], 'audit', {'tool': 'run_audit'}, 2)


def test_racing_different_controls_have_one_winner(db, service):
    run = create(db, service)
    def change(operation):
        try:
            return mutate(db, service, run, operation)['state']
        except DomainError as error:
            return error.error_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(change, ('pause', 'cancel')))
    assert outcomes.count('RUN_REVISION_CHANGED') == 1
    with db.session() as s:
        events = service.events(s, 'p', run['id'])
        assert len(events) == 2 and events[-1]['run_revision'] == 2


def test_limits_are_narrowed_and_terminal_result_is_atomic(db, service):
    request = body()
    request.limits.model_tokens = 100000
    with db.session.begin() as s:
        run = service.create(s, 'p', request, 'create')
    assert run['limits']['model_tokens'] == default_limits().model_tokens
    with db.session.begin() as s:
        finished = service.finish(s, 'p', run['id'], 1, state='completed', artifact_ids=[])
    assert finished['finished_at'] and finished['control_revision'] == 2
    with db.session() as s:
        assert service.events(s, 'p', run['id'])[-1]['event_type'] == 'result_published'
    with pytest.raises(DomainError), db.session.begin() as s:
        service.finish(s, 'p', run['id'], 1, state='completed', artifact_ids=[])


def test_database_rejects_cross_project_events_and_mismatched_run_payload(db, service):
    run = create(db, service)
    with pytest.raises(IntegrityError), db.session.begin() as s:
        s.add(EventRow(run_id=run['id'], project_id='q', sequence=2, payload={}))
    with pytest.raises(IntegrityError), db.engine.begin() as c:
        c.execute(update(RunRow).where(RunRow.id == run['id']).values(state='running'))


def test_bind_rechecks_policy_after_preparation(db, service):
    run = create(db, service)
    with db.session.begin() as s:
        action = service.prepare_action(s, 'p', run['id'], 'audit', {'tool': 'run_audit'}, 1)
        job = submit_job(s, 'p', 'report', {}, 'job')
        policy = AuthorityPolicy(policy_id='restrictive', revision=2, project_ids={'p'}, allowed_tools=set())
        s.add(ProjectPolicyRow(project_id='p', revision=2, payload=policy.model_dump(mode='json')))
    with pytest.raises(DomainError, match='current authority'), db.session.begin() as s:
        service.bind_job(s, 'p', run['id'], action.id, job.id)


def test_api_auth_scope_unknown_fields_and_sse(tmp_path, db):
    app = create_app(Settings(database_url=database_url(db), storage_root=tmp_path,
        api_token='a' * 48, efm_password='strong-test-password'))
    database = app.state.db
    policy = AuthorityPolicy(policy_id='policy', revision=1, project_ids={'p'})
    with database.session.begin() as s:
        s.add(ServerPolicyRow(revision=1, payload=policy.model_dump(mode='json')))
        s.add(ProjectPolicyRow(project_id='p', revision=1, payload=policy.model_dump(mode='json')))
    with TestClient(app) as client:
        base = '/api/v1/projects/p/agent-runs'
        assert client.get(base).status_code == 401
        client.headers['Authorization'] = 'Bearer ' + 'a' * 48
        client.headers['Idempotency-Key'] = 'key'
        assert client.post(base, json=body().model_dump(mode='json')).status_code == 503
        app.state.runs.admission = lambda: None
        request = body().model_dump(mode='json')
        assert client.post(base, json={**request, 'checkpoint': {}}).status_code == 422
        result = client.post(base, json=request)
        assert result.status_code == 202, result.text
        rid = result.json()['id']
        assert client.post(base, json=request).json()['id'] == rid
        assert client.get(base + '/' + rid).json()['run']['id'] == rid
        assert client.get('/api/v1/projects/q/agent-runs/' + rid).status_code == 404
        for endpoint in ('stream', 'events', 'result'):
            scoped = f'/api/v1/projects/q/agent-runs/{rid}/{endpoint}'
            assert client.get(scoped, headers={'Last-Event-ID': '999999'}).status_code == 404
        stream = client.get(base + '/' + rid + '/stream')
        assert 'id: 1' in stream.text and 'event: accepted' in stream.text
        assert 'id: 1' not in client.get(base + '/' + rid + '/stream', headers={'Last-Event-ID': '1'}).text
        assert client.get(base + '/' + rid + '/stream', headers={'Last-Event-ID': '-1'}).status_code == 422
        assert client.post(base + '/' + rid + '/continue', json=request).status_code == 409
        with database.session.begin() as s:
            app.state.runs.finish(s, 'p', rid, 1, state='completed', artifact_ids=[])
        continued = client.post(base + '/' + rid + '/continue', json=request,
            headers={'Idempotency-Key': 'continuation'})
        assert continued.status_code == 202, continued.text
        assert continued.json()['continued_from_run_id'] == rid
        assert client.post(base + '/' + rid + '/continue', json=request,
            headers={'Idempotency-Key': 'continuation'}).json()['id'] == continued.json()['id']
        client.headers.pop('Authorization')
        assert client.get(base + '/' + rid + '/stream').status_code == 401
        for endpoint in ('', '/events', '/result'):
            assert client.get(base + '/' + rid + endpoint).status_code == 401
        for path in ('/api/v1/projects', '/api/v1/projects/p/artifacts/a/download',
                     '/api/v1/projects/p/research-materials/m/download'):
            assert client.get(path).status_code == 401
    database.engine.dispose()


def test_postgres_checkpoint_setup_restart_and_authoritative_reconciliation(db, service):
    if db.engine.dialect.name != 'postgresql':
        pytest.skip('PostgresSaver requires PostgreSQL')
    from typing import TypedDict
    from sqlalchemy import text
    from langgraph.graph import StateGraph, START, END
    from workbench.checkpoints import saver, config, setup
    run = create(db, service)
    with db.session.begin() as s:
        schema = s.scalar(text('select current_schema()'))
        action = service.prepare_action(s, 'p', run['id'], 'inspect', {'tool': 'inspect_project'}, 1)
    url = db.engine.url.update_query_dict({'options': '-csearch_path=' + schema}).render_as_string(hide_password=False)
    setup(url)
    setup(url)

    class State(TypedDict):
        action_ids: list[str]
        state: str

    graph = StateGraph(State)
    graph.add_node('observe', lambda value: value)
    graph.add_edge(START, 'observe')
    graph.add_edge('observe', END)
    with saver(url) as store:
        graph.compile(checkpointer=store).invoke({'action_ids': [action.id], 'state': 'running'}, config(run['id']))
    paused = mutate(db, service, run, 'pause')
    with saver(url) as store:
        checkpoint = store.get_tuple(config(run['id']))
        assert checkpoint.checkpoint['channel_values']['state'] == 'running'
    with db.session.begin() as s:
        authority = service.reconcile(s, 'p', run['id'])
        assert authority['run']['state'] == 'paused'
        assert authority['run']['control_revision'] == paused['control_revision']
        assert authority['actions'][0]['id'] == action.id

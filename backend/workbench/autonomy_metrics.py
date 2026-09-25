"""E15 safe, ledger-derived evaluation observations (not a scientific grader)."""
from collections import Counter
from sqlalchemy import select

from .agent_db import ActionRow, AmendmentRow, AssignmentRow, QuestionRow, EventRow
from .budgets import BudgetService
from .db import ArtifactRow, JobRow


def observe(session, runs, project_id, run_id):
    run = runs.get(session, project_id, run_id)
    def rows(cls):
        return list(session.scalars(select(cls).where(cls.run_id == run_id)))
    actions, questions = rows(ActionRow), rows(QuestionRow)
    amendments = rows(AmendmentRow)
    operations = Counter(a.operation for a in amendments)
    # Count required question batches even if unanswered; an unanswered question
    # cannot make an autonomous attempt appear to have needed zero help.
    recovery = sum(any(q['field'] == 'recovery' for q in row.payload['questions']) for row in questions)
    interventions = {
        'clarification_batches_required': len(questions) - recovery,
        'recovery_batches_required': recovery,
        'answer_submissions': operations['answer'],
        'plan_approvals': operations['review-plan'],
        'resume_actions': operations['resume'],
        'amendments': operations['amend'],
    }
    jobs = [session.get(JobRow, (a.outcome or {}).get('job_id')) for a in actions
            if (a.outcome or {}).get('job_id')]
    artifacts = [session.get(ArtifactRow, j.result_id) for j in jobs if j and j.result_id]
    return {
        'state': run.state,
        'interventions': interventions,
        'required_interventions': len(questions) + operations['review-plan'] + operations['resume'] + operations['amend'],
        'manual_configuration_edits': None,  # Out-of-band edits are not observable here.
        'setup': 'excluded; disposable fixture provisioning',
        'usage': BudgetService(runs).snapshot(session, project_id, run_id).model_dump(mode='json'),
        'assignments': dict(Counter(a.state for a in rows(AssignmentRow))),
        'trajectory': [{'tool': a.request['tool'], 'state': a.state} for a in actions],
        'events': [{k: event.payload[k] for k in ('sequence', 'event_type', 'state')}
                   for event in session.scalars(select(EventRow).where(EventRow.run_id == run_id)
                                                .order_by(EventRow.sequence))],
        'job_states': dict(Counter(j.state for j in jobs if j)),
        'artifact_kinds': sorted(a.kind for a in artifacts if a),
        'duplicate_job_references': len(jobs) - len({j.id for j in jobs if j}),
        'claim_support_score': None,
    }

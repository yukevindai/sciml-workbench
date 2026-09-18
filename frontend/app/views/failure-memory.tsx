'use client';

import { useState } from 'react';
import { FlaskConical, Search } from 'lucide-react';
import type { Workbench } from '../lib/context';
import { formatDate, shortId } from '../lib/format';
import { Alert, EmptyState, Field, JsonBox, Panel } from '../components/ui';
import { StageGate } from '../components/workflow';

export function FailureMemoryView({ wb }: { wb: Workbench }) {
  const [reason, setReason] = useState('');
  const [uncertainty, setUncertainty] = useState('');
  const [query, setQuery] = useState('');

  const stage = wb.workflow.stages.find(s => s.view === 'failure-memory');
  const lessons = wb.artifacts.filter(a => a.kind === 'failure');
  const matches = lessons.filter(lesson =>
    JSON.stringify(lesson).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <StageGate stage={stage} />

      <Panel
        title="Save a lesson from a run"
        description="A run can finish perfectly and still fail your scientific objective. Record that judgement now, while the reasoning is fresh."
      >
        <Alert variant="info" title="Computational outcome, not an experiment">
          Records saved here are labelled as computational runs. Writing one does not change a run&rsquo;s execution status or assert that a physical experiment failed.
        </Alert>

        <Field label="Benchmark run" hint="Which run are you assessing?">
          {props => (
            <select
              className="select"
              value={wb.selectedRun?.id ?? ''}
              onChange={event => wb.setRunId(event.target.value)}
              {...props}
            >
              <option value="" disabled>Select a run</option>
              {wb.runs.map(run => (
                <option key={run.id} value={run.id}>
                  {run.model} · {run.status} · {shortId(run.id)}
                </option>
              ))}
            </select>
          )}
        </Field>

        <div className="split">
          <Field
            label="Why was this run unsuccessful?"
            hint="What went wrong, or which objective went unmet? Describe the outcome, not a fix."
          >
            {props => (
              <textarea
                className="textarea"
                maxLength={3000}
                placeholder="The model beat the mean baseline overall but failed on every held-out family above 320 K, which is the regime we care about."
                value={reason}
                onChange={event => setReason(event.target.value)}
                {...props}
              />
            )}
          </Field>

          <Field
            label="Uncertainty and limits"
            hint="Separate what you observed from what you suspect. What is still unknown?"
          >
            {props => (
              <textarea
                className="textarea"
                maxLength={3000}
                placeholder="Observed: error grows with temperature. Suspected but untested: too few high-temperature families to learn from."
                value={uncertainty}
                onChange={event => setUncertainty(event.target.value)}
                {...props}
              />
            )}
          </Field>
        </div>

        <div className="panel-foot">
          <span className="field-hint">Saved to the independent Failure Memory service, which keeps its own records.</span>
          <button
            className="button"
            disabled={wb.busy || !wb.projectId || !wb.selectedRun || !reason.trim() || !uncertainty.trim()}
            onClick={() => wb.act(async () => {
              await wb.submit('failure', {
                benchmark_id: wb.selectedRun!.id,
                reason,
                uncertainty_notes: uncertainty,
              });
              setReason('');
              setUncertainty('');
            })}
          >
            <FlaskConical size={15} aria-hidden="true" />Save to Failure Memory
          </button>
        </div>
      </Panel>

      <Panel
        title="Saved lessons"
        description={lessons.length ? `${lessons.length} recorded in this project` : undefined}
        aside={
          lessons.length > 2 ? (
            <div className="cluster">
              <Search size={15} aria-hidden="true" className="dim" />
              <input
                className="input"
                style={{ width: '14rem' }}
                aria-label="Search saved lessons"
                placeholder="Search lessons…"
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
            </div>
          ) : undefined
        }
      >
        {lessons.length === 0 ? (
          <EmptyState icon={FlaskConical} title="Nothing recorded yet">
            The runs that did not work are usually the ones worth remembering. Save the first one above.
          </EmptyState>
        ) : matches.length === 0 ? (
          <p className="field-hint">No saved lesson matches &ldquo;{query}&rdquo;.</p>
        ) : (
          <div className="stack stack--tight">
            {matches.map(lesson => (
              <article className="panel panel--inset" key={lesson.id}>
                <div className="panel-head">
                  <div className="panel-head-text">
                    <h3>{'reason' in lesson ? lesson.reason : 'Recorded lesson'}</h3>
                    <span className="meta-list">
                      <span>{formatDate(lesson.created_at)}</span>
                      <span className="meta-id">{shortId(lesson.id)}</span>
                    </span>
                  </div>
                  <span className="badge badge--success">recorded</span>
                </div>
                <JsonBox value={lesson} />
              </article>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

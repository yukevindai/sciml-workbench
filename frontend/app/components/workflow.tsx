'use client';

import Link from 'next/link';
import { ArrowRight, ChevronRight, Lock } from 'lucide-react';
import type { Stage } from '../lib/pipeline';

/** The stage list, with each stage's state written out in words. */
export function PipelineRail({ stages, current }: { stages: Stage[]; current?: string }) {
  return (
    <ol className="rail">
      {stages.map(stage => (
        <li key={stage.view}>
          <Link
            href={`/${stage.view}`}
            className="rail-step"
            data-state={stage.state}
            aria-current={stage.view === current ? 'step' : undefined}
          >
            <span className="rail-index" aria-hidden="true">
              {stage.state === 'done' ? '✓' : stage.index}
            </span>
            <span className="rail-text">
              <span className="rail-title">{stage.label}</span>
              <span className="rail-status">
                {stage.state === 'locked' && stage.blockedBy ? stage.blockedBy : stage.status}
              </span>
            </span>
            {stage.state === 'locked'
              ? <Lock size={14} className="rail-go" aria-hidden="true" />
              : <ChevronRight size={16} className="rail-go" aria-hidden="true" />}
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** One unambiguous next step, so a researcher never has to infer the order. */
export function NextAction({ stage, hasProject }: { stage?: Stage; hasProject: boolean }) {
  if (!hasProject) {
    return (
      <div className="next-action">
        <div className="next-action-text">
          <span className="next-action-label">Start here</span>
          <h2>Create your first project</h2>
          <p>A project groups one dataset with its sources, runs and results, so everything stays traceable together.</p>
        </div>
        <Link className="button button--lg" href="/projects">
          Create a project <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    );
  }
  if (!stage) {
    return (
      <div className="next-action">
        <div className="next-action-text">
          <span className="next-action-label">Workflow complete</span>
          <h2>Export your reproducible report</h2>
          <p>Every stage has run at least once. The export bundles the original data, configurations, results and a SHA-256 manifest into one archive.</p>
        </div>
        <Link className="button button--lg" href="/report">
          Go to reports <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    );
  }

  const blocked = stage.state === 'locked';
  return (
    <div className="next-action">
      <div className="next-action-text">
        <span className="next-action-label">{blocked ? 'Blocked' : 'Next step'}</span>
        <h2>{blocked ? stage.blockedBy : stage.action}</h2>
        <p>{stage.status}</p>
      </div>
      <Link className="button button--lg" href={`/${stage.view}`}>
        Go to {stage.label.toLowerCase()} <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

/** Shown at the top of a stage the researcher cannot act on yet. */
export function StageGate({ stage }: { stage?: Stage }) {
  if (!stage || stage.state !== 'locked' || !stage.blockedBy) return null;
  return (
    <div className="alert alert--info">
      <Lock size={16} className="alert-icon" aria-hidden="true" />
      <div className="alert-body">
        <strong>{stage.blockedBy}</strong>
        <p>This step needs the one before it to finish. Everything here stays available to read in the meantime.</p>
      </div>
    </div>
  );
}

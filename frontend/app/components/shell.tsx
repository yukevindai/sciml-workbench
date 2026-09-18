'use client';

import Link from 'next/link';
import { Beaker, Loader2, ShieldCheck } from 'lucide-react';
import { NAV_GROUPS, navItem, type Stage, type View } from '../lib/pipeline';
import type { Project } from '../lib/types';
import { ThemeToggle } from './theme-toggle';

/* ---------------------------------- sidebar ------------------------------ */

export function Sidebar({ view, stages }: { view: string; stages: Stage[] }) {
  const stageFor = (target: View) => stages.find(s => s.view === target);

  return (
    <aside className="sidebar">
      <Link href="/projects" className="brand">
        <span className="brand-mark" aria-hidden="true"><Beaker size={19} /></span>
        <span className="brand-text">
          <span className="brand-name">SciML Workbench</span>
          <span className="brand-sub">Traceable research</span>
        </span>
      </Link>

      <div className="sidebar-scroll">
        <nav aria-label="Workbench sections" className="nav-groups">
          {NAV_GROUPS.map(group => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.views.map(target => {
                const item = navItem(target);
                if (!item) return null;
                const stage = stageFor(target);
                const Icon = item.icon;
                return (
                  <Link
                    key={target}
                    href={`/${target}`}
                    className="nav-item"
                    aria-current={target === view ? 'page' : undefined}
                  >
                    <Icon size={16} className="nav-icon" aria-hidden="true" strokeWidth={1.75} />
                    {/* The label is the link's entire accessible name. */}
                    <span className="nav-label">{item.label}</span>
                    {stage && (
                      /* Decorative: the same state is written as a sentence on
                         the workflow rail, so this is hidden from the a11y tree
                         and never joins the link's name. */
                      <span className="nav-marker" data-state={stage.state} aria-hidden="true">
                        {stage.state === 'done' ? '✓' : stage.index}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      <div className="sidebar-foot">
        <div className="sidebar-note">
          <strong><ShieldCheck size={14} aria-hidden="true" />Traceability by design</strong>
          <p>Four independent scientific tools, joined into one workflow. Every result keeps a link to the inputs it came from.</p>
        </div>
        <span className="sidebar-version">MVP · v0.1.0</span>
      </div>
    </aside>
  );
}

/* ---------------------------------- topbar ------------------------------- */

export function TopBar({
  projects, projectId, onProjectChange, busyJobs,
}: {
  projects: Project[];
  projectId: string;
  onProjectChange: (id: string) => void;
  busyJobs: number;
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="project-switcher">
          <label className="visually-hidden" htmlFor="active-project">Active project</label>
          <select
            id="active-project"
            className="select"
            aria-label="Active project"
            value={projectId}
            onChange={event => onProjectChange(event.target.value)}
          >
            <option value="" disabled>Select a project</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="topbar-right">
        <span className={`activity-pill ${busyJobs ? 'activity-pill--busy' : ''}`.trim()}>
          {busyJobs ? (
            <>
              <Loader2 size={13} className="spin" aria-hidden="true" />
              {busyJobs} running
            </>
          ) : (
            <>
              <ShieldCheck size={13} aria-hidden="true" />
              <span>Private workspace</span>
            </>
          )}
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}

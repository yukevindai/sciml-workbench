'use client';

import Link from 'next/link';
import { FlaskConical, ChevronRight, ArrowUpRight, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { NAV_GROUPS, navItem, type Stage, type View } from '../lib/pipeline';
import type { DatasetArtifact, Project } from '../lib/types';
import { ThemeToggle } from './theme-toggle';
import { WorkspacePicker } from './workspace-picker';

/* ---------------------------------- sidebar ------------------------------ */

export function Sidebar({ view, stages }: { view: string; stages: Stage[] }) {
  const stageFor = (target: View) => stages.find(s => s.view === target);

  return (
    <aside className="sidebar">
      <Link href="/ask" className="brand" aria-label="SciML Workbench home">
        <span className="brand-mark" aria-hidden="true"><FlaskConical size={19} /></span>
        <span className="brand-text">
          <span className="brand-name">SciML Workbench</span>
          <span className="brand-sub">Your personal AI lab group</span>
        </span>
      </Link>

      <div className="sidebar-scroll">
        <nav aria-label="Workbench sections" className="nav-groups">
          {NAV_GROUPS.map(group => {
            const links = group.views.map(target => {
              const item = navItem(target);
              if (!item) return null;
              const stage = stageFor(target);
              const Icon = item.icon;
              return (
                <Link
                  key={target}
                  href={`/${target}`}
                  className="nav-item"
                  aria-label={item.label}
                  title={item.label}
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
            });
            // Hand-operated tools stay one click away without crowding the simple start.
            return group.advanced ? (
              <details className="nav-group nav-group--advanced" key={group.label} open={view !== 'ask' || undefined}>
                <summary className="nav-group-label"><ChevronRight size={13} className="disclosure-chevron" aria-hidden="true" />{group.label}</summary>
                {links}
              </details>
            ) : (
              <div className="nav-group" key={group.label}>
                <span className="nav-group-label">{group.label}</span>
                {links}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-foot">
        <Link href="/" className="sidebar-home">About SciML Workbench <ArrowUpRight size={14} aria-hidden="true" /></Link>
      </div>
    </aside>
  );
}

/* ---------------------------------- topbar ------------------------------- */

export function TopBar({
  projects, projectId, onProjectChange, busyJobs, datasets, datasetId, onDatasetChange, loading, preview, locked, simple = false,
}: {
  projects: Project[];
  projectId: string;
  onProjectChange: (id: string) => void;
  busyJobs: number;
  datasets: DatasetArtifact[];
  datasetId: string;
  onDatasetChange: (id: string) => void;
  loading: boolean;
  preview: boolean;
  locked: boolean;
  simple?: boolean;
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="project-switcher">
          <WorkspacePicker label="Active project" value={projectId}
            options={projects.map(project => ({ value: project.id, label: project.name }))}
            onChange={onProjectChange} disabled={loading || preview || locked}
            placeholder={loading ? 'Loading projects…' : 'New project'}
            onCreate={simple ? () => onProjectChange('') : undefined} />
        </div>
        {!simple && <div className="project-switcher">
          <label className="field-label" htmlFor="active-dataset">Active dataset</label>
          <select id="active-dataset" className="select" value={datasetId}
            disabled={loading || preview || locked || !datasets.length}
            onChange={event => onDatasetChange(event.target.value)}>
            <option value="" disabled>{loading ? 'Loading datasets…' : 'No dataset selected'}</option>
            {datasets.map(dataset => <option key={dataset.id} value={dataset.id}>{dataset.filename} · {dataset.id.slice(0, 8)}</option>)}
          </select>
        </div>}
      </div>

      <div className="topbar-right">
        {(busyJobs > 0 || preview) && <span className={`activity-pill ${busyJobs ? 'activity-pill--busy' : ''}`.trim()}>
          {busyJobs ? (
            <>
              <Loader2 size={13} className="spin" aria-hidden="true" />
              {busyJobs} in progress
            </>
          ) : (
            <>
              <ShieldCheck size={13} aria-hidden="true" />
              <span>Development preview</span>
            </>
          )}
        </span>}
        <ThemeToggle />
        {!preview && <form method="post" action="/auth/session">
          <input type="hidden" name="intent" value="sign-out" />
          <button type="submit" className="icon-button" aria-label="Sign out" title="Sign out"><LogOut size={16} aria-hidden="true" /></button>
        </form>}
      </div>
    </header>
  );
}

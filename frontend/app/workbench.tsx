'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, json } from './lib/api';
import { parseArtifacts, parseJobs, parseProjects, parseJob } from './lib/decode';
import { deriveWorkflow, navItem, type View } from './lib/pipeline';
import type { Workbench as WorkbenchModel } from './lib/context';
import { kinds, type Artifact, type Job, type Project } from './lib/types';
import { Sidebar, TopBar } from './components/shell';
import { JobActivity } from './components/jobs';
import { Alert } from './components/ui';
import type { ShellFixture } from './lib/shell-fixture';
import { ResearchView } from './views/research';

import { ProjectsView } from './views/projects';
import { AuditView } from './views/audit';
import { SplitView } from './views/split';
import { BenchmarkView } from './views/benchmark';
import { FailureMemoryView } from './views/failure-memory';
import { EvidenceView } from './views/evidence';
import { ProvenanceView } from './views/provenance';
import { ReportView } from './views/report';

const PROJECT_STORAGE_KEY = 'sciml-project';
const POLL_INTERVAL = 2500;

export default function Workbench({ view, fixture, children }: { view: View; fixture?: ShellFixture; children?: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(fixture?.projects ?? []);
  const [projectId, updateProjectId] = useState(fixture?.projects[0]?.id ?? '');
  const [artifacts, setArtifacts] = useState<Artifact[]>(fixture?.artifacts ?? []);
  const [jobs, setJobs] = useState<Job[]>(fixture?.jobs ?? []);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [datasetId, updateDatasetId] = useState('');
  const [splitId, setSplitId] = useState('');
  const [runId, setRunId] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(!fixture);
  const [projectsError, setProjectsError] = useState('');
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [projectLoaded, setProjectLoaded] = useState(Boolean(fixture));
  const [loadAttempt, setLoadAttempt] = useState(0);
  const activeProject = useRef(projectId);
  const requestSequence = useRef(0);
  const actionInFlight = useRef(false);

  const setProjectId = useCallback((id: string) => {
    if (fixture || activeProject.current === id) return;
    activeProject.current = id;
    requestSequence.current += 1;
    setArtifacts([]); setJobs([]); updateDatasetId(''); setSplitId(''); setRunId('');
    setError(''); setNotice(''); setProjectError(''); setProjectLoaded(false);
    setProjectLoading(Boolean(id));
    updateProjectId(id);
    try { localStorage.setItem(PROJECT_STORAGE_KEY, id); } catch { /* storage unavailable */ }
  }, [fixture]);

  const setDatasetId = useCallback((id: string) => {
    updateDatasetId(id); setSplitId(''); setRunId('');
    if (fixture) return;
    try { localStorage.setItem(`sciml-dataset:${activeProject.current}`, id); } catch { /* storage unavailable */ }
  }, [fixture]);

  const refresh = useCallback(async () => {
    if (fixture || !projectId || activeProject.current !== projectId) return;
    const sequence = ++requestSequence.current;
    const current = () => activeProject.current === projectId && requestSequence.current === sequence;
    try {
      const [nextArtifacts, nextJobs] = await Promise.all([
        api(`projects/${projectId}/artifacts`, parseArtifacts),
        api(`projects/${projectId}/jobs`, parseJobs),
      ]);
      if (!current()) return;
      if (nextArtifacts.some(a => a.project_id !== projectId) || nextJobs.some(j => j.project_id !== projectId)) {
        throw new Error('The server returned data for a different project.');
      }
      setArtifacts(nextArtifacts);
      setJobs(nextJobs);
      setProjectLoaded(true);
      setProjectError('');
    } catch (e) {
      if (current()) setProjectError(e instanceof Error ? e.message : 'Could not load this project');
    } finally {
      if (current()) setProjectLoading(false);
    }
  }, [projectId, fixture]);

  useEffect(() => {
    if (fixture) return;
    const controller = new AbortController();
    setProjectsLoading(true); setProjectsError('');
    api('projects', parseProjects, { signal: controller.signal })
      .then(list => {
        if (controller.signal.aborted) return;
        setProjects(list);
        let saved: string | null = null;
        try { saved = localStorage.getItem(PROJECT_STORAGE_KEY); } catch { /* storage unavailable */ }
        setProjectId(list.find(p => p.id === saved)?.id || list[0]?.id || '');
      })
      .catch(e => { if (!controller.signal.aborted) setProjectsError(e instanceof Error ? e.message : 'Could not load projects'); })
      .finally(() => { if (!controller.signal.aborted) setProjectsLoading(false); });
    return () => controller.abort();
  }, [loadAttempt, fixture, setProjectId]);

  useEffect(() => {
    if (fixture || !projectId) return;
    try { updateDatasetId(localStorage.getItem(`sciml-dataset:${projectId}`) || ''); } catch { /* storage unavailable */ }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (!disposed) timer = setTimeout(poll, POLL_INTERVAL);
    };
    void poll();
    return () => { disposed = true; clearTimeout(timer); requestSequence.current += 1; };
  }, [projectId, refresh, fixture]);

  const act = useCallback(async (fn: () => Promise<void>) => {
    if (fixture || actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That operation did not complete');
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }, [refresh, fixture]);

  const submit = useCallback(async (kind: string, payload: object = {}) => {
    if (fixture) return;
    await api(`projects/${projectId}/${kind}`, parseJob, json(payload));
    setNotice('Job queued. Progress appears under job activity below.');
  }, [projectId, fixture]);

  const model: WorkbenchModel = useMemo(() => {
    const datasets = kinds(artifacts, 'dataset');
    const selectedDataset = datasets.find(d => d.id === datasetId) ?? datasets.at(-1);
    const partitions = kinds(artifacts, 'split').filter(s => s.dataset_id === selectedDataset?.id);
    const selectedSplit = partitions.find(s => s.id === splitId) ?? partitions.at(-1);
    const runs = kinds(artifacts, 'benchmark');
    const selectedRun = runs.find(r => r.id === runId) ?? runs.at(-1);

    return {
      projects, setProjects, projectId, setProjectId,
      activeProject: projects.find(p => p.id === projectId),
      artifacts, jobs, busy: busy || Boolean(fixture),
      jobsActive: jobs.some(j => j.state === 'queued' || j.state === 'running'),
      workflow: deriveWorkflow(artifacts, Boolean(projectId)),
      act, submit, setNotice,
      datasets, selectedDataset, setDatasetId,
      audits: kinds(artifacts, 'audit').filter(a => a.dataset_id === selectedDataset?.id),
      partitions, selectedSplit, setSplitId,
      runs, selectedRun, setRunId,
    };
  }, [projects, projectId, artifacts, jobs, busy, datasetId, splitId, runId, act, submit, setProjectId, setDatasetId, fixture]);

  const item = navItem(view);
  const needsProject = view !== 'projects' && view !== 'research' && !projectId;
  const loading = projectsLoading || projectLoading;
  const loadError = projectsError || projectError;
  const showViews = !projectsLoading && !projectsError && (!projectId || projectLoaded);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to main content</a>
      <Sidebar view={view} stages={model.workflow.stages} />

      <div className="main-shell">
        <TopBar
          projects={projects}
          projectId={projectId}
          onProjectChange={setProjectId}
          busyJobs={jobs.filter(j => j.state === 'queued' || j.state === 'running').length}
          datasets={model.datasets}
          datasetId={model.selectedDataset?.id ?? ''}
          onDatasetChange={setDatasetId}
          loading={projectsLoading}
          preview={Boolean(fixture)}
          locked={busy}
        />

        <main className="page" id="main" tabIndex={-1}>
          <div className="page-head">
            <div className="page-head-text">
              <span className="page-eyebrow">Scientific machine learning</span>
              <h1>{item?.title ?? 'Workbench'}</h1>
              <p className="page-lede">{item?.lede}</p>
            </div>
          </div>

          <div className="stack">
            {fixture && <Alert variant="warning" title="Development-only fixture preview">Synthetic sample data. No API requests or mutations run here. Navigation links leave the preview and open the live workspace.</Alert>}
            {loading && <Alert role={notice ? undefined : 'status'}>{projectsLoading ? 'Loading workspace…' : 'Loading project data…'}</Alert>}
            {loadError && <div className="stack stack--tight">
              <Alert variant="error" role="alert" title="Workspace data unavailable">{loadError}{projectLoaded ? ' Previously loaded data remains visible.' : ''}</Alert>
              <div><button className="button button--secondary" disabled={loading} onClick={() => {
                if (projectsError) setLoadAttempt(value => value + 1);
                else { setProjectLoading(true); void refresh(); }
              }}>Retry loading</button></div>
            </div>}
            {error && <Alert variant="error" role="alert" title="Something went wrong">{error}</Alert>}
            {notice && <Alert variant="success" role="status">{notice}</Alert>}

            {showViews && needsProject && (
              <div className="alert alert--info">
                <div className="alert-body">
                  <strong>No project selected</strong>
                  <p>
                    Everything on this page belongs to a project.{' '}
                    <Link className="text-link" href="/projects">Create or choose one first</Link>.
                  </p>
                </div>
              </div>
            )}

            {showViews && <>
              {view === 'research' && <ResearchView wb={model} />}
              {view === 'projects' && <ProjectsView wb={model} />}
              {view === 'dataset-audit' && <AuditView key={projectId} wb={model} />}
              {view === 'split-designer' && <SplitView wb={model} />}
              {view === 'benchmark' && <BenchmarkView wb={model} />}
              {view === 'failure-memory' && <FailureMemoryView wb={model} />}
              {view === 'evidence' && <EvidenceView wb={model} />}
              {view === 'provenance' && <ProvenanceView wb={model} />}
              {view === 'report' && <ReportView wb={model} />}

              <JobActivity jobs={jobs} />
              {children}
            </>}
          </div>

          <footer className="page-foot">
            <span className="page-foot-brand">SciML Workbench</span>
            <span>Evidence → data → evaluation → learning</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

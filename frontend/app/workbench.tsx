'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './lib/api';
import { parseArtifactPreviews, parseProjects } from './lib/decode';
import { ARTIFACT_REFRESH, isActive, jobFingerprint, loadJobs, pollDelay } from './lib/jobs';
import { submitOperation, type OperationKind } from './lib/submissions';
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
const READ_TIMEOUT = 30_000;

export default function Workbench({ view, fixture, children, requestedProjectId, requestedAuditId, requestedSplitId, requestedBenchmarkId, requestedEvidenceId, requestedClaimSetId, requestedFailureId, requestedArtifactId, requestedReportId }: { view: View; fixture?: ShellFixture; children?: ReactNode; requestedProjectId?: string; requestedAuditId?: string; requestedSplitId?: string; requestedBenchmarkId?: string; requestedEvidenceId?: string; requestedClaimSetId?: string; requestedFailureId?: string; requestedArtifactId?: string; requestedReportId?: string }) {
  const [projects, setProjects] = useState<Project[]>(fixture?.projects ?? []);
  const [projectId, updateProjectId] = useState(fixture?.projects[0]?.id ?? '');
  const [artifacts, setArtifacts] = useState<Artifact[]>(fixture?.artifacts ?? []);
  const [jobs, setJobs] = useState<Job[]>(fixture?.jobs ?? []);
  const [jobsTruncated, setJobsTruncated] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [nextRetryAt, setNextRetryAt] = useState<number | null>(null);
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
  const auditLinkApplied = useRef(false);
  const splitLinkApplied = useRef(false);
  const benchmarkLinkApplied = useRef(false);
  const jobPrint = useRef('');
  const artifactsReadAt = useRef(0);
  const jobsRunning = useRef(false);
  const pollNow = useRef<(() => void) | null>(null);

  const setProjectId = useCallback((id: string) => {
    if (fixture || activeProject.current === id) return;
    activeProject.current = id;
    requestSequence.current += 1;
    setArtifacts([]); setJobs([]); setJobsTruncated(false); setLastUpdated(''); setNextRetryAt(null);
    jobPrint.current = ''; artifactsReadAt.current = 0; jobsRunning.current = false;
    updateDatasetId(''); setSplitId(''); setRunId('');
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

  const applyLinks = useCallback((nextArtifacts: Artifact[]) => {
    if (requestedSplitId && projectId === requestedProjectId && !splitLinkApplied.current) {
      const split = kinds(nextArtifacts, 'split').find(value => value.id === requestedSplitId);
      if (split) {
        setDatasetId(split.dataset_id); setSplitId(split.id);
        splitLinkApplied.current = true;
      }
    }
    if (requestedBenchmarkId && projectId === requestedProjectId && !benchmarkLinkApplied.current) {
      const run = kinds(nextArtifacts, 'benchmark_preview').find(value => value.id === requestedBenchmarkId);
      if (run) {
        setDatasetId(run.dataset_id); setSplitId(run.split_id); setRunId(run.id);
        benchmarkLinkApplied.current = true;
      }
    }
    if (requestedAuditId && projectId === requestedProjectId && !auditLinkApplied.current) {
      const audit = kinds(nextArtifacts, 'audit').find(value => value.id === requestedAuditId);
      if (audit) {
        setDatasetId(audit.dataset_id);
        auditLinkApplied.current = true;
      }
    }
  }, [projectId, requestedAuditId, requestedSplitId, requestedBenchmarkId, requestedProjectId, setDatasetId]);

  /** Reads jobs every time; artifacts only when a job changed (including reaching a terminal
   *  state), when forced, or after ARTIFACT_REFRESH for work created outside jobs.
   *  Returns false only when a current read failed; earlier data stays visible. */
  const refresh = useCallback(async (forceArtifacts = false): Promise<boolean> => {
    if (fixture || !projectId || activeProject.current !== projectId) return true;
    const sequence = ++requestSequence.current;
    const current = () => activeProject.current === projectId && requestSequence.current === sequence;
    try {
      const listing = await loadJobs(projectId);
      if (!current()) return true;
      const print = jobFingerprint(listing.jobs);
      const nextArtifacts = forceArtifacts || print !== jobPrint.current || Date.now() - artifactsReadAt.current >= ARTIFACT_REFRESH
        ? await api(`projects/${projectId}/artifact-previews`, parseArtifactPreviews, undefined, READ_TIMEOUT) : null;
      if (!current()) return true;
      if (nextArtifacts?.some(a => a.project_id !== projectId)) {
        throw new Error('The server returned data for a different project.');
      }
      setJobs(listing.jobs);
      setJobsTruncated(listing.truncated);
      jobsRunning.current = listing.jobs.some(isActive);
      if (nextArtifacts) {
        // Advance the job snapshot only with its artifacts, so a failed artifact read is retried.
        setArtifacts(nextArtifacts);
        jobPrint.current = print;
        artifactsReadAt.current = Date.now();
        applyLinks(nextArtifacts);
      }
      setLastUpdated(new Date().toISOString());
      setProjectLoaded(true);
      setProjectError('');
      return true;
    } catch (e) {
      if (!current()) return true;
      setProjectError(e instanceof Error ? e.message : 'Could not load this project');
      return false;
    } finally {
      if (current()) setProjectLoading(false);
    }
  }, [projectId, fixture, applyLinks]);

  useEffect(() => {
    if (fixture) return;
    const controller = new AbortController();
    setProjectsLoading(true); setProjectsError('');
    api('projects', parseProjects, { signal: controller.signal })
      .then(list => {
        if (controller.signal.aborted) return;
        setProjects(list);
        if (requestedProjectId) {
          if (!list.some(project => project.id === requestedProjectId)) throw new Error('Requested project unavailable. No other project was selected for this result link.');
          setProjectId(requestedProjectId);
          return;
        }
        let saved: string | null = null;
        try { saved = localStorage.getItem(PROJECT_STORAGE_KEY); } catch { /* storage unavailable */ }
        setProjectId(list.find(p => p.id === saved)?.id || list[0]?.id || '');
      })
      .catch(e => { if (!controller.signal.aborted) setProjectsError(e instanceof Error ? e.message : 'Could not load projects'); })
      .finally(() => { if (!controller.signal.aborted) setProjectsLoading(false); });
    return () => controller.abort();
  }, [loadAttempt, fixture, setProjectId, requestedProjectId]);

  useEffect(() => {
    if (fixture || !projectId) return;
    try { updateDatasetId(localStorage.getItem(`sciml-dataset:${projectId}`) || ''); } catch { /* storage unavailable */ }
    let disposed = false;
    let polling = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // One loop per project. Failures back off exponentially; success returns to the
    // normal cadence, which is slower while nothing runs or the tab is hidden.
    const poll = async (force = false) => {
      if (disposed || polling) return;
      polling = true;
      clearTimeout(timer);
      try {
        failures = await refresh(force) ? 0 : failures + 1;
      } finally {
        polling = false;
      }
      if (disposed) return;
      const delay = pollDelay({ failures, active: jobsRunning.current, hidden: document.visibilityState === 'hidden' });
      setNextRetryAt(failures ? Date.now() + delay : null);
      timer = setTimeout(() => void poll(), delay);
    };
    const visible = () => { if (document.visibilityState === 'visible') void poll(); };
    pollNow.current = () => void poll(true);
    document.addEventListener('visibilitychange', visible);
    void poll(true);
    return () => {
      disposed = true; clearTimeout(timer); requestSequence.current += 1; pollNow.current = null;
      document.removeEventListener('visibilitychange', visible);
    };
  }, [projectId, refresh, fixture]);

  const act = useCallback(async (fn: () => Promise<void>) => {
    if (fixture || actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true); setError(''); setNotice('');
    try {
      await fn();
      await refresh(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That operation did not complete');
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }, [refresh, fixture]);

  const submit = useCallback(async (kind: OperationKind, payload: object = {}) => {
    if (fixture) return;
    await submitOperation(projectId, kind, payload);
    setNotice('Job queued. Progress appears under job activity below.');
  }, [projectId, fixture]);

  const refreshJobs = useCallback(() => pollNow.current?.(), []);

  const model: WorkbenchModel = useMemo(() => {
    const datasets = kinds(artifacts, 'dataset');
    const selectedDataset = datasets.find(d => d.id === datasetId) ?? datasets.at(-1);
    const partitions = kinds(artifacts, 'split').filter(s => s.dataset_id === selectedDataset?.id);
    const selectedSplit = partitions.find(s => s.id === splitId) ?? partitions.at(-1);
    const runs = kinds(artifacts, 'benchmark_preview');
    const selectedRun = runs.find(r => r.id === runId) ?? runs.at(-1);

    return {
      projects, setProjects, projectId, setProjectId,
      activeProject: projects.find(p => p.id === projectId),
      artifacts, jobs, jobsTruncated, lastUpdated, busy: busy || Boolean(fixture), preview: Boolean(fixture),
      jobsActive: jobs.some(isActive),
      workflow: deriveWorkflow(artifacts, Boolean(projectId)),
      act, submit, setNotice, refreshJobs,
      datasets, selectedDataset, setDatasetId,
      audits: kinds(artifacts, 'audit').filter(a => a.dataset_id === selectedDataset?.id),
      partitions, selectedSplit, setSplitId,
      runs, selectedRun, setRunId,
    };
  }, [projects, projectId, artifacts, jobs, jobsTruncated, lastUpdated, busy, datasetId, splitId, runId, act, submit, refreshJobs, setProjectId, setDatasetId, fixture]);

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
          busyJobs={jobs.filter(isActive).length}
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
              <Alert variant="error" role="alert" title="Workspace data unavailable">
                {loadError}
                {projectLoaded ? ` Previously loaded data remains visible${lastUpdated ? ` (last read at ${new Date(lastUpdated).toLocaleTimeString()})` : ''} and may be out of date.` : ''}
                {!projectsError && nextRetryAt ? ` Retrying automatically; next attempt at ${new Date(nextRetryAt).toLocaleTimeString()}.` : ''}
              </Alert>
              <div><button className="button button--secondary" disabled={loading} onClick={() => {
                if (projectsError) setLoadAttempt(value => value + 1);
                else { setProjectLoading(true); pollNow.current?.(); }
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
              {view === 'dataset-audit' && <AuditView key={projectId} wb={model} requestedAuditId={projectId === requestedProjectId ? requestedAuditId : undefined} />}
              {view === 'split-designer' && <SplitView wb={model} requestedSplitId={projectId === requestedProjectId ? requestedSplitId : undefined} />}
              {view === 'benchmark' && <BenchmarkView key={projectId} wb={model} requestedBenchmarkId={projectId === requestedProjectId ? requestedBenchmarkId : undefined} />}
              {view === 'failure-memory' && <FailureMemoryView key={projectId} wb={model} requestedFailureId={projectId === requestedProjectId ? requestedFailureId : undefined} requestedBenchmarkId={projectId === requestedProjectId ? requestedBenchmarkId : undefined} />}
              {view === 'evidence' && <EvidenceView key={projectId} wb={model} requestedEvidenceId={projectId === requestedProjectId ? requestedEvidenceId : undefined} requestedClaimSetId={projectId === requestedProjectId ? requestedClaimSetId : undefined} />}
              {view === 'provenance' && <ProvenanceView key={projectId} wb={model} requestedArtifactId={projectId === requestedProjectId ? requestedArtifactId : undefined} />}
              {view === 'report' && <ReportView key={projectId} wb={model} requestedReportId={projectId === requestedProjectId ? requestedReportId : undefined} />}

              <JobActivity wb={model} />
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

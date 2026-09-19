'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, json } from './lib/api';
import { parseArtifacts, parseJobs, parseProjects, parseJob } from './lib/decode';
import { deriveWorkflow, navItem, type View } from './lib/pipeline';
import type { Workbench as WorkbenchModel } from './lib/context';
import { kinds, type Artifact, type Job, type Project } from './lib/types';
import { Sidebar, TopBar } from './components/shell';
import { JobActivity } from './components/jobs';
import { Alert } from './components/ui';

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

export default function Workbench({ view }: { view: View }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [datasetId, setDatasetId] = useState('');
  const [splitId, setSplitId] = useState('');
  const [runId, setRunId] = useState('');

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const [nextArtifacts, nextJobs] = await Promise.all([
      api(`projects/${projectId}/artifacts`, parseArtifacts),
      api(`projects/${projectId}/jobs`, parseJobs),
    ]);
    setArtifacts(nextArtifacts);
    setJobs(nextJobs);
  }, [projectId]);

  useEffect(() => {
    api('projects', parseProjects)
      .then(list => {
        setProjects(list);
        let saved: string | null = null;
        try { saved = localStorage.getItem(PROJECT_STORAGE_KEY); } catch { /* storage unavailable */ }
        setProjectId(list.find(p => p.id === saved)?.id || list[0]?.id || '');
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load projects'));
  }, []);

  useEffect(() => {
    setArtifacts([]); setJobs([]); setDatasetId(''); setSplitId(''); setRunId('');
    if (!projectId) return;
    try { localStorage.setItem(PROJECT_STORAGE_KEY, projectId); } catch { /* storage unavailable */ }
    refresh().catch(e => setError(e instanceof Error ? e.message : 'Could not load this project'));
  }, [projectId, refresh]);

  useEffect(() => {
    if (!projectId) return;
    const timer = setInterval(
      () => refresh().catch(e => setError(e instanceof Error ? e.message : 'Lost contact with the backend')),
      POLL_INTERVAL
    );
    return () => clearInterval(timer);
  }, [projectId, refresh]);

  const act = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That operation did not complete');
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const submit = useCallback(async (kind: string, payload: object = {}) => {
    await api(`projects/${projectId}/${kind}`, parseJob, json(payload));
    setNotice('Job queued. Progress appears under job activity below.');
  }, [projectId]);

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
      artifacts, jobs, busy,
      jobsActive: jobs.some(j => j.state === 'queued' || j.state === 'running'),
      workflow: deriveWorkflow(artifacts, Boolean(projectId)),
      act, submit, setNotice,
      datasets, selectedDataset, setDatasetId,
      audits: kinds(artifacts, 'audit').filter(a => a.dataset_id === selectedDataset?.id),
      partitions, selectedSplit, setSplitId,
      runs, selectedRun, setRunId,
    };
  }, [projects, projectId, artifacts, jobs, busy, datasetId, splitId, runId, act, submit]);

  const item = navItem(view);
  const needsProject = view !== 'projects' && !projectId;

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
        />

        <main className="page" id="main">
          <div className="page-head">
            <div className="page-head-text">
              <span className="page-eyebrow">Scientific machine learning</span>
              <h1>{item?.title ?? 'Workbench'}</h1>
              <p className="page-lede">{item?.lede}</p>
            </div>
          </div>

          <div className="stack">
            {error && <Alert variant="error" role="alert" title="Something went wrong">{error}</Alert>}
            {notice && <Alert variant="success" role="status">{notice}</Alert>}

            {needsProject && (
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

            {view === 'projects' && <ProjectsView wb={model} />}
            {view === 'dataset-audit' && <AuditView wb={model} />}
            {view === 'split-designer' && <SplitView wb={model} />}
            {view === 'benchmark' && <BenchmarkView wb={model} />}
            {view === 'failure-memory' && <FailureMemoryView wb={model} />}
            {view === 'evidence' && <EvidenceView wb={model} />}
            {view === 'provenance' && <ProvenanceView wb={model} />}
            {view === 'report' && <ReportView wb={model} />}

            <JobActivity jobs={jobs} />
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

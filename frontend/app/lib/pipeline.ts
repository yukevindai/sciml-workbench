import {
  Activity, BookOpen, FileCheck, FlaskConical, GitBranch, Layers, ShieldCheck, Boxes,
  type LucideIcon,
} from 'lucide-react';
import { kinds, type Artifact } from './types';

export type View =
  | 'research' | 'projects' | 'evidence' | 'dataset-audit' | 'split-designer'
  | 'benchmark' | 'failure-memory' | 'provenance' | 'report';

export const VIEWS: View[] = [
  'research', 'projects', 'evidence', 'dataset-audit', 'split-designer',
  'benchmark', 'failure-memory', 'provenance', 'report',
];

export function isView(value: string): value is View {
  return (VIEWS as string[]).includes(value);
}

export type NavItem = {
  view: View;
  /** Rendered as the link's entire accessible name. Nothing else in the link
   *  may contribute text, or navigation by name breaks. */
  label: string;
  icon: LucideIcon;
  title: string;
  lede: string;
};

export const NAV: NavItem[] = [
  {
    view: 'research', label: 'Research', icon: FlaskConical,
    title: 'Research',
    lede: 'Choose a project, inspect its data, and continue your research with traceable results.',
  },
  {
    view: 'projects', label: 'Projects', icon: Boxes,
    title: 'Projects',
    lede: 'A project holds one dataset, its sources, and every run you make from it.',
  },
  {
    view: 'dataset-audit', label: 'Dataset audit', icon: ShieldCheck,
    title: 'Dataset audit',
    lede: 'Upload your data and check it for quality, provenance and leakage problems before you model it.',
  },
  {
    view: 'split-designer', label: 'Split designer', icon: GitBranch,
    title: 'Split designer',
    lede: 'Decide what your model has to generalise to, and hold those groups out completely.',
  },
  {
    view: 'benchmark', label: 'Benchmarks', icon: Activity,
    title: 'Benchmarks',
    lede: 'Fit a baseline against your frozen partition and read the held-out scores.',
  },
  {
    view: 'failure-memory', label: 'Failure memory', icon: FlaskConical,
    title: 'Failure memory',
    lede: 'Write down what a run did not achieve, while you still remember why.',
  },
  {
    view: 'evidence', label: 'Evidence', icon: BookOpen,
    title: 'Evidence',
    lede: 'Keep the papers and notes behind your data alongside the data itself.',
  },
  {
    view: 'provenance', label: 'Provenance', icon: Layers,
    title: 'Provenance',
    lede: 'Trace any result back through every input it was computed from.',
  },
  {
    view: 'report', label: 'Reports', icon: FileCheck,
    title: 'Reports',
    lede: 'Export one archive containing everything needed to reproduce this project.',
  },
];

export const NAV_GROUPS: { label: string; views: View[] }[] = [
  { label: 'Workspace', views: ['research', 'projects'] },
  { label: 'Workflow', views: ['dataset-audit', 'split-designer', 'benchmark', 'failure-memory'] },
  { label: 'Sources & records', views: ['evidence', 'provenance', 'report'] },
];

export function navItem(view: string): NavItem | undefined {
  return NAV.find(item => item.view === view);
}

/* ------------------------------ workflow state ---------------------------- */

export type StageState = 'locked' | 'ready' | 'done';

export type Stage = {
  view: View;
  index: number;
  label: string;
  state: StageState;
  /** A plain sentence, so the stage's state never depends on colour alone. */
  status: string;
  /** Shown when the stage cannot be started yet. */
  blockedBy?: string;
  action: string;
};

export type Workflow = {
  stages: Stage[];
  next: Stage | undefined;
  counts: Record<string, number>;
};

export function deriveWorkflow(artifacts: Artifact[], hasProject: boolean): Workflow {
  const datasets = kinds(artifacts, 'dataset');
  const audits = kinds(artifacts, 'audit');
  const splits = kinds(artifacts, 'split');
  const runs = kinds(artifacts, 'benchmark');
  const failures = kinds(artifacts, 'failure');
  const reports = kinds(artifacts, 'report');
  const evidence = kinds(artifacts, 'evidence');

  const state = (done: boolean, unlocked: boolean): StageState =>
    done ? 'done' : unlocked ? 'ready' : 'locked';

  const stages: Stage[] = [
    {
      view: 'dataset-audit', index: 1, label: 'Dataset audit',
      state: state(audits.length > 0, hasProject),
      status: !hasProject
        ? 'Select a project first'
        : audits.length
          ? `${audits.length} audit${audits.length === 1 ? '' : 's'} on ${datasets.length} dataset${datasets.length === 1 ? '' : 's'}`
          : datasets.length
            ? 'Dataset uploaded, not yet audited'
            : 'No dataset uploaded yet',
      blockedBy: hasProject ? undefined : 'Create or select a project',
      action: datasets.length ? 'Run an audit' : 'Upload a CSV',
    },
    {
      view: 'split-designer', index: 2, label: 'Split designer',
      state: state(splits.length > 0, audits.length > 0),
      status: splits.length
        ? `${splits.length} partition${splits.length === 1 ? '' : 's'} generated`
        : audits.length ? 'Ready to partition' : 'Waiting on an audit',
      blockedBy: audits.length ? undefined : 'Audit a dataset first',
      action: 'Generate a partition',
    },
    {
      view: 'benchmark', index: 3, label: 'Benchmarks',
      state: state(runs.length > 0, splits.length > 0),
      status: runs.length
        ? `${runs.filter(r => r.status === 'succeeded').length} of ${runs.length} run${runs.length === 1 ? '' : 's'} succeeded`
        : splits.length ? 'Ready to run a baseline' : 'Waiting on a partition',
      blockedBy: splits.length ? undefined : 'Generate a partition first',
      action: 'Run a baseline',
    },
    {
      view: 'failure-memory', index: 4, label: 'Failure memory',
      state: state(failures.length > 0, runs.length > 0),
      status: failures.length
        ? `${failures.length} lesson${failures.length === 1 ? '' : 's'} saved`
        : runs.length ? 'Ready to record what a run missed' : 'Waiting on a benchmark run',
      blockedBy: runs.length ? undefined : 'Run a benchmark first',
      action: 'Record a lesson',
    },
  ];

  return {
    stages,
    next: stages.find(s => s.state === 'ready') ?? stages.find(s => s.state === 'locked'),
    counts: {
      dataset: datasets.length, audit: audits.length, split: splits.length,
      benchmark: runs.length, failure: failures.length, report: reports.length,
      evidence: evidence.length,
    },
  };
}

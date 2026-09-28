import {
  Activity, BookOpen, FileCheck, GitBranch, Layers, Lightbulb, MessageSquareText, ShieldCheck, Boxes, SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { kinds, type Artifact } from './types';

export type View =
  | 'ask' | 'research' | 'projects' | 'evidence' | 'dataset-audit' | 'split-designer'
  | 'benchmark' | 'failure-memory' | 'provenance' | 'report';

export const VIEWS: View[] = [
  'ask', 'research', 'projects', 'evidence', 'dataset-audit', 'split-designer',
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
    view: 'ask', label: 'Ask', icon: MessageSquareText,
    title: 'Ask',
    lede: 'Ask a question about your data in plain words and let the assistant do the work.',
  },
  {
    view: 'research', label: 'Detailed request', icon: SlidersHorizontal,
    title: 'Detailed request',
    lede: 'Write a request with full control over which files the assistant may use, its permissions and its limits.',
  },
  {
    view: 'projects', label: 'Projects', icon: Boxes,
    title: 'Projects',
    lede: 'A project keeps your files, questions and results together.',
  },
  {
    view: 'dataset-audit', label: 'Check data', icon: ShieldCheck,
    title: 'Check data',
    lede: 'Upload a spreadsheet and check it for missing values, duplicates and other problems before you use it.',
  },
  {
    view: 'split-designer', label: 'Split data', icon: GitBranch,
    title: 'Split data',
    lede: 'Choose which rows train a model and which are kept aside to test it fairly.',
  },
  {
    view: 'benchmark', label: 'Test models', icon: Activity,
    title: 'Test models',
    lede: 'Build a simple prediction model on your split data and see how well it does on data it has not seen.',
  },
  {
    view: 'failure-memory', label: 'Lessons learned', icon: Lightbulb,
    title: 'Lessons learned',
    lede: 'Write down what did not work and why, so the next attempt goes better.',
  },
  {
    view: 'evidence', label: 'Papers & sources', icon: BookOpen,
    title: 'Papers & sources',
    lede: 'Keep the papers behind your data next to the data itself, and quote exact passages.',
  },
  {
    view: 'provenance', label: 'History', icon: Layers,
    title: 'History',
    lede: 'See where any result came from, step by step.',
  },
  {
    view: 'report', label: 'Export', icon: FileCheck,
    title: 'Export',
    lede: 'Download one file with everything needed to check or repeat this project.',
  },
];

export const NAV_GROUPS: { label: string; views: View[]; advanced?: boolean }[] = [
  { label: 'Workspace', views: ['ask', 'projects'] },
  { label: 'Advanced tools', views: ['research', 'dataset-audit', 'split-designer', 'benchmark', 'failure-memory', 'evidence', 'provenance', 'report'], advanced: true },
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
  const runs = kinds(artifacts, 'benchmark_preview');
  const failures = kinds(artifacts, 'failure');
  const reports = kinds(artifacts, 'report');
  const evidence = kinds(artifacts, 'evidence');

  const state = (done: boolean, unlocked: boolean): StageState =>
    done ? 'done' : unlocked ? 'ready' : 'locked';

  const stages: Stage[] = [
    {
      view: 'dataset-audit', index: 1, label: 'Check data',
      state: state(audits.length > 0, hasProject),
      status: !hasProject
        ? 'Select a project first'
        : audits.length
          ? `${audits.length} check${audits.length === 1 ? '' : 's'} on ${datasets.length} dataset${datasets.length === 1 ? '' : 's'}`
          : datasets.length
            ? 'Data uploaded, not checked yet'
            : 'No dataset uploaded yet',
      blockedBy: hasProject ? undefined : 'Create or select a project',
      action: datasets.length ? 'Check the data' : 'Upload a spreadsheet',
    },
    {
      view: 'split-designer', index: 2, label: 'Split data',
      state: state(splits.length > 0, audits.length > 0),
      status: splits.length
        ? `${splits.length} split${splits.length === 1 ? '' : 's'} made`
        : audits.length ? 'Ready to split' : 'Check the data first',
      blockedBy: audits.length ? undefined : 'Check a dataset first',
      action: 'Split the data',
    },
    {
      view: 'benchmark', index: 3, label: 'Test models',
      state: state(runs.length > 0, splits.length > 0),
      status: runs.length
        ? `${runs.filter(r => r.status === 'succeeded').length} of ${runs.length} test${runs.length === 1 ? '' : 's'} finished`
        : splits.length ? 'Ready to test a model' : 'Split the data first',
      blockedBy: splits.length ? undefined : 'Split the data first',
      action: 'Test a model',
    },
    {
      view: 'failure-memory', index: 4, label: 'Lessons learned',
      state: state(failures.length > 0, runs.length > 0),
      status: failures.length
        ? `${failures.length} lesson${failures.length === 1 ? '' : 's'} saved`
        : runs.length ? 'Ready to note what didn’t work' : 'Test a model first',
      blockedBy: runs.length ? undefined : 'Test a model first',
      action: 'Write down a lesson',
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

import type { Dispatch, SetStateAction } from 'react';
import type { Workflow } from './pipeline';
import type { OperationKind } from './submissions';
import type {
  Artifact, AuditArtifact, BenchmarkPreview, DatasetArtifact, Job, Project, SplitArtifact,
} from './types';

/** Everything a view needs. Assembled once in the Workbench shell so each view
 *  stays a presentation concern and the selection rules live in one place. */
export type Workbench = {
  projects: Project[];
  setProjects: Dispatch<SetStateAction<Project[]>>;
  projectId: string;
  setProjectId: (id: string) => void;
  activeProject: Project | undefined;

  artifacts: Artifact[];
  /** Newest first. */
  jobs: Job[];
  /** True when older jobs exist beyond the loaded pages. */
  jobsTruncated: boolean;
  /** When project data was last read successfully (ISO time), or '' before the first read. */
  lastUpdated: string;
  busy: boolean;
  /** Development fixture preview: views must not call the API. */
  preview: boolean;
  /** True while any job is queued or running. */
  jobsActive: boolean;
  workflow: Workflow;

  /** Runs an action with busy/error/notice handling, then refreshes. */
  act: (fn: () => Promise<void>) => Promise<void>;
  /** Queues a backend job for the active project, retaining its request key until the outcome is known. */
  submit: (kind: OperationKind, payload?: object) => Promise<void>;
  setNotice: (message: string) => void;
  /** Polls jobs and artifacts now, outside the normal cadence. */
  refreshJobs: () => void;

  datasets: DatasetArtifact[];
  selectedDataset: DatasetArtifact | undefined;
  setDatasetId: (id: string) => void;
  /** Audits of the selected dataset, oldest first. */
  audits: AuditArtifact[];

  partitions: SplitArtifact[];
  selectedSplit: SplitArtifact | undefined;
  setSplitId: (id: string) => void;

  /** Project-wide benchmark previews; test output is never part of a preview. */
  runs: BenchmarkPreview[];
  selectedRun: BenchmarkPreview | undefined;
  setRunId: (id: string) => void;
};

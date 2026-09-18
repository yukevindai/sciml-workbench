import type { Dispatch, SetStateAction } from 'react';
import type { Workflow } from './pipeline';
import type {
  Artifact, AuditArtifact, BenchmarkArtifact, DatasetArtifact, Job, Project, SplitArtifact,
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
  jobs: Job[];
  busy: boolean;
  /** True while any job is queued or running. */
  jobsActive: boolean;
  workflow: Workflow;

  /** Runs an action with busy/error/notice handling, then refreshes. */
  act: (fn: () => Promise<void>) => Promise<void>;
  /** Queues a backend job for the active project. */
  submit: (kind: string, payload?: object) => Promise<void>;
  setNotice: (message: string) => void;

  datasets: DatasetArtifact[];
  selectedDataset: DatasetArtifact | undefined;
  setDatasetId: (id: string) => void;
  /** Audits of the selected dataset, oldest first. */
  audits: AuditArtifact[];

  partitions: SplitArtifact[];
  selectedSplit: SplitArtifact | undefined;
  setSplitId: (id: string) => void;

  runs: BenchmarkArtifact[];
  selectedRun: BenchmarkArtifact | undefined;
  setRunId: (id: string) => void;
};

import type { Artifact, Job, Project } from './types';

/** Passed only by the server's development preview route. Never a live API fallback. */
export type ShellFixture = { projects: Project[]; artifacts: Artifact[]; jobs: Job[] };

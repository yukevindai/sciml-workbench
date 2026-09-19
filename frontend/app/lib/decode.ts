import {
  validateArtifactsResponse, validateLegacyArtifact, validateLegacyJobResponse,
  validateJobsResponse, validateProjectResponse, validateProjectsResponse,
} from './generated/validators.cjs';

function finite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finite);
  if (value !== null && typeof value === 'object') return Object.values(value).every(finite);
  return true;
}

function decoder<T>(validate: (value: unknown) => value is T): (value: unknown) => T {
  return value => {
    if (!finite(value) || !validate(value)) throw new Error('The server returned an invalid or unsupported response.');
    return value;
  };
}

export const parseProjects = decoder(validateProjectsResponse);
export const parseProject = decoder(validateProjectResponse);
export const parseArtifacts = decoder(validateArtifactsResponse);
export const parseArtifact = decoder(validateLegacyArtifact);
export const parseJobs = decoder(validateJobsResponse);
export const parseJob = decoder(validateLegacyJobResponse);

import {
  validateArtifactPreviews, validateArtifactsResponse, validateEvaluationStatusView, validateEvidenceAnchors, validateEvidencePageText, validateEvidenceSpanView, validateIntakeArtifact, validateMaterialResponse, validateLegacyJobResponse,
  validateJobsResponse, validateProjectResponse, validateProjectsResponse, validateResearchRuns,
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
export const parseArtifact = decoder(validateIntakeArtifact);
export const parseArtifactPreviews = decoder(validateArtifactPreviews);
export const parseEvaluationStatus = decoder(validateEvaluationStatusView);
export const parseEvidencePage = decoder(validateEvidencePageText);
export const parseEvidenceSpan = decoder(validateEvidenceSpanView);
export const parseEvidenceAnchors = decoder(validateEvidenceAnchors);
export const parseJobs = decoder(validateJobsResponse);
export const parseJob = decoder(validateLegacyJobResponse);
export const parseResearchRuns = decoder(validateResearchRuns);

export const parseMaterial = decoder(validateMaterialResponse);
export const parseMaterials = (value: unknown) => {
  if (!Array.isArray(value)) throw new Error('The server returned an invalid attachment list.');
  return value.map(parseMaterial);
};

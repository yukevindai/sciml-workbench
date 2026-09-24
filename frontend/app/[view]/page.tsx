import { notFound } from 'next/navigation';
import Workbench from '../workbench';
import { isView } from '../lib/pipeline';

export default async function Page({ params, searchParams }: { params: Promise<{ view: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { view } = await params;
  if (!isView(view)) notFound();
  const query = await searchParams;
  const project = typeof query.project === 'string' ? query.project : undefined;
  const audit = typeof query.audit === 'string' ? query.audit : undefined;
  const split = typeof query.split === 'string' ? query.split : undefined;
  const benchmark = typeof query.benchmark === 'string' ? query.benchmark : undefined;
  const evidence = typeof query.evidence === 'string' ? query.evidence : undefined;
  const claimSet = typeof query.claim_set === 'string' ? query.claim_set : undefined;
  const valid = (value: unknown, parsed: string | undefined) => value === undefined || (parsed !== undefined && /^[a-zA-Z0-9_-]+$/.test(parsed));
  if (view === 'evidence' && (query.evidence !== undefined || query.claim_set !== undefined || query.project !== undefined)) {
    if (!project || !/^[a-zA-Z0-9_-]+$/.test(project) || !valid(query.evidence, evidence) || !valid(query.claim_set, claimSet)) notFound();
    return <Workbench key={`${project}:${evidence ?? ''}:${claimSet ?? ''}`} view={view} requestedProjectId={project} requestedEvidenceId={evidence} requestedClaimSetId={claimSet} />;
  }
  if (view === 'benchmark' && (query.benchmark !== undefined || query.project !== undefined)) {
    if (!project || !/^[a-zA-Z0-9_-]+$/.test(project) || (query.benchmark !== undefined && (!benchmark || !/^[a-zA-Z0-9_-]+$/.test(benchmark)))) notFound();
    return <Workbench key={`${project}:${benchmark ?? ''}`} view={view} requestedProjectId={project} requestedBenchmarkId={benchmark} />;
  }
  const failure = typeof query.failure === 'string' ? query.failure : undefined;
  if (view === 'failure-memory' && (query.failure !== undefined || query.benchmark !== undefined || query.project !== undefined)) {
    if (!project || !/^[a-zA-Z0-9_-]+$/.test(project) || !valid(query.failure, failure) || !valid(query.benchmark, benchmark)) notFound();
    return <Workbench key={`${project}:${failure ?? ''}:${benchmark ?? ''}`} view={view} requestedProjectId={project} requestedFailureId={failure} requestedBenchmarkId={benchmark} />;
  }
  const artifact = typeof query.artifact === 'string' ? query.artifact : undefined;
  const report = typeof query.report === 'string' ? query.report : undefined;
  if (view === 'provenance' && (query.artifact !== undefined || query.project !== undefined)) {
    if (!project || !/^[a-zA-Z0-9_-]+$/.test(project) || !valid(query.artifact, artifact)) notFound();
    return <Workbench key={`${project}:${artifact ?? ''}`} view={view} requestedProjectId={project} requestedArtifactId={artifact} />;
  }
  if (view === 'report' && (query.report !== undefined || query.project !== undefined)) {
    if (!project || !/^[a-zA-Z0-9_-]+$/.test(project) || !valid(query.report, report)) notFound();
    return <Workbench key={`${project}:${report ?? ''}`} view={view} requestedProjectId={project} requestedReportId={report} />;
  }
  if (view === 'split-designer' && (query.split !== undefined || query.project !== undefined)) {
    if (!project || !/^[a-zA-Z0-9_-]+$/.test(project) || (query.split !== undefined && (!split || !/^[a-zA-Z0-9_-]+$/.test(split)))) notFound();
    return <Workbench key={`${project}:${split ?? ''}`} view={view} requestedProjectId={project} requestedSplitId={split} />;
  }
  if (view === 'dataset-audit' && (query.audit !== undefined || query.project !== undefined)) {
    if (!project || !/^[a-zA-Z0-9_-]+$/.test(project) || (query.audit !== undefined && (!audit || !/^[a-zA-Z0-9_-]+$/.test(audit)))) notFound();
    return <Workbench key={`${project}:${audit ?? ''}`} view={view} requestedProjectId={project} requestedAuditId={audit} />;
  }
  return <Workbench view={view} />;
}

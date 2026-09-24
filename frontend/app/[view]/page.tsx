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

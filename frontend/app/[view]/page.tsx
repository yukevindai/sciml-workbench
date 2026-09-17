import { notFound } from 'next/navigation';
import Workbench from '../workbench';
export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!['projects','evidence','dataset-audit','split-designer','benchmark','failure-memory','provenance','report'].includes(view)) notFound();
  return <Workbench view={view} />;
}

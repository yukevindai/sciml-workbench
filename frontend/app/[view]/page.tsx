import { notFound } from 'next/navigation';
import Workbench from '../workbench';
import { isView } from '../lib/pipeline';

export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!isView(view)) notFound();
  return <Workbench view={view} />;
}

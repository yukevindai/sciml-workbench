import { notFound } from 'next/navigation';
import Workbench from '../../workbench';
import { isView } from '../../lib/pipeline';
import targets from '../../lib/demo/targets.json';

export default async function DemoPage({params,searchParams}:{params:Promise<{view?:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {view:segments}=await params;
  const view=segments?.[0]??'ask';
  if((segments?.length??0)>1||!isView(view))notFound();
  const query=await searchParams;
  const read=(key:string,fallback?:string)=>typeof query[key]==='string'?query[key]:fallback;
  return <Workbench demo view={view} requestedProjectId={read('project', ['dataset-audit','split-designer','benchmark','evidence','failure-memory','provenance','report'].includes(view)?'demo-project':undefined)}
    requestedAuditId={view==='dataset-audit'?read('audit',targets.audit):undefined}
    requestedSplitId={view==='split-designer'?read('split',targets.split):undefined}
    requestedBenchmarkId={view==='benchmark'?read('benchmark',targets.benchmark_preview):undefined}
    requestedEvidenceId={view==='evidence'?read('evidence',targets.evidence):undefined}
    requestedReportId={view==='report'?read('report',targets.report):undefined}
    requestedFailureId={view==='failure-memory'?read('failure',targets.failure):undefined}
    requestedArtifactId={read('artifact')} requestedClaimSetId={read('claim_set')}/>;
}

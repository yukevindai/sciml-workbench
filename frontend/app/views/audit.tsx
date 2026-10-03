'use client';
import type { Workbench } from '../lib/context';
import { AuditInspection } from '../components/audit-inspection';
import { ArtifactAgentActivity } from '../components/artifact-agent-activity';
export function AuditView({ wb, requestedAuditId }: { wb: Workbench; requestedAuditId?: string }) {
  return <><AuditInspection wb={wb} requestedAuditId={requestedAuditId} /><ArtifactAgentActivity key={wb.projectId} wb={wb} kind="audit" /></>;
}

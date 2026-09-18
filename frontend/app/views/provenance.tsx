'use client';

import { ArrowRight, Layers } from 'lucide-react';
import type { Workbench } from '../lib/context';
import { formatDate, shortId } from '../lib/format';
import { kinds } from '../lib/types';
import { EmptyState, JsonBox, Panel } from '../components/ui';

export function ProvenanceView({ wb }: { wb: Workbench }) {
  const records = kinds(wb.artifacts, 'provenance');

  return (
    <Panel
      title="Artifact lineage"
      description="Every operation records the exact artifact IDs it consumed and produced. Source assertions remain user-supplied and are never independently verified."
      aside={records.length ? <span className="badge badge--plain">{records.length} recorded</span> : undefined}
    >
      {records.length === 0 ? (
        <EmptyState icon={Layers} title="No lineage yet">
          Upload a dataset or ingest a document, and each step will be recorded here as it happens.
        </EmptyState>
      ) : (
        <ul>
          {records.map((record, index) => (
            <li className="lineage" key={record.id}>
              <span className="lineage-rail">
                <span className="lineage-icon" aria-hidden="true"><Layers size={14} /></span>
                {index < records.length - 1 && <span className="lineage-thread" aria-hidden="true" />}
              </span>

              <div className="lineage-body">
                <div>
                  <span className="lineage-title">{record.activity.replaceAll('_', ' ')}</span>
                  <span className="meta-list" style={{ marginTop: 'var(--space-3)' }}>
                    <span>{formatDate(record.created_at)}</span>
                  </span>
                </div>

                <div className="lineage-flow">
                  <span className="dim">Inputs</span>
                  <span className="lineage-ids">
                    {record.inputs?.length
                      ? record.inputs.map(id => <span className="id-pill" key={id} title={id}>{shortId(id)}</span>)
                      : <span className="dim">original upload</span>}
                  </span>
                  <ArrowRight size={13} aria-hidden="true" className="dim" />
                  <span className="dim">Outputs</span>
                  <span className="lineage-ids">
                    {record.outputs?.map(id => <span className="id-pill" key={id} title={id}>{shortId(id)}</span>)}
                  </span>
                </div>

                <JsonBox value={record} summary="Inspect parameters and full IDs" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

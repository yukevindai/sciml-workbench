'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { DatasetArtifact } from '../lib/types';
import { auditConfigIssues, initialAuditConfig, parseAuditConfig } from '../lib/audit';
import { AdvancedJson, ColumnSelect, ColumnToggles } from './inputs';
import { Alert, Disclosure } from './ui';

/** Keyed by immutable dataset ID: changing data discards every prior configuration choice. */
export function AuditForm({ wb, dataset }: { wb: Workbench; dataset: DatasetArtifact }) {
  const [config, setConfig] = useState(() => initialAuditConfig(dataset));
  const [validJson, setValidJson] = useState(true);
  const issues = auditConfigIssues(config, dataset.columns);
  return <fieldset className="intake-fields" disabled={wb.busy}>
    <p className="field-hint">Configuration applies to {dataset.filename} ({dataset.id}). A target is optional for inspection. Advanced options are validated by the scientific worker.</p>
    <ColumnSelect label="Target column" hint="Optional quantity to predict. Choosing a target removes it from features."
      columns={dataset.columns} value={config.target_column ?? ''} allowEmpty placeholder="No target declared"
      onChange={value => setConfig({ ...config, target_column: value || null, feature_columns: config.feature_columns.filter(column => column !== value) })} />
    <ColumnToggles label="Numeric columns" columns={dataset.columns} selected={config.numeric_columns}
      onChange={value => setConfig({ ...config, numeric_columns: value })} />
    <ColumnToggles label="Feature columns" columns={dataset.columns} selected={config.feature_columns}
      disabledColumns={config.target_column ? [config.target_column] : []}
      onChange={value => setConfig({ ...config, feature_columns: value })} />
    <ColumnToggles label="Provenance columns" hint="Columns identifying sample, batch, family, or source."
      columns={dataset.columns} selected={config.provenance_columns}
      onChange={value => setConfig({ ...config, provenance_columns: value })} />
    <Disclosure summary="Advanced — edit audit configuration as JSON">
      <AdvancedJson label="Audit configuration (JSON)" value={config} onChange={setConfig}
        parse={parseAuditConfig} onValidityChange={setValidJson} />
    </Disclosure>
    {issues.length > 0 && <Alert variant="error" title="Review audit configuration">{issues.join(' ')}</Alert>}
    <div className="panel-foot">
      <span className="field-hint">Execution does not establish scientific acceptance.</span>
      <button className="button" disabled={!validJson || issues.length > 0} onClick={() => wb.act(() => wb.submit('audit', { dataset_id: dataset.id, config }))}>
        <ShieldCheck size={15} aria-hidden="true" />Run audit
      </button>
    </div>
  </fieldset>;
}

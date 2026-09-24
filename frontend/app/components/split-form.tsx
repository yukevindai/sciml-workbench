'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GitBranch } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { DatasetArtifact } from '../lib/types';
import { auditDataset, auditHref } from '../lib/audit';
import { initialSplitConfig, parseSplitConfig, splitConfigIssues } from '../lib/split';
import { SPLIT_STRATEGIES } from '../lib/defaults';
import { formatDate } from '../lib/format';
import { AdvancedJson, ColumnSelect, ColumnToggles, RatioDesigner } from './inputs';
import { Alert, Disclosure, Field } from './ui';

export function SplitForm({ wb, dataset }: { wb: Workbench; dataset: DatasetArtifact }) {
  const [config, setConfig] = useState(() => initialSplitConfig(dataset));
  const [validJson, setValidJson] = useState(true);
  const [auditId, setAuditId] = useState('');
  const audits = wb.audits.filter(audit => auditDataset(audit, [dataset])).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const audit = audits.find(value => value.id === auditId) ?? (auditId ? undefined : audits[0]);
  const issues = splitConfigIssues(config, dataset.columns);
  return <fieldset className="intake-fields" disabled={wb.busy}>
    <Field label="Source audit" hint="Only audits with matching dataset and parent lineage can be selected. Completion does not certify clean data.">
      {props => <select className="select" value={audit?.id ?? ''} onChange={event => setAuditId(event.target.value)} {...props}>
        <option value="" disabled>Select an audit of this dataset</option>
        {audits.map(value => <option key={value.id} value={value.id}>{value.id} · {formatDate(value.created_at)}</option>)}
      </select>}
    </Field>
    {audit ? <Link className="text-link" href={auditHref(wb.projectId, audit.id)}>Inspect selected audit</Link>
      : <Alert variant="warning">Complete an audit of this dataset with valid lineage before generating a partition.</Alert>}
    <ColumnToggles label="Grouping columns" hint="Declare the independent unit relevant to your question. Related rows must stay together."
      columns={dataset.columns} selected={config.group_columns} onChange={value => setConfig({ ...config, group_columns: value })} />
    <ColumnToggles label="Design columns" hint="Used according to the selected strategy: for example composition, date, or extrapolation variables."
      columns={dataset.columns} selected={config.columns} onChange={value => setConfig({ ...config, columns: value })} />
    <ColumnSelect label="Target column" hint="Optional; declaring a target does not automatically balance its distribution."
      columns={dataset.columns} value={config.target_column ?? ''} allowEmpty placeholder="No target declared"
      onChange={value => setConfig({ ...config, target_column: value || null })} />
    <RatioDesigner validation={config.validation_size} test={config.test_size}
      onChange={(validation, test) => setConfig({ ...config, validation_size: validation, test_size: test })} />
    <p className="field-hint">Shares are requests. Boundary-based strategies use their configured cutoffs/thresholds; actual counts may differ.</p>
    <div className="field-row">
      <Field label="Strategy" hint="Temporal, extrapolation and cluster designs need additional JSON configuration. Molecular designs require optional RDKit support.">
        {props => <><input className="input" list="split-strategies" value={config.strategy} onChange={event => setConfig({ ...config, strategy: event.target.value })} {...props} />
          <datalist id="split-strategies">{SPLIT_STRATEGIES.map(strategy => <option key={strategy} value={strategy} />)}</datalist></>}
      </Field>
      <Field label="Random seed" hint="Repeatability depends on the same inputs, configuration and software.">
        {props => <input className="input" type="number" min={0} step={1} value={Number.isFinite(config.seed) ? config.seed : ''}
          onChange={event => setConfig({ ...config, seed: event.target.value === '' ? NaN : Number(event.target.value) })} {...props} />}
      </Field>
    </div>
    <Disclosure summary="Advanced — edit SciSplit configuration as JSON">
      <AdvancedJson label="SciSplit configuration (JSON)" value={config} onChange={setConfig} parse={parseSplitConfig} onValidityChange={setValidJson} />
    </Disclosure>
    {issues.length > 0 && <Alert variant="error" title="Review split configuration">{issues.join(' ')}</Alert>}
    <div className="panel-foot">
      <span className="field-hint">The backend validates the exact dataset/audit lineage and scientific configuration.</span>
      <button className="button" disabled={!audit || !validJson || issues.length > 0} onClick={() => wb.act(() => wb.submit('split', { dataset_id: dataset.id, audit_id: audit!.id, config }))}>
        <GitBranch size={15} aria-hidden="true" />Generate partition
      </button>
    </div>
  </fieldset>;
}

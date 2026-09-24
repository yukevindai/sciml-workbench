'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import type { Workbench } from '../lib/context';
import type { BenchmarkConfig, DatasetArtifact } from '../lib/types';
import { DOMAINS } from '../lib/types';
import { COMMON_UNITS } from '../lib/defaults';
import { benchmarkConfigIssues, initialBenchmarkConfig, parseBenchmarkConfig, undeclaredUnits } from '../lib/benchmark';
import { splitHref } from '../lib/split';
import { humanise } from '../lib/format';
import { Alert, Disclosure, Field } from './ui';
import { AdvancedJson, ChipInput, ColumnSelect, ColumnToggles, JustificationEditor, UnitsEditor } from './inputs';
import { SplitSelect } from '../views/shared';

const MODELS: { value: BenchmarkConfig['model']; label: string; blurb: string }[] = [
  { value: 'mean', label: 'Mean', blurb: 'Predicts the training average. The score any real model must beat.' },
  { value: 'ridge', label: 'Ridge', blurb: 'Linear regression with L2 regularisation, chosen on validation.' },
];

const INDEPENDENCE = [
  { value: 'documented', label: 'Documented in the source' },
  { value: 'proxy', label: 'Proxy column stands in' },
  { value: 'synthetic', label: 'Synthetic, generated groups' },
] as const;

/** Manual task card for one dataset. Mounted per project and dataset, so a
 *  dataset change starts a fresh draft; a server rejection keeps it intact. */
export function BenchmarkForm({ wb, dataset }: { wb: Workbench; dataset: DatasetArtifact }) {
  const [config, setConfig] = useState(() => initialBenchmarkConfig(dataset));
  const [validJson, setValidJson] = useState(true);
  const columns = dataset.columns;
  const split = wb.selectedSplit?.dataset_id === dataset.id ? wb.selectedSplit : undefined;
  const issues = benchmarkConfigIssues(config, columns);
  const excluded = split?.assignments.includes('excluded');
  const unitless = validJson && !issues.length ? undeclaredUnits(config) : [];

  return <fieldset className="intake-fields" disabled={wb.busy}>
    <SplitSelect wb={wb} />
    {split ? <Link className="text-link" href={splitHref(wb.projectId, split.id)}>Inspect selected split</Link>
      : <Alert variant="warning">Generate a partition of this dataset before running a baseline.</Alert>}
    {excluded && <Alert variant="warning" title="This split excludes rows">The pinned benchmark protocol rejects partitions with excluded rows. Choose or generate a split without exclusions.</Alert>}

    <div className="panel-section">
      <span className="panel-section-title">Model</span>
      <div className="segmented" role="group" aria-label="Baseline model">
        {MODELS.map(model => (
          <button key={model.value} type="button" className="segmented-option" aria-pressed={config.model === model.value}
            onClick={() => setConfig({ ...config, model: model.value })}>{model.label}</button>
        ))}
      </div>
      <p className="field-hint">{MODELS.find(m => m.value === config.model)?.blurb}</p>
    </div>

    <div className="panel-section">
      <span className="panel-section-title">Columns</span>
      <ColumnSelect label="Target" hint="What the baseline predicts. It cannot also be a feature." columns={columns}
        value={config.target} onChange={value => setConfig({ ...config, target: value })} />
      <ColumnToggles label="Numeric features" hint="Continuous inputs the model may use." columns={columns}
        selected={config.numeric_features} onChange={value => setConfig({ ...config, numeric_features: value })} disabledColumns={[config.target]} />
      <ColumnToggles label="Categorical features" hint="Discrete inputs such as a material class or method label." columns={columns}
        selected={config.categorical_features} onChange={value => setConfig({ ...config, categorical_features: value })} disabledColumns={[config.target]} />
      <ColumnSelect label="Row identifier" hint="A column that is unique per row, used to tie predictions back to your data." columns={columns}
        value={config.row_id} onChange={value => setConfig({ ...config, row_id: value })} />
      <ColumnToggles label="Independent group columns" hint="The same grouping the partition was built on. Upstream re-checks for leakage across it."
        columns={columns} selected={config.group_columns} onChange={value => setConfig({ ...config, group_columns: value })} />
    </div>

    <div className="panel-section">
      <span className="panel-section-title">Units</span>
      <UnitsEditor columns={columns} units={config.units} suggestions={COMMON_UNITS} onChange={units => setConfig({ ...config, units })} />
    </div>

    <div className="panel-section">
      <span className="panel-section-title">Scientific claims</span>
      <div className="field-row">
        <Field label="Independent unit" hint="What one genuinely independent observation is.">
          {props => <input className="input" value={config.independence_unit} onChange={e => setConfig({ ...config, independence_unit: e.target.value })} {...props} />}
        </Field>
        <Field label="Independence status">
          {props => <select className="select" value={config.independence_status} onChange={e => setConfig({ ...config, independence_status: e.target.value as typeof config.independence_status })} {...props}>
            <option value="" disabled>Select a status</option>
            {INDEPENDENCE.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>}
        </Field>
      </div>
      <Field label="Why are those units independent?" hint="The argument a reviewer would need: what stops information leaking between them?">
        {props => <textarea className="textarea" value={config.independence_rationale} onChange={e => setConfig({ ...config, independence_rationale: e.target.value })} {...props} />}
      </Field>
      <Field label="What would a good score support?" hint="Be specific about the population this result would generalise to.">
        {props => <textarea className="textarea" value={config.generalization} onChange={e => setConfig({ ...config, generalization: e.target.value })} {...props} />}
      </Field>
      <ChipInput label="Limitations" hint="What this run cannot establish, no matter how good the numbers look. At least one is required."
        placeholder="Single synthetic fixture; not experimental evidence" values={config.limitations}
        onChange={limitations => setConfig({ ...config, limitations })} emptyText="At least one limitation is required" />
      <Field label="Scientific domain">
        {props => <select className="select" value={config.domain} onChange={e => setConfig({ ...config, domain: e.target.value as typeof config.domain })} {...props}>
          <option value="" disabled>Select a domain</option>
          {DOMAINS.map(domain => <option key={domain} value={domain}>{humanise(domain)}</option>)}
        </select>}
      </Field>
      <JustificationEditor value={config.accepted_warnings} onChange={accepted_warnings => setConfig({ ...config, accepted_warnings })} />
      <Field label="Random seed" hint="Recorded with the run so it can be replayed exactly.">
        {props => <input className="input tabular" type="number" min={0} step={1} value={Number.isFinite(config.seed) ? config.seed : ''}
          onChange={e => setConfig({ ...config, seed: e.target.value === '' ? NaN : Number(e.target.value) })} {...props} />}
      </Field>
    </div>

    <Disclosure summary="Advanced — edit the task card as JSON">
      <AdvancedJson label="Task card declarations (JSON)" value={config} onChange={setConfig} parse={parseBenchmarkConfig} onValidityChange={setValidJson} />
    </Disclosure>
    {issues.length > 0 && <Alert variant="error" title="Review the task card">{issues.join(' ')}</Alert>}
    {unitless.length > 0 && <Alert variant="warning" title="Units not declared">No unit is declared for {unitless.join(', ')}. Upstream admission is expected to reject this card; the rejection is recorded as a failed run.</Alert>}

    <div className="panel-foot">
      <span className="field-hint">Admission runs upstream before any model is fitted. A rejected card keeps this draft.</span>
      <button className="button" disabled={!split || !validJson || issues.length > 0}
        onClick={() => wb.act(() => wb.submit('benchmark', { ...config, dataset_id: dataset.id, split_id: split!.id }))}>
        <Activity size={15} aria-hidden="true" />Run benchmark
      </button>
    </div>
  </fieldset>;
}

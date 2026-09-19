'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Activity, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { benchmarkDefault, COMMON_UNITS } from '../lib/defaults';
import type { Workbench } from '../lib/context';
import { DOMAINS, type BenchmarkConfig, type IndependenceStatus } from '../lib/types';
import { formatDate, humanise } from '../lib/format';
import { metricPartition } from '../lib/result-projections';
import { Alert, Badge, Disclosure, Field, JsonBox, Panel } from '../components/ui';
import {
  AdvancedJson, ChipInput, ColumnSelect, ColumnToggles, JustificationEditor, UnitsEditor,
} from '../components/inputs';
import { MetricGrid } from '../components/results';
import { StageGate } from '../components/workflow';
import { DatasetSelect, SplitSelect } from './shared';

const MODELS: { value: BenchmarkConfig['model']; label: string; blurb: string }[] = [
  { value: 'mean', label: 'Mean', blurb: 'Predicts the training average. The score any real model must beat.' },
  { value: 'ridge', label: 'Ridge', blurb: 'Linear regression with L2 regularisation.' },
];

const INDEPENDENCE: { value: IndependenceStatus; label: string }[] = [
  { value: 'documented', label: 'Documented in the source' },
  { value: 'proxy', label: 'Proxy column stands in' },
  { value: 'synthetic', label: 'Synthetic, generated groups' },
];

export function BenchmarkView({ wb }: { wb: Workbench }) {
  const [config, setConfig] = useState<BenchmarkConfig>(benchmarkDefault);
  const stage = wb.workflow.stages.find(s => s.view === 'benchmark');
  const columns = wb.selectedDataset?.columns ?? [];

  return (
    <>
      <StageGate stage={stage} />

      <div className="split split--sticky">
        <Panel
          title="Configure a baseline"
          description="This is a task card: the declarations upstream admission checks before any model is fitted. An incomplete card is rejected rather than silently patched."
        >
          <DatasetSelect wb={wb} />
          <SplitSelect wb={wb} />

          <div className="panel-section">
            <span className="panel-section-title">Model</span>
            <div className="segmented" role="group" aria-label="Baseline model">
              {MODELS.map(model => (
                <button
                  key={model.value}
                  type="button"
                  className="segmented-option"
                  aria-pressed={config.model === model.value}
                  onClick={() => setConfig({ ...config, model: model.value })}
                >
                  {model.label}
                </button>
              ))}
            </div>
            <p className="field-hint">{MODELS.find(m => m.value === config.model)?.blurb}</p>
          </div>

          <div className="panel-section">
            <span className="panel-section-title">Columns</span>

            <ColumnSelect
              label="Target"
              hint="What the baseline predicts. It cannot also be a feature."
              columns={columns}
              value={config.target}
              onChange={value => setConfig({ ...config, target: value })}
            />

            <ColumnToggles
              label="Numeric features"
              hint="Continuous inputs the model may use."
              columns={columns}
              selected={config.numeric_features}
              onChange={value => setConfig({ ...config, numeric_features: value })}
              disabledColumns={[config.target]}
            />

            <ColumnToggles
              label="Categorical features"
              hint="Discrete inputs such as a material class or method label."
              columns={columns}
              selected={config.categorical_features}
              onChange={value => setConfig({ ...config, categorical_features: value })}
              disabledColumns={[config.target]}
            />

            <ColumnSelect
              label="Row identifier"
              hint="A column that is unique per row, used to tie predictions back to your data."
              columns={columns}
              value={config.row_id}
              onChange={value => setConfig({ ...config, row_id: value })}
            />

            <ColumnToggles
              label="Independent group columns"
              hint="The same grouping the partition was built on. Upstream re-checks for leakage across it."
              columns={columns}
              selected={config.group_columns}
              onChange={value => setConfig({ ...config, group_columns: value })}
            />
          </div>

          <div className="panel-section">
            <span className="panel-section-title">Units</span>
            <UnitsEditor
              columns={columns}
              units={config.units}
              suggestions={COMMON_UNITS}
              onChange={units => setConfig({ ...config, units })}
            />
          </div>

          <div className="panel-section">
            <span className="panel-section-title">Scientific claims</span>

            <div className="field-row">
              <Field label="Independent unit" hint="What one genuinely independent observation is.">
                {props => (
                  <input className="input" value={config.independence_unit}
                    onChange={e => setConfig({ ...config, independence_unit: e.target.value })} {...props} />
                )}
              </Field>

              <Field label="Independence status">
                {props => (
                  <select className="select" value={config.independence_status}
                    onChange={e => setConfig({ ...config, independence_status: e.target.value as IndependenceStatus })} {...props}>
                    {INDEPENDENCE.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            <Field
              label="Why are those units independent?"
              hint="The argument a reviewer would need: what stops information leaking between them?"
            >
              {props => (
                <textarea className="textarea" value={config.independence_rationale}
                  onChange={e => setConfig({ ...config, independence_rationale: e.target.value })} {...props} />
              )}
            </Field>

            <Field
              label="What would a good score support?"
              hint="Be specific about the population this result would generalise to."
            >
              {props => (
                <textarea className="textarea" value={config.generalization}
                  onChange={e => setConfig({ ...config, generalization: e.target.value })} {...props} />
              )}
            </Field>

            <ChipInput
              label="Limitations"
              hint="What this run cannot establish, no matter how good the numbers look. At least one is required."
              placeholder="Single synthetic fixture; not experimental evidence"
              values={config.limitations}
              onChange={limitations => setConfig({ ...config, limitations })}
              emptyText="At least one limitation is required"
            />

            <Field label="Scientific domain">
              {props => (
                <select className="select" value={config.domain}
                  onChange={e => setConfig({ ...config, domain: e.target.value as BenchmarkConfig['domain'] })} {...props}>
                  {DOMAINS.map(domain => (
                    <option key={domain} value={domain}>{humanise(domain)}</option>
                  ))}
                </select>
              )}
            </Field>

            <JustificationEditor
              value={config.accepted_warnings}
              onChange={accepted_warnings => setConfig({ ...config, accepted_warnings })}
            />

            <Field label="Random seed" hint="Recorded with the run so it can be replayed exactly.">
              {props => (
                <input className="input tabular" type="number" min={0} value={config.seed}
                  onChange={e => setConfig({ ...config, seed: Number(e.target.value) })} {...props} />
              )}
            </Field>
          </div>

          <Disclosure summary="Advanced — edit the task card as JSON">
            <AdvancedJson label="Task card declarations (JSON)" value={config} onChange={setConfig} />
          </Disclosure>

          <div className="panel-foot">
            <span className="field-hint">
              {config.limitations.length === 0
                ? 'Declare at least one limitation before running.'
                : 'Admission runs upstream before any model is fitted.'}
            </span>
            <button
              className="button"
              disabled={wb.busy || !wb.projectId || !wb.selectedSplit}
              onClick={() => wb.act(() => wb.submit('benchmark', {
                ...config,
                dataset_id: wb.selectedDataset!.id,
                split_id: wb.selectedSplit!.id,
              }))}
            >
              <Activity size={15} aria-hidden="true" />Run benchmark
            </button>
          </div>
        </Panel>

        <Panel
          title="Evaluation protocol"
          description="ChemE Benchmarks owns admission, preprocessing, fitting and every metric. The workbench only assembles the card."
        >
          <div className="stack stack--tight">
            <div className="finding">
              <span className="finding-mark" data-severity="info"><ShieldCheck size={14} aria-hidden="true" /></span>
              <div className="finding-body">
                <span className="finding-code">Admission before evaluation</span>
                <p className="finding-message">
                  The dataset, declared units, independent groups and frozen split are all validated before training starts.
                </p>
              </div>
            </div>
            <div className="finding">
              <span className="finding-mark" data-severity="info"><Activity size={14} aria-hidden="true" /></span>
              <div className="finding-body">
                <span className="finding-code">One-way flow</span>
                <p className="finding-message">
                  Preprocessing is fitted on training rows only. Hyperparameters are chosen on validation. Test rows are scored once.
                </p>
              </div>
            </div>
          </div>

          <Alert variant="warning" title="Errors block admission">
            A warning can be accepted only with a written scientific justification, which is stored alongside the run. Errors cannot be waived at all.
          </Alert>

          <p className="field-hint">
            Runs here are local task cards. They are not submissions to, or claims about, the public benchmark catalogue.
          </p>
        </Panel>
      </div>

      {/* --------------------------------- runs --------------------------- */}
      {wb.runs.map(run => (
        <Panel
          key={run.id}
          className="result"
          title={`${run.model} baseline`}
          description={formatDate(run.created_at)}
          aside={<Badge state={run.status} />}
        >
          {run.error && (
            <Alert variant="error" title="Admission or evaluation failed">{run.error}</Alert>
          )}

          {metricPartition(run.result, 'test') && (
            <div>
              <span className="panel-section-title">Held-out test scores</span>
              <MetricGrid metrics={metricPartition(run.result, 'test') ?? {}} />
              <p className="field-hint" style={{ marginTop: 'var(--space-5)' }}>
                Validation scores and the full model configuration are in the complete artifact and the exported report.
              </p>
            </div>
          )}

          <JsonBox value={run} />

          <Link className="text-link" href="/failure-memory">
            This run did not meet my objective <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </Panel>
      ))}
    </>
  );
}

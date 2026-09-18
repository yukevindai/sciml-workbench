'use client';

import { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { splitDefault, SPLIT_STRATEGIES } from '../lib/defaults';
import type { Workbench } from '../lib/context';
import type { SplitConfig } from '../lib/types';
import { formatDate } from '../lib/format';
import { Disclosure, EmptyState, Field, JsonBox, Panel } from '../components/ui';
import { AdvancedJson, ColumnSelect, ColumnToggles, RatioDesigner } from '../components/inputs';
import { PartitionSummary } from '../components/partition';
import { StageGate } from '../components/workflow';
import { DatasetSelect } from './shared';

export function SplitView({ wb }: { wb: Workbench }) {
  const [config, setConfig] = useState<SplitConfig>(splitDefault);
  const stage = wb.workflow.stages.find(s => s.view === 'split-designer');
  const columns = wb.selectedDataset?.columns ?? [];
  const latestAudit = wb.audits.at(-1);

  return (
    <>
      <StageGate stage={stage} />

      <div className="split split--sticky">
        <Panel
          title="Define the holdout"
          description="A random row split flatters almost any model. Grouping by the unit your science cares about is what makes the test score mean something."
        >
          <DatasetSelect wb={wb} />

          <ColumnToggles
            label="Grouping columns"
            hint="Rows sharing these values always land in the same partition. Choose whatever a new, unseen case would differ by: family, batch, material, subject."
            columns={columns}
            selected={config.group_columns}
            onChange={value => setConfig({ ...config, group_columns: value, columns: value })}
          />

          <ColumnToggles
            label="Balancing columns"
            hint="Columns SciSplit tries to keep proportionally represented across partitions."
            columns={columns}
            selected={config.columns}
            onChange={value => setConfig({ ...config, columns: value })}
          />

          <ColumnSelect
            label="Target column"
            hint="Used to keep the outcome distribution comparable across partitions."
            columns={columns}
            value={config.target_column}
            onChange={value => setConfig({ ...config, target_column: value })}
          />

          <RatioDesigner
            validation={config.validation_size}
            test={config.test_size}
            onChange={(validation, test) => setConfig({ ...config, validation_size: validation, test_size: test })}
          />

          <div className="field-row">
            <Field label="Strategy" hint="Passed straight through to SciSplit.">
              {props => (
                <>
                  <input
                    className="input"
                    list="split-strategies"
                    value={config.strategy}
                    onChange={event => setConfig({ ...config, strategy: event.target.value })}
                    {...props}
                  />
                  <datalist id="split-strategies">
                    {SPLIT_STRATEGIES.map(strategy => <option key={strategy} value={strategy} />)}
                  </datalist>
                </>
              )}
            </Field>

            <Field label="Random seed" hint="Same seed, same partition. Record it with your results.">
              {props => (
                <input
                  className="input tabular"
                  type="number"
                  min={0}
                  value={config.seed}
                  onChange={event => setConfig({ ...config, seed: Number(event.target.value) })}
                  {...props}
                />
              )}
            </Field>
          </div>

          <Disclosure summary="Advanced — edit SciSplit configuration as JSON">
            <AdvancedJson label="SciSplit configuration (JSON)" value={config} onChange={setConfig} />
          </Disclosure>

          <div className="panel-foot">
            <span className="field-hint">
              {latestAudit
                ? 'The most recent audit of this dataset is linked automatically.'
                : 'Upload a dataset and complete an audit first.'}
            </span>
            <button
              className="button"
              disabled={wb.busy || !wb.projectId || !latestAudit || config.validation_size + config.test_size >= 1}
              onClick={() => wb.act(() => wb.submit('split', {
                dataset_id: wb.selectedDataset!.id,
                audit_id: latestAudit!.id,
                config,
              }))}
            >
              <GitBranch size={15} aria-hidden="true" />Generate partition
            </button>
          </div>
        </Panel>

        <Panel
          title="Partition balance"
          description="What SciSplit actually produced. Whole groups move together, so these counts rarely match the requested proportions exactly."
          aside={wb.selectedSplit ? <span className="badge badge--success">frozen</span> : undefined}
        >
          {wb.selectedSplit ? (
            <>
              <PartitionSummary assignments={wb.selectedSplit.assignments} />
              <div className="meta-list">
                <span>Generated {formatDate(wb.selectedSplit.created_at)}</span>
                <span className="meta-id">{wb.selectedSplit.id.slice(0, 8)}</span>
              </div>
              <JsonBox value={wb.selectedSplit} />
            </>
          ) : (
            <EmptyState icon={GitBranch} title="Your partition will appear here">
              Choose the grouping that matches your scientific question, then generate a partition to see how the rows fall.
            </EmptyState>
          )}
        </Panel>
      </div>

      {wb.partitions.length > 1 && (
        <Panel title="Earlier partitions" headingLevel={2}>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Partition</th><th scope="col">Strategy</th>
                  <th scope="col">Seed</th><th scope="col">Rows</th><th scope="col">Generated</th>
                </tr>
              </thead>
              <tbody>
                {wb.partitions.map(split => (
                  <tr key={split.id}>
                    <td className="meta-id">{split.id.slice(0, 8)}</td>
                    <td>{String(split.config?.strategy ?? '—')}</td>
                    <td className="num">{String(split.config?.seed ?? '—')}</td>
                    <td className="num">{split.assignments.length}</td>
                    <td>{formatDate(split.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

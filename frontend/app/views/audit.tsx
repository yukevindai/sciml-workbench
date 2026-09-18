'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Database, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { readPreview, looksNumeric, type CsvPreview } from '../lib/csv';
import { auditDefault, sourceDefault } from '../lib/defaults';
import type { Workbench } from '../lib/context';
import type { AuditConfig, SourceMetadata } from '../lib/types';
import { formatDate } from '../lib/format';
import { Alert, Disclosure, EmptyState, Field, JsonBox, Panel } from '../components/ui';
import { AdvancedJson, ColumnSelect, ColumnToggles } from '../components/inputs';
import { FindingList, FindingSummary } from '../components/results';
import { StageGate } from '../components/workflow';
import { DatasetSelect } from './shared';

export function AuditView({ wb }: { wb: Workbench }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [source, setSource] = useState<SourceMetadata>(sourceDefault);
  const [config, setConfig] = useState<AuditConfig>(auditDefault);

  const stage = wb.workflow.stages.find(s => s.view === 'dataset-audit');
  const columns = wb.selectedDataset?.columns ?? [];

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    let cancelled = false;
    readPreview(file)
      .then(result => { if (!cancelled) setPreview(result); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [file]);

  return (
    <>
      <StageGate stage={stage} />

      <div className="split">
        {/* ------------------------------- upload ------------------------- */}
        <Panel
          title="Upload a CSV"
          description="UTF-8, up to 10 MiB and 20,000 rows, with unique column names. The original bytes are stored untouched and shipped in the final report."
        >
          <Field
            label="CSV file"
            hint="Nothing is uploaded until you choose Upload dataset."
          >
            {props => (
              <div className="dropzone">
                <FileSpreadsheet size={24} className="dropzone-icon" aria-hidden="true" />
                <span className="dropzone-title">{file?.name ?? 'Choose a dataset'}</span>
                <span className="dropzone-hint">
                  {file
                    ? `${(file.size / 1024).toFixed(0)} KB selected`
                    : 'One row per observation, one column per variable'}
                </span>
                <input
                  className="input-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={event => setFile(event.target.files?.[0] ?? null)}
                  {...props}
                />
              </div>
            )}
          </Field>

          {preview && preview.columns.length > 0 && (
            <div className="panel-section">
              <span className="panel-section-title">Preview · read in your browser only</span>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      {preview.columns.map((column, index) => (
                        <th key={column} scope="col">
                          {column}
                          <span className="col-type">
                            {' '}{looksNumeric(preview.rows.map(r => r[index] ?? '')) ? 'numeric' : 'text'}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {preview.columns.map((column, index) => <td key={column}>{row[index] ?? ''}</td>)}
                      </tr>
                    ))}
                  </tbody>
                  <caption>
                    First {preview.rows.length} rows of {preview.columns.length} columns. Types are a guess from this sample.
                  </caption>
                </table>
              </div>
            </div>
          )}

          <div className="panel-section">
            <span className="panel-section-title">Where this data came from</span>
            <p className="field-hint">
              These declarations travel with the dataset into every downstream result. They are your assertions; nothing here is verified.
            </p>

            <Field label="Citation" hint="Paper, dataset release or internal record this data comes from.">
              {props => (
                <input className="input" value={source.citation}
                  onChange={e => setSource({ ...source, citation: e.target.value })} {...props} />
              )}
            </Field>

            <Field label="Source URL">
              {props => (
                <input className="input" value={source.url}
                  onChange={e => setSource({ ...source, url: e.target.value })} {...props} />
              )}
            </Field>

            <div className="field-row">
              <Field label="Licence">
                {props => (
                  <input className="input" value={source.license}
                    onChange={e => setSource({ ...source, license: e.target.value })} {...props} />
                )}
              </Field>

              <Field label="Kind of data" hint="Measured in the world, or generated?">
                {props => (
                  <select className="select" value={source.data_kind}
                    onChange={e => setSource({ ...source, data_kind: e.target.value as SourceMetadata['data_kind'] })} {...props}>
                    <option value="empirical">Empirical (measured)</option>
                    <option value="synthetic">Synthetic (generated)</option>
                  </select>
                )}
              </Field>
            </div>

            <Field
              label="Transformations applied"
              hint="Anything done to the data before this file: unit conversion, filtering, deduplication, averaging."
            >
              {props => (
                <textarea className="textarea" value={source.transformations}
                  onChange={e => setSource({ ...source, transformations: e.target.value })} {...props} />
              )}
            </Field>

            <Disclosure summary="Advanced — edit source metadata as JSON">
              <AdvancedJson label="Source metadata (JSON)" value={source} onChange={setSource} />
            </Disclosure>
          </div>

          <div className="panel-foot">
            <span className="field-hint">{file ? 'Ready to upload' : 'Choose a file to continue'}</span>
            <button
              className="button"
              disabled={wb.busy || !wb.projectId || !file}
              onClick={() => wb.act(async () => {
                await api(`projects/${wb.projectId}/datasets`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'text/csv',
                    'X-Filename': file!.name,
                    'X-Source': JSON.stringify(source),
                  },
                  body: file,
                });
                wb.setNotice('Dataset uploaded with its source metadata. Configure the audit next.');
              })}
            >
              Upload dataset <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </div>
        </Panel>

        {/* ------------------------------- audit -------------------------- */}
        <Panel
          title="Run ChemData Auditor"
          description="Tell the auditor what each column is for. It checks completeness, provenance and leakage against those declarations."
        >
          <DatasetSelect wb={wb} />

          {wb.selectedDataset ? (
            <>
              <ColumnSelect
                label="Target column"
                hint="The quantity you eventually want to predict."
                columns={columns}
                value={config.target_column}
                onChange={value => setConfig({ ...config, target_column: value })}
              />

              <ColumnToggles
                label="Numeric columns"
                hint="Every column the auditor should treat as a number, including the target."
                columns={columns}
                selected={config.numeric_columns}
                onChange={value => setConfig({ ...config, numeric_columns: value })}
              />

              <ColumnToggles
                label="Feature columns"
                hint="Columns a model is allowed to learn from. The target must not appear here."
                columns={columns}
                selected={config.feature_columns}
                onChange={value => setConfig({ ...config, feature_columns: value })}
                disabledColumns={[config.target_column]}
              />

              <ColumnToggles
                label="Provenance columns"
                hint="Columns that identify where a row came from — sample, batch, family, source. These are what leakage checks rely on."
                columns={columns}
                selected={config.provenance_columns}
                onChange={value => setConfig({ ...config, provenance_columns: value })}
              />

              <Disclosure summary="Advanced — edit audit configuration as JSON">
                <AdvancedJson label="Audit configuration (JSON)" value={config} onChange={setConfig} />
              </Disclosure>
            </>
          ) : (
            <EmptyState icon={Database} title="No dataset yet">
              Upload a CSV on the left and its columns will appear here to choose from.
            </EmptyState>
          )}

          <div className="panel-foot">
            <span className="field-hint">
              {config.feature_columns.includes(config.target_column)
                ? 'The target cannot also be a feature.'
                : 'Runs upstream, unchanged.'}
            </span>
            <button
              className="button"
              disabled={wb.busy || !wb.projectId || !wb.selectedDataset}
              onClick={() => wb.act(() => wb.submit('audit', {
                dataset_id: wb.selectedDataset!.id,
                config,
              }))}
            >
              <ShieldCheck size={15} aria-hidden="true" />Run audit
            </button>
          </div>
        </Panel>
      </div>

      {/* --------------------------------- results ------------------------ */}
      {wb.audits.map(audit => {
        const findings = audit.result?.findings ?? [];
        return (
          <Panel
            key={audit.id}
            title="Audit findings"
            description={`Run ${formatDate(audit.created_at)}`}
            aside={<FindingSummary findings={findings} />}
          >
            {findings.length === 0 ? (
              <Alert variant="success" title="No findings for the checks you configured">
                This is not a certificate of scientific validity — it means nothing the auditor looks for was triggered by these declarations.
              </Alert>
            ) : (
              <>
                <FindingList findings={findings} />
                <p className="field-hint">
                  Errors block benchmark admission. Warnings can be accepted only with a written scientific justification, declared on the benchmark step.
                </p>
              </>
            )}
            <JsonBox value={audit} />
          </Panel>
        );
      })}
    </>
  );
}

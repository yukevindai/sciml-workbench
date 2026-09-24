'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Database, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { parseMaterial } from '../lib/decode';
import { auditFindings } from '../lib/result-projections';
import { readPreview, looksNumeric, type CsvPreview } from '../lib/csv';
import { auditDefault, sourceDefault } from '../lib/defaults';
import type { Workbench } from '../lib/context';
import type { AuditConfig, SourceMetadata } from '../lib/types';
import { emptySource, fileDigest, isBundledDemo, isDemoSource, parseSourceDraft, reusableSource, sourceDeclarations, sourceHeader, type SourceDraft } from '../lib/intake';
import { formatDate } from '../lib/format';
import { Alert, Disclosure, EmptyState, Field, JsonBox, Panel } from '../components/ui';
import { AdvancedJson, ColumnSelect, ColumnToggles } from '../components/inputs';
import { FindingList, FindingSummary } from '../components/results';
import { StageGate } from '../components/workflow';
import { DatasetSelect } from './shared';

export function AuditView({ wb }: { wb: Workbench }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [source, setSource] = useState<SourceDraft>(emptySource);
  const [sourceValid, setSourceValid] = useState(true);
  const [digest, setDigest] = useState('');
  const [fileError, setFileError] = useState('');
  const [reuseId, setReuseId] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [sourceRevision, setSourceRevision] = useState(0);
  const uploadRequest = useRef<{ signature: string; key: string } | null>(null);
  const [config, setConfig] = useState<AuditConfig>(auditDefault);

  const stage = wb.workflow.stages.find(s => s.view === 'dataset-audit');
  const columns = wb.selectedDataset?.columns ?? [];

  useEffect(() => {
    setPreview(null); setDigest(''); setFileError('');
    if (!file) return;
    if (!file.size || file.size > 10 * 1024 * 1024) { setFileError('Choose a nonempty CSV no larger than 10 MiB.'); return; }
    let cancelled = false;
    Promise.all([readPreview(file), fileDigest(file)])
      .then(([result, sha]) => { if (!cancelled) { setPreview(result); setDigest(sha); } })
      .catch(() => { if (!cancelled) setFileError('Could not read this file. Select it again. Your declarations have been preserved.'); });
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
          <fieldset className="intake-fields" disabled={wb.busy || !wb.projectId}>
          <Field
            label="CSV file"
            hint="Nothing is uploaded until you choose Upload dataset."
            error={fileError || undefined}
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
                  onChange={event => { setFile(event.target.files?.[0] ?? null); setDigest(''); setPreview(null); uploadRequest.current = null; setSource(emptySource()); setSourceValid(true); setSourceRevision(value => value + 1); setReuseId(''); setSourceNote(''); }}
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
                        <th key={index} scope="col">
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
                        {preview.columns.map((column, index) => <td key={index}>{row[index] ?? ''}</td>)}
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
            <span className="panel-section-title">Where this data came from (optional)</span>
            <p className="field-hint">
              Leave unknown fields blank. You can upload and inspect data without knowing its provenance. These declarations are your assertions; nothing here is verified.
            </p>

            <button className="button" type="button" disabled={!isBundledDemo(digest)}
              onClick={() => { if (isBundledDemo(digest)) { setSource(sourceDefault); setSourceValid(true); setSourceRevision(value => value + 1); setSourceNote('Synthetic declarations applied only to the exact bundled demo bytes.'); } }}>Use bundled synthetic demo declarations</button>
            <p className="field-hint">Available only when the selected file exactly matches examples/demo.csv.</p>
            <Disclosure summary="Reuse known metadata from this project">
              <Field label="Metadata from dataset" hint="Choose a source, then explicitly copy its known values. Unknown and inferred declarations are not copied. Demo metadata is available only for the exact demo file.">
                {props => <select className="select" value={reuseId} onChange={event => setReuseId(event.target.value)} {...props}>
                  <option value="">Choose a dataset</option>
                  {wb.datasets.filter(dataset => !isDemoSource(dataset) || isBundledDemo(digest)).map(dataset => (
                    <option key={dataset.id} value={dataset.id}>{dataset.filename} · {dataset.id.slice(0, 8)}</option>
                  ))}
                </select>}
              </Field>
              <button type="button" className="button button--secondary" disabled={!reuseId || !file}
                onClick={() => {
                  const dataset = wb.datasets.find(candidate => candidate.id === reuseId);
                  if (!dataset || (isDemoSource(dataset) && !isBundledDemo(digest))) return;
                  setSource(reusableSource(dataset)); setSourceValid(true); setSourceRevision(value => value + 1);
                  setSourceNote(`Copied known values from ${dataset.filename}. Review every field: uploading makes new user assertions and does not verify them or change the original dataset.`);
                }}>Copy known metadata</button>
            </Disclosure>
            {sourceNote && <Alert>{sourceNote}</Alert>}
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
                    <option value="">Unknown</option>
                    <option value="empirical">Empirical (measured)</option>
                    <option value="synthetic">Synthetic (generated)</option>
                  </select>
                )}
              </Field>
            </div>

            <Field
              label="Transformations applied"
              hint={Array.isArray(source.transformations) && source.transformations.length === 0
                ? 'No transformations explicitly declared. Clear or edit this value in advanced JSON to change that assertion.'
                : 'Anything done before this file: unit conversion, filtering, deduplication, averaging. Blank means unknown.'}
            >
              {props => (
                <textarea className="textarea" value={Array.isArray(source.transformations) ? source.transformations.join('\n') : source.transformations}
                  onChange={e => setSource({ ...source, transformations: e.target.value })} {...props} />
              )}
            </Field>

            <Disclosure summary="Advanced — edit source metadata as JSON">
              <p className="field-hint">Optional fields: target (column name), units (column-to-unit object), and independent_unit (name, group_columns, rationale). Omit unknown fields. An empty transformations array declares no transformations.</p>
              <AdvancedJson key={sourceRevision} label="Source metadata (JSON)" value={source} onChange={setSource}
                parse={parseSourceDraft} onValidityChange={setSourceValid} />
            </Disclosure>
          </div>

          <div className="panel-foot">
            <span className="field-hint">{file ? 'Ready to upload' : 'Choose a file to continue'}</span>
            <button
              className="button"
              disabled={wb.busy || !wb.projectId || !file || !digest || Boolean(fileError) || !sourceValid}
              onClick={() => wb.act(async () => {
                const signature = JSON.stringify({ project: wb.projectId, source });
                if (uploadRequest.current?.signature !== signature) uploadRequest.current = { signature, key: crypto.randomUUID() };
                const key = uploadRequest.current.key;
                const declarations = sourceDeclarations(source, key);
                const material = await api(`projects/${wb.projectId}/research-materials`, parseMaterial, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'text/csv',
                    'X-Filename': file!.name,
                    'X-Source': sourceHeader(declarations),
                    'Idempotency-Key': key,
                  },
                  body: file,
                });
                if (material.project_id !== wb.projectId || !material.dataset_id) throw new Error('The server returned an attachment outside this dataset context.');
                wb.setDatasetId(material.dataset_id);
                wb.setNotice('Dataset uploaded. Blank declarations remain unknown. Configure the audit next.');
              })}
            >
              Upload dataset <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          </div>
          </fieldset>
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
        const findings = auditFindings(audit.result);
        return (
          <Panel
            key={audit.id}
            title="Audit findings"
            description={`Run ${formatDate(audit.created_at)}`}
            aside={findings && <FindingSummary findings={findings} />}
          >
            {findings === null ? (
              <Alert variant="warning" title="Findings summary unavailable">
                Inspect the complete artifact below; this result has no supported findings summary.
              </Alert>
            ) : findings.length === 0 ? (
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

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, CircleAlert, Plus, TriangleAlert, X } from 'lucide-react';
import { Field, FieldGroup } from './ui';

/* --------------------------- column selection ----------------------------- */

/** Multi-select over the dataset's own header row. A value that is no longer
 *  present in the file stays selectable and is flagged, rather than silently
 *  dropped from a configuration the researcher wrote. */
export function ColumnToggles({
  label, hint, columns, selected, onChange, disabledColumns = [],
}: {
  label: string;
  hint?: string;
  columns: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabledColumns?: string[];
}) {
  const missing = selected.filter(value => !columns.includes(value));
  const toggle = (column: string) =>
    onChange(selected.includes(column) ? selected.filter(c => c !== column) : [...selected, column]);

  return (
    <FieldGroup label={label} hint={hint}>
      {columns.length === 0 && missing.length === 0 ? (
        <p className="field-hint">Upload a dataset to choose from its columns.</p>
      ) : (
        <div className="token-grid">
          {columns.map(column => {
            const isDisabled = disabledColumns.includes(column);
            return (
              <button
                key={column}
                type="button"
                className="token"
                aria-pressed={selected.includes(column)}
                disabled={isDisabled}
                title={isDisabled ? 'Already used as the target' : undefined}
                onClick={() => toggle(column)}
              >
                <Check size={12} className="token-check" aria-hidden="true" />
                {column}
              </button>
            );
          })}
          {missing.map(column => (
            <button
              key={column}
              type="button"
              className="token"
              aria-pressed
              onClick={() => toggle(column)}
              title="Not a column in the selected dataset"
            >
              <TriangleAlert size={12} aria-hidden="true" />
              {column}
            </button>
          ))}
        </div>
      )}
    </FieldGroup>
  );
}

/** Single-column choice. Keeps an unknown stored value visible instead of
 *  resetting it to the first column. */
export function ColumnSelect({
  label, hint, columns, value, onChange, placeholder = 'Select a column',
}: {
  label: string;
  hint?: string;
  columns: string[];
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const options = value && !columns.includes(value) ? [value, ...columns] : columns;
  return (
    <Field label={label} hint={hint}>
      {props => (
        <select className="select" value={value} onChange={e => onChange(e.target.value)} {...props}>
          <option value="" disabled>{placeholder}</option>
          {options.map(column => (
            <option key={column} value={column}>
              {column}{columns.includes(column) ? '' : ' (not in dataset)'}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/* --------------------------- list of free strings ------------------------- */

export function ChipInput({
  label, hint, placeholder, values, onChange, emptyText = 'None yet',
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  values: string[];
  onChange: (next: string[]) => void;
  emptyText?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value || values.includes(value)) { setDraft(''); return; }
    onChange([...values, value]);
    setDraft('');
  };

  return (
    <FieldGroup label={label} hint={hint}>
      <div className="chip-list">
        {values.length === 0 && <span className="chip chip--empty">{emptyText}</span>}
        {values.map(value => (
          <span className="chip" key={value}>
            <span className="chip-text" title={value}>{value}</span>
            <button
              type="button"
              className="chip-remove"
              onClick={() => onChange(values.filter(v => v !== value))}
              aria-label={`Remove ${value}`}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="cluster">
        <input
          className="input"
          style={{ flex: '1 1 16rem' }}
          value={draft}
          placeholder={placeholder}
          aria-label={`Add to ${label.toLowerCase()}`}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        />
        <button type="button" className="button button--secondary button--sm" onClick={add} disabled={!draft.trim()}>
          <Plus size={14} aria-hidden="true" />Add
        </button>
      </div>
    </FieldGroup>
  );
}

/* --------------------------- units and key/value -------------------------- */

export function UnitsEditor({
  columns, units, onChange, suggestions,
}: {
  columns: string[];
  units: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  suggestions: string[];
}) {
  const listId = useId();
  const entries = Object.entries(units);

  const setEntry = (index: number, key: string, value: string) => {
    const next = entries.map((entry, i) => (i === index ? [key, value] : entry));
    onChange(Object.fromEntries(next));
  };

  return (
    <FieldGroup
      label="Units"
      hint="Every feature and the target need a declared unit. Upstream admission rejects a task card with a missing or unknown unit."
    >
      <datalist id={listId}>
        {suggestions.map(unit => <option key={unit} value={unit} />)}
      </datalist>

      {entries.length === 0 && <p className="field-hint">No units declared yet.</p>}

      {entries.map(([column, unit], index) => (
        <div className="kv-row" key={`${column}-${index}`}>
          <select
            className="select"
            value={column}
            aria-label={`Column for unit ${index + 1}`}
            onChange={e => setEntry(index, e.target.value, unit)}
          >
            {!columns.includes(column) && <option value={column}>{column} (not in dataset)</option>}
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            className="input kv-value"
            value={unit}
            list={listId}
            placeholder="e.g. kelvin"
            aria-label={`Unit for ${column}`}
            onChange={e => setEntry(index, column, e.target.value)}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove unit for ${column}`}
            onClick={() => onChange(Object.fromEntries(entries.filter((_, i) => i !== index)))}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ))}

      <div>
        <button
          type="button"
          className="button button--secondary button--sm"
          onClick={() => {
            const free = columns.find(c => !(c in units)) ?? '';
            onChange({ ...units, [free]: '' });
          }}
          disabled={columns.every(c => c in units)}
        >
          <Plus size={14} aria-hidden="true" />Declare a unit
        </button>
      </div>
    </FieldGroup>
  );
}

export function JustificationEditor({
  value, onChange,
}: { value: Record<string, string>; onChange: (next: Record<string, string>) => void }) {
  const entries = Object.entries(value);
  const setEntry = (index: number, key: string, text: string) =>
    onChange(Object.fromEntries(entries.map((entry, i) => (i === index ? [key, text] : entry))));

  return (
    <FieldGroup
      label="Accepted warnings"
      hint="Leave this empty unless the audit raised a warning you are deliberately accepting. Each code needs a written scientific justification; a blank one is rejected."
    >
      {entries.length === 0 && <p className="field-hint">No warnings accepted. Errors can never be waived.</p>}
      {entries.map(([code, reason], index) => (
        <div className="kv-row" key={index}>
          <input
            className="input"
            value={code}
            placeholder="Warning code"
            aria-label={`Warning code ${index + 1}`}
            onChange={e => setEntry(index, e.target.value, reason)}
          />
          <input
            className="input kv-value"
            value={reason}
            placeholder="Why is this acceptable for your question?"
            aria-label={`Justification for warning ${index + 1}`}
            onChange={e => setEntry(index, code, e.target.value)}
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove warning ${code || index + 1}`}
            onClick={() => onChange(Object.fromEntries(entries.filter((_, i) => i !== index)))}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="button button--secondary button--sm" onClick={() => onChange({ ...value, '': '' })}>
          <Plus size={14} aria-hidden="true" />Accept a warning
        </button>
      </div>
    </FieldGroup>
  );
}

/* --------------------------- advanced JSON view --------------------------- */

/** The same configuration the form builds, editable as raw JSON. Edits flow
 *  back into the form, so neither view is a dead end. */
export function AdvancedJson<T>({
  label, value, onChange,
}: { label: string; value: T; onChange: (next: T) => void }) {
  const serialised = JSON.stringify(value, null, 2);
  const [text, setText] = useState(serialised);
  const [error, setError] = useState('');
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) { setText(serialised); setError(''); }
  }, [serialised]);

  return (
    <Field
      label={label}
      hint="Edits here update the form above. The object shown is exactly what will be sent."
      error={error || undefined}
    >
      {props => (
        <textarea
          className="textarea textarea--code"
          spellCheck={false}
          value={text}
          onFocus={() => { editing.current = true; }}
          onBlur={() => { editing.current = false; setText(serialised); setError(''); }}
          onChange={event => {
            setText(event.target.value);
            try {
              const parsed = JSON.parse(event.target.value) as T;
              setError('');
              onChange(parsed);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Invalid JSON');
            }
          }}
          {...props}
        />
      )}
    </Field>
  );
}

/* --------------------------- ratio designer ------------------------------- */

/** Requested proportions. The counts SciSplit actually produces are
 *  group-constrained and are only known after the partition is generated. */
export function RatioDesigner({
  validation, test, onChange,
}: { validation: number; test: number; onChange: (validation: number, test: number) => void }) {
  const train = Math.max(0, 1 - validation - test);
  const invalid = validation + test >= 1;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <FieldGroup
      label="Requested proportions"
      hint="Whole groups move together, so the partition you get back will not match these numbers exactly."
    >
      <div className="ratio-bar" aria-hidden="true">
        {train > 0 && <div className="train" style={{ flex: train }}>{pct(train)}</div>}
        {validation > 0 && <div className="validation" style={{ flex: validation }}>{pct(validation)}</div>}
        {test > 0 && <div className="test" style={{ flex: test }}>{pct(test)}</div>}
      </div>
      <p className="field-hint">
        Training {pct(train)} · Validation {pct(validation)} · Test {pct(test)}
      </p>

      {(['validation', 'test'] as const).map(which => {
        const current = which === 'validation' ? validation : test;
        return (
          <Field key={which} label={which === 'validation' ? 'Validation share' : 'Test share'}>
            {props => (
              <>
                <div className="range-head">
                  <span className="field-hint">
                    {which === 'validation'
                      ? 'Used to choose hyperparameters.'
                      : 'Held out until the very end.'}
                  </span>
                  <span className="range-value">{pct(current)}</span>
                </div>
                <input
                  type="range"
                  className="range"
                  min={0.05}
                  max={0.5}
                  step={0.05}
                  value={current}
                  onChange={e => {
                    const next = Number(e.target.value);
                    onChange(which === 'validation' ? next : validation, which === 'test' ? next : test);
                  }}
                  {...props}
                />
              </>
            )}
          </Field>
        );
      })}

      {invalid && (
        <p className="field-error">
          <CircleAlert size={13} aria-hidden="true" />
          Validation and test together must leave rows for training.
        </p>
      )}
    </FieldGroup>
  );
}

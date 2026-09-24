'use client';

import { useId, type ReactNode } from 'react';
import { executionStatus } from '../lib/status';
import {
  AlertTriangle, Check, ChevronRight, CircleAlert, Info, type LucideIcon,
} from 'lucide-react';

/* ---------------------------------- panel -------------------------------- */

export function Panel({
  title, description, aside, children, className = '', headingLevel = 2, id, tabIndex,
}: {
  title?: ReactNode;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
  id?: string;
  tabIndex?: number;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={`panel ${className}`.trim()} id={id} tabIndex={tabIndex}>
      {(title || aside) && (
        <div className="panel-head">
          <div className="panel-head-text">
            {title && <Heading>{title}</Heading>}
            {description && <p className="panel-desc">{description}</p>}
          </div>
          {aside}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

/* ---------------------------------- badge -------------------------------- */

const BADGE_TONE: Record<string, string> = {
  succeeded: 'badge--success', completed: 'badge--success', recorded: 'badge--success',
  done: 'badge--success', ok: 'badge--success',
  failed: 'badge--danger', error: 'badge--danger',
  warning: 'badge--warning', warn: 'badge--warning',
  running: 'badge--info', queued: 'badge--info', info: 'badge--info',
};

/** Renders the state as text; colour is a second, redundant cue only. */
export function Badge({ state, tone }: { state: string; tone?: string }) {
  const status = executionStatus(state);
  const resolved = tone ?? status?.tone ?? BADGE_TONE[state.toLowerCase()] ?? '';
  return <span className={`badge ${resolved}`.trim()} title={status?.description}>{status?.label ?? state.replaceAll('_', ' ')}</span>;
}

/* ---------------------------------- alert -------------------------------- */

const ALERT_ICON: Record<string, LucideIcon> = {
  error: CircleAlert, success: Check, warning: AlertTriangle, info: Info,
};

export function Alert({
  variant = 'info', title, children, role,
}: {
  variant?: 'error' | 'success' | 'warning' | 'info';
  title?: ReactNode;
  children?: ReactNode;
  role?: 'alert' | 'status';
}) {
  const Icon = ALERT_ICON[variant];
  return (
    <div className={`alert alert--${variant}`} role={role}>
      <Icon size={17} className="alert-icon" aria-hidden="true" />
      <div className="alert-body">
        {title && <strong>{title}</strong>}
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}

/* ---------------------------------- field -------------------------------- */

type ControlProps = { id: string; 'aria-describedby': string | undefined; 'aria-invalid': boolean | undefined };

/** The label element holds the label text and nothing else, so a control's
 *  accessible name is exactly what the researcher reads. Hints and errors are
 *  associated through aria-describedby instead. */
export function Field({
  label, hint, error, children,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && <p className="field-hint" id={hintId}>{hint}</p>}
      {error && (
        <p className="field-error" id={errorId}>
          <CircleAlert size={13} aria-hidden="true" />{error}
        </p>
      )}
    </div>
  );
}

/** A labelled group of controls that is not a single form element. */
export function FieldGroup({
  label, hint, children,
}: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <div className="field" role="group" aria-labelledby={id}>
      <span className="field-label" id={id}>{label}</span>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

/* ---------------------------------- disclosure --------------------------- */

export function Disclosure({
  summary, children, defaultOpen = false,
}: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>
        <ChevronRight size={14} className="disclosure-chevron" aria-hidden="true" />
        {summary}
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

export function JsonBox({ value, summary = 'Inspect complete artifact' }: { value: unknown; summary?: string }) {
  return (
    <Disclosure summary={summary}>
      <pre className="code-block">{JSON.stringify(value, null, 2)}</pre>
    </Disclosure>
  );
}

/* ---------------------------------- empty state -------------------------- */

export function EmptyState({
  icon: Icon, title, children, action,
}: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true"><Icon size={20} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/* ---------------------------------- tiles -------------------------------- */

export function Tile({
  label, value, note, icon: Icon,
}: { label: string; value: ReactNode; note?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="tile">
      <span className="tile-label">
        {Icon && <Icon size={13} aria-hidden="true" />}{label}
      </span>
      <span className="tile-value">{value}</span>
      {note && <span className="tile-note">{note}</span>}
    </div>
  );
}

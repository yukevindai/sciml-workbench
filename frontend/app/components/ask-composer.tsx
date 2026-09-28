'use client';

import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ArrowUp, FileSpreadsheet, FileText, Loader2, Paperclip, X } from 'lucide-react';
import type { MaterialResponse } from '../lib/generated/http';
import { acceptedFile } from '../lib/ask';

export type Draft = { prompt: string; files: File[]; earlier: MaterialResponse[]; reviewPlan: boolean };

const MAX_PROMPT = 4000;
const isPdf = (name: string) => name.toLowerCase().endsWith('.pdf');

/**
 * One box: type, attach, send. Enter sends and Shift+Enter adds a line. Files
 * already in the project are offered as chips the person can switch off.
 */
export function AskComposer({ onSend, busy, disabled, projectFiles, placeholder, compact, initial }: {
  onSend: (draft: Draft) => Promise<boolean>;
  busy: boolean;
  disabled?: boolean;
  projectFiles: MaterialResponse[];
  placeholder?: string;
  compact?: boolean;
  initial?: string;
}) {
  const [prompt, setPrompt] = useState(initial ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [reviewPlan, setReviewPlan] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const hintId = useId();

  useEffect(() => { if (initial !== undefined) { setPrompt(initial); box.current?.focus(); } }, [initial]);

  // Grow with the text, up to a comfortable height.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [prompt]);

  const add = (list: File[]) => {
    const problems: string[] = [];
    const ok = list.filter(file => { const problem = acceptedFile(file); if (problem) problems.push(problem); return !problem; });
    setFileError(problems.join(' '));
    setFiles(current => [...current, ...ok.filter(file => !current.some(f => f.name === file.name && f.size === file.size))]);
  };

  const earlier = projectFiles.filter(file => !skipped.includes(file.id));
  const ready = prompt.trim().length > 0 && prompt.length <= MAX_PROMPT && !busy && !disabled;

  const send = async () => {
    if (!ready) return;
    const sent = await onSend({ prompt: prompt.trim(), files, earlier, reviewPlan });
    if (sent) { setPrompt(''); setFiles([]); setFileError(''); }
  };

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault(); setDragging(false);
    if (!busy && !disabled) add(Array.from(event.dataTransfer.files));
  };

  return (
    <div className={`composer${dragging ? ' composer--drag' : ''}${compact ? ' composer--compact' : ''}`}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)} onDrop={onDrop}>
      {(files.length > 0 || projectFiles.length > 0) && <ul className="composer-files" aria-label="Files for this request">
        {projectFiles.map(file => {
          const on = !skipped.includes(file.id);
          return <li key={file.id}>
            <button type="button" className={`chip chip--toggle${on ? ' chip--on' : ''}`} aria-pressed={on} disabled={busy}
              title={on ? 'The assistant can use this file. Click to leave it out.' : 'Left out. Click to include it.'}
              onClick={() => setSkipped(values => on ? [...values, file.id] : values.filter(id => id !== file.id))}>
              {isPdf(file.filename) ? <FileText size={13} aria-hidden="true" /> : <FileSpreadsheet size={13} aria-hidden="true" />}
              <span className="truncate">{file.filename}</span>
            </button>
          </li>;
        })}
        {files.map(file => <li key={`${file.name}:${file.size}`}>
          <span className="chip chip--new">
            {isPdf(file.name) ? <FileText size={13} aria-hidden="true" /> : <FileSpreadsheet size={13} aria-hidden="true" />}
            <span className="truncate">{file.name}</span>
            <button type="button" className="chip-remove" aria-label={`Remove ${file.name}`} disabled={busy}
              onClick={() => setFiles(current => current.filter(f => f !== file))}><X size={12} aria-hidden="true" /></button>
          </span>
        </li>)}
      </ul>}

      <label className="visually-hidden" htmlFor="ask-box">What would you like to find out?</label>
      <textarea id="ask-box" ref={box} className="composer-input" rows={compact ? 1 : 3} maxLength={MAX_PROMPT}
        placeholder={placeholder ?? 'Ask anything about your data… for example, “Check this spreadsheet for mistakes”'}
        value={prompt} disabled={disabled} aria-describedby={hintId}
        onChange={event => setPrompt(event.target.value)} onKeyDown={onKey} />

      <div className="composer-bar">
        <div className="composer-tools">
          <button type="button" className="icon-button" aria-label="Attach a CSV or PDF file" title="Attach a CSV or PDF file"
            disabled={busy || disabled} onClick={() => picker.current?.click()}>
            <Paperclip size={18} aria-hidden="true" />
          </button>
          <input ref={picker} type="file" multiple hidden accept=".csv,text/csv,.pdf,application/pdf"
            onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
          <label className="composer-toggle" title="The assistant shows you its plan and waits for your OK before doing any real work.">
            <input type="checkbox" checked={reviewPlan} disabled={busy || disabled} onChange={event => setReviewPlan(event.target.checked)} />
            <span>Show me the plan first</span>
          </label>
        </div>
        <button type="button" className="composer-send" aria-label="Send" disabled={!ready} onClick={() => void send()}>
          {busy ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <ArrowUp size={18} aria-hidden="true" />}
        </button>
      </div>
      <p className="composer-hint" id={hintId}>
        {fileError || (dragging ? 'Drop your files to add them.' : 'Attach CSV spreadsheets or PDFs. Press Enter to send, Shift + Enter for a new line.')}
      </p>
    </div>
  );
}

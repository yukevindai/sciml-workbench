'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';

type Option = { value: string; label: string; detail?: string };

/** A searchable switcher with native button focus and a separate creation action. */
export function WorkspacePicker({ label, value, options, onChange, placeholder = 'Select', disabled = false, onCreate }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
  placeholder?: string; disabled?: boolean; onCreate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const selected = options.find(option => option.value === value);
  const filtered = options.filter(option => `${option.label} ${option.detail ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const close = () => { setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { setOpen(false); }, [disabled, value]);

  return <div className="workspace-picker" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (open && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[data-picker-option]') ?? []);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : items.length - 1)
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>
    <button ref={trigger} type="button" className="picker-trigger" aria-label={label}
      aria-expanded={open} aria-controls={id} disabled={disabled} value={value}
      onClick={() => { setQuery(''); setOpen(!open); }}>
      <span><small>{label}</small><strong>{selected?.label ?? placeholder}</strong></span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div id={id} className="picker-popover" role="region" aria-label={`${label} options`}>
      <div className="picker-search"><Search size={15} aria-hidden="true" />
        <input ref={search} value={query} onChange={event => setQuery(event.target.value)}
          aria-label={`Search ${label.toLowerCase()}`} placeholder="Search…" />
      </div>
      <div className="picker-options">
        {filtered.map(option => <button type="button" data-picker-option key={option.value}
          className="picker-option" value={option.value} aria-pressed={option.value === value}
          onClick={() => { onChange(option.value); close(); }}>
          <span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span>
          {option.value === value && <Check size={16} aria-hidden="true" />}
        </button>)}
        {!filtered.length && <p className="picker-empty">No matches</p>}
      </div>
      {onCreate && <button type="button" data-picker-option className="picker-create" onClick={() => { onCreate(); close(); }}>
        <Plus size={16} aria-hidden="true" /> New project
      </button>}
    </div>}
  </div>;
}

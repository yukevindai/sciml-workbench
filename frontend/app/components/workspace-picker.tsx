'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';

export type PickerOption = { value: string; label: string; detail?: string; group?: string; disabled?: boolean };

/** Shared compact picker. Portal keeps menus outside scrolling cards and canvas panels. */
export function WorkspacePicker({ label, value, options, onChange, placeholder = 'Select', disabled = false, onCreate, compact = false, id: suppliedId }: {
  label: string; value: string; options: PickerOption[]; onChange: (value: string) => void;
  placeholder?: string; disabled?: boolean; onCreate?: () => void; compact?: boolean; id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState({ top: 0, left: 0, width: 260, maxHeight: 360 });
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const selected = options.find(option => option.value === value);
  const filtered = options.filter(option => `${option.label} ${option.detail ?? ''} ${option.group ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const searchable = !compact || options.length > 6;
  const close = (focus = true) => { setOpen(false); if (focus) trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 12;
      const height = Math.min(360, Math.max(below, rect.top - 12));
      const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 24);
      setPosition({ top: below >= Math.min(300, height) ? rect.bottom + 6 : Math.max(12, rect.top - height - 6), left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight: height });
    };
    place();
    if (searchable) search.current?.focus();
    else popover.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"], [data-picker-option]:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && !popover.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, searchable]);
  useEffect(() => { setOpen(false); }, [disabled, value]);
  return <div className={`workspace-picker${compact ? ' workspace-picker--compact' : ''}`} ref={root} onBlur={event => {
    if (!root.current?.contains(event.relatedTarget as Node) && !popover.current?.contains(event.relatedTarget as Node)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (!open && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); if (!disabled) { setQuery(''); setOpen(true); } return; }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && !(event.target === search.current && ['Home', 'End'].includes(event.key))) {
      const items = Array.from(popover.current?.querySelectorAll<HTMLButtonElement>('[data-picker-option]:not(:disabled)') ?? []);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index < 0 ? (event.key === 'ArrowDown' ? 0 : items.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }}>
    <button ref={trigger} id={suppliedId} type="button" className="picker-trigger" aria-label={label}
      aria-expanded={open} aria-controls={open ? id : undefined} aria-haspopup="dialog" disabled={disabled} value={value}
      onClick={() => { setQuery(''); setOpen(!open); }}>
      <span>{!compact && <small>{label}</small>}<strong>{selected?.label ?? placeholder}</strong></span>
      <ChevronDown size={15} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={popover} id={id} style={position} className="picker-popover picker-popover--portal" role="dialog" aria-label={`${label} options`}>
      {searchable && <div className="picker-search"><Search size={15} aria-hidden="true" /><input ref={search} value={query} onChange={event => setQuery(event.target.value)} aria-label={`Search ${label.toLowerCase()}`} placeholder="Search…" /></div>}
      <div className="picker-options">
        {filtered.map((option, index) => <div key={option.value}>
          {option.group && option.group !== filtered[index - 1]?.group && <p className="picker-group">{option.group}</p>}
          <button type="button" data-picker-option className="picker-option" value={option.value} aria-pressed={option.value === value} disabled={option.disabled}
            onClick={() => { onChange(option.value); close(); }}>
            <span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span>
            {option.value === value && <Check size={15} aria-hidden="true" />}
          </button>
        </div>)}
        {!filtered.length && <p className="picker-empty">No matches</p>}
      </div>
      {onCreate && <button type="button" data-picker-option className="picker-create" onClick={() => { onCreate(); close(); }}><Plus size={15} aria-hidden="true" /> New project</button>}
    </div>, document.body)}
  </div>;
}

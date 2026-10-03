'use client';
import { Children, isValidElement, useEffect, useRef, useState, type ChangeEvent, type ReactNode, type SelectHTMLAttributes } from 'react';
import { WorkspacePicker, type PickerOption } from './workspace-picker';

function text(node: ReactNode): string {
  return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child)).join('');
}
function choices(children: ReactNode, group?: string): PickerOption[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode; value?: string | number; label?: string; disabled?: boolean }>(child)) return [];
    if (child.type === 'option') return [{ value: String(child.props.value ?? text(child.props.children)), label: text(child.props.children), disabled: child.props.disabled, group }];
    return choices(child.props.children, child.type === 'optgroup' ? child.props.label : group);
  });
}
/** Compatibility adapter for existing single-select fields, using the shared picker. */
export function Select({ children, value, onChange, disabled, id, name, required, 'aria-label': ariaLabel }: SelectHTMLAttributes<HTMLSelectElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState(ariaLabel ?? 'Choose option');
  const options = choices(children);
  const selected = String(value ?? '');
  useEffect(() => {
    if (ariaLabel) return;
    const parent = ref.current?.closest('label');
    const external = id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`) : null;
    const source = external ?? parent;
    if (source) setLabel(Array.from(source.childNodes).filter(node => node !== ref.current).map(node => node.textContent).join(' ').trim() || 'Choose option');
  }, [ariaLabel, id]);
  return <div ref={ref} className="select-field">
    <WorkspacePicker compact id={id} label={label} value={selected} options={options} disabled={disabled} onChange={next => onChange?.({ target: { value: next, name }, currentTarget: { value: next, name } } as ChangeEvent<HTMLSelectElement>)} />
    {name && <input type="hidden" name={name} value={selected} />}
    {required && !disabled && !selected && <input className="picker-validity" tabIndex={-1} aria-hidden="true" value="" required onChange={() => {}} onInvalid={event => { event.preventDefault(); ref.current?.querySelector('button')?.focus(); ref.current?.querySelector('button')?.click(); }} />}
  </div>;
}

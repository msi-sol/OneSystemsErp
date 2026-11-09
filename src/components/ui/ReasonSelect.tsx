'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A reason, comment or note picked from a drop-down of common answers, with "Custom…" to type your own.
 * The chosen text is the value, so it saves exactly like the free-text field it replaces.
 */
const CUSTOM = '__custom__';

export default function ReasonSelect({ id, label, options, value, onChange, disabled, maxLength = 300, multiline = false, optional = false, placeholder = 'Type your own', style }: {
  id: string;
  /** Accessible name when no visible <label htmlFor={id}> exists. */
  label?: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
  multiline?: boolean;
  /** Adds a "No note" first choice (value ''). */
  optional?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [custom, setCustom] = useState(() => !!value && !options.includes(value));
  // Only a value set from outside (e.g. cleared after saving) moves the drop-down; our own changes (such as the
  // empty value when "Custom…" is chosen) must not switch the custom box off again.
  const emitted = useRef(value);
  const emit = (next: string) => { emitted.current = next; onChange(next); };
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setCustom(!!value && !options.includes(value));
  }, [value, options]);
  const selected = custom ? CUSTOM : options.includes(value) ? value : '';

  return <div style={{ display: 'grid', gap: 8, ...style }}>
    <select id={id} aria-label={label} value={selected} disabled={disabled} onChange={event => {
      const next = event.target.value;
      if (next === CUSTOM) { setCustom(true); emit(''); }
      else { setCustom(false); emit(next); }
    }}>
      <option value="">{optional ? 'No note' : 'Choose a reason…'}</option>
      {options.map(option => <option key={option} value={option}>{option}</option>)}
      <option value={CUSTOM}>Custom… (type your own)</option>
    </select>
    {custom && (multiline
      ? <textarea aria-label={`${label || 'Reason'} (custom)`} rows={3} autoFocus maxLength={maxLength} value={value} disabled={disabled} placeholder={placeholder} onChange={event => emit(event.target.value)} />
      : <input aria-label={`${label || 'Reason'} (custom)`} autoFocus maxLength={maxLength} value={value} disabled={disabled} placeholder={placeholder} onChange={event => emit(event.target.value)} />)}
  </div>;
}

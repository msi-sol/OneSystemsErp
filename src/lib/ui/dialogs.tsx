'use client';

import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * In-page replacements for window.confirm() and window.prompt(). Native dialogs are suppressed in embedded
 * browsers (they return "cancel" without showing anything), which made approve/reject buttons silently do
 * nothing. Usage inside an async handler:
 *   if (!(await askConfirm('Approve this accomplishment?'))) return;
 *   const reason = await askText('Reason for rejecting:', { required: true }); if (reason === null) return;
 */
type Options = { confirmLabel?: string; cancelLabel?: string; danger?: boolean; required?: boolean; placeholder?: string; defaultValue?: string; multiline?: boolean };

function open<T>(render: (close: (value: T) => void) => React.ReactNode): Promise<T> {
  return new Promise<T>(resolve => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const close = (value: T) => { root.unmount(); host.remove(); resolve(value); };
    root.render(render(close));
  });
}

function Dialog({ message, options, withText, onDone }: { message: string; options: Options; withText: boolean; onDone: (value: string | null) => void }) {
  const [text, setText] = useState(options.defaultValue ?? '');
  const [touched, setTouched] = useState(false);
  const field = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { (withText ? field.current : confirmButton.current)?.focus(); }, [withText]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onDone(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);
  const missing = withText && options.required && !text.trim();
  const submit = () => { setTouched(true); if (missing) return; onDone(withText ? text.trim() : ''); };
  const accent = options.danger ? '#ef4444' : 'var(--accent-color, #00f0ff)';
  const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: `1px solid ${touched && missing ? '#ef4444' : 'var(--glass-border, rgba(255,255,255,0.15))'}`, background: 'var(--bg-dark, #0b0f19)', color: 'var(--text-primary, #fff)', font: 'inherit' };
  return <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onDone(null); }}
    style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div role="dialog" aria-modal="true" aria-label={message}
      style={{ width: 'min(460px, 100%)', background: 'var(--bg-secondary, #141a2a)', color: 'var(--text-primary, #fff)', border: '1px solid var(--glass-border, rgba(255,255,255,0.12))', borderRadius: 12, padding: 20, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
      <p style={{ margin: '0 0 14px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{message}</p>
      {withText && (options.multiline
        ? <textarea ref={field} rows={3} value={text} placeholder={options.placeholder} onChange={event => setText(event.target.value)} style={inputStyle} />
        : <input ref={field} value={text} placeholder={options.placeholder} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submit(); }} style={inputStyle} />)}
      {withText && touched && missing && <p role="alert" style={{ margin: '6px 0 0', color: '#fca5a5', fontSize: '0.85rem' }}>This is required.</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button type="button" onClick={() => onDone(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--glass-border, rgba(255,255,255,0.2))', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>{options.cancelLabel ?? 'Cancel'}</button>
        <button ref={confirmButton} type="button" onClick={submit} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: accent, color: options.danger ? '#fff' : '#000', fontWeight: 700, cursor: 'pointer' }}>{options.confirmLabel ?? 'OK'}</button>
      </div>
    </div>
  </div>;
}

/** Resolves true when confirmed, false when cancelled. */
export function askConfirm(message: string, options: Options = {}): Promise<boolean> {
  return open<boolean>(close => <Dialog message={message} options={options} withText={false} onDone={value => close(value !== null)} />);
}

/** Resolves the entered text (trimmed), or null when cancelled. */
export function askText(message: string, options: Options = {}): Promise<string | null> {
  return open<string | null>(close => <Dialog message={message} options={{ multiline: true, ...options }} withText onDone={close} />);
}

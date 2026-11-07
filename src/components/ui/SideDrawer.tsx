'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './SideDrawer.module.css';

/**
 * A panel that slides in from the right over the current page, so details open without leaving it.
 * Closes with the ✕ button, the Esc key or a click on the dimmed page; the page behind does not scroll while open.
 * Return focus to the opening control in `onClose` if needed.
 */
export default function SideDrawer({ title, meta, actions, footer, wide = false, onClose, children }: {
  title: ReactNode; meta?: ReactNode; actions?: ReactNode; footer?: ReactNode; wide?: boolean; onClose: () => void; children: ReactNode;
}) {
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  return <>
    <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />
    <aside className={`${styles.drawer} ${wide ? styles.wide : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h3 id={titleId}>{title}</h3>
          {(meta || actions) && <div className={styles.metaRow}>{meta && <p className={styles.meta}>{meta}</p>}{actions && <div className={styles.actions}>{actions}</div>}</div>}
        </div>
        <button ref={closeButton} type="button" className={styles.close} aria-label="Close panel" onClick={onClose}>✕</button>
      </header>
      <div className={styles.body}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </aside>
  </>;
}

'use client';

import { AlertCircle, Check } from 'lucide-react';
import { WPS_SITE_VIEWS, wpsStepStatus, type WpsCheck } from '@/lib/scheduling/wps-overview';
import styles from './WpsOverview.module.css';

/** One row of numbered steps in working order; each tab shows whether its checks pass. */
export default function WpsStepNav({ view, checks, packageCount, readOnly, showSiteWork, onSelect }: {
  view: string; checks: WpsCheck[]; packageCount: number; readOnly: boolean; showSiteWork: boolean; onSelect: (view: string) => void;
}) {
  const steps = wpsStepStatus(checks, packageCount);
  return <div className={styles.navWrap}>
    <nav aria-label="Work-package steps">
      <ol className={styles.steps}>
        {steps.map((step, index) => {
          const active = view === step.view;
          const status = readOnly ? null : step.done ? 'done' : step.failing ? 'attention' : null;
          return <li key={step.key}>
            <button type="button" aria-current={active ? 'step' : undefined} className={active ? styles.stepActive : styles.step} onClick={() => onSelect(step.view)}
              title={!readOnly && step.firstGap ? step.firstGap : undefined}>
              <span className={status === 'done' ? styles.markerDone : status === 'attention' ? styles.markerWarn : styles.marker} aria-hidden="true">
                {status === 'done' ? <Check size={13} strokeWidth={2.5} /> : status === 'attention' ? <AlertCircle size={13} /> : index + 1}
              </span>
              <span className={styles.stepText}>
                <span>{step.label}</span>
                {!readOnly && step.failing > 0 && <small>{step.failing} to fix</small>}
                <span className={styles.srOnly}>{status === 'done' ? ' (checks pass)' : status === 'attention' ? ` (${step.failing} checks need attention)` : ''}</span>
              </span>
            </button>
          </li>;
        })}
      </ol>
    </nav>
    {showSiteWork && <nav className={styles.siteNav} aria-label="Site work on the approved plan">
      <span>Site work</span>
      {WPS_SITE_VIEWS.map(item => <button key={item.view} type="button" aria-current={view === item.view ? 'page' : undefined} className={view === item.view ? styles.siteActive : styles.site} onClick={() => onSelect(item.view)}>{item.label}</button>)}
    </nav>}
  </div>;
}

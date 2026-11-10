import { wpsReconciliation } from '@/lib/scheduling/wps-overview';
import styles from './WpsOverview.module.css';

const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);

/** The plan at a glance: does the package total reconcile with the BOQ, and how ready is it? */
export default function WpsPlanSummary({ boqTotal, packageTotal, packageCount, weightTotal, checksPassed, checksTotal, statusLabel }: {
  boqTotal: number; packageTotal: string | null; packageCount: number; datedCount: number; weightTotal: string;
  checksPassed: number; checksTotal: number; statusLabel: string;
}) {
  const reconciliation = wpsReconciliation(boqTotal, packageTotal);
  const weightsOk = Math.abs(Number(weightTotal) - 100) < 0.0001;
  return <section className={styles.summary} aria-label="Plan at a glance">
    <div className={styles.summaryHead}><h3>Plan at a glance</h3><span>{statusLabel}</span></div>
    <dl className={styles.facts}>
      <div className={reconciliation.reconciles ? styles.factOk : styles.factWarn}>
        <dt>Package values vs BOQ total</dt>
        <dd>{reconciliation.packageTotal === null ? 'Not all values recorded' : money(reconciliation.packageTotal)}</dd>
      </div>
      <div><dt>Packages</dt><dd>{packageCount}</dd></div>
      <div className={weightsOk ? undefined : styles.factWarn}><dt>Completion weights</dt><dd>{weightTotal}%</dd></div>
      <div className={checksTotal && checksPassed === checksTotal ? styles.factOk : undefined}><dt>Preparation checks</dt><dd>{checksPassed} of {checksTotal}</dd></div>
    </dl>
  </section>;
}

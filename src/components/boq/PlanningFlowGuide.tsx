import styles from './PlanningFlowGuide.module.css';

/** Orientation only: approval and access remain enforced by each module. */
export default function PlanningFlowGuide({ step, next }: { step: 1 | 2 | 3; next: string }) {
  const steps = ['Upload & check file', 'Review & approve BOQ', 'Prepare & approve packages'];
  return <section className={styles.guide} aria-label="BOQ to work packages guide">
    <ol>{steps.map((label, index) => <li key={label} aria-current={step === index + 1 ? 'step' : undefined}>
      <span className={styles.number}>{index + 1}</span><span>{label}</span>
    </li>)}</ol>
    <p><strong>Your next step:</strong> {next}</p>
  </section>;
}

import Link from 'next/link';
import { ArrowRight, Check, Lock, UserRound } from 'lucide-react';
import { PLANNING_PHASES, type PlanningLifecycle } from '@/lib/planning/lifecycle';
import styles from './NextStepCard.module.css';

/**
 * The shared "where am I / what next" card for BOQ Workspace, BOQ and Work Packages.
 * Orientation only: approval and access remain enforced by each module.
 */
/** Sub-steps use letters (A, B, C…) so they are not confused with the numbered 1-2-3 stages above them. */
const stepLetter = (index: number) => String.fromCharCode(65 + index);

export default function NextStepCard({ lifecycle, stepsLabel = 'Steps in this stage' }: { lifecycle: PlanningLifecycle; stepsLabel?: string }) {
  const { phase, complete, steps, next } = lifecycle;
  const doneCount = steps.filter(step => step.state === 'done').length;
  const currentIndex = steps.findIndex(step => step.state === 'current');
  return <section className={styles.card} aria-label="Where this BOQ stands and what to do next">
    <ol className={styles.phases} aria-label="BOQ to work packages path">
      {PLANNING_PHASES.map(item => {
        const state = complete || item.phase < phase ? 'done' : item.phase === phase ? 'current' : 'todo';
        return <li key={item.phase} className={styles[state]} aria-current={state === 'current' ? 'step' : undefined}>
          <span className={styles.marker} aria-hidden="true">{state === 'done' ? <Check size={14} strokeWidth={2.5} /> : item.phase}</span>
          <span>{item.label}<span className={styles.srOnly}>{state === 'done' ? ' (done)' : state === 'current' ? ' (current stage)' : ' (not started)'}</span></span>
        </li>;
      })}
    </ol>
    <div className={styles.next}>
      <div className={styles.nextText}>
        {currentIndex >= 0 && <p className={styles.eyebrow}>Step {stepLetter(currentIndex)} of {stepLetter(steps.length - 1)}</p>}
        <h2 className={styles.title}>{next.title}</h2>
        <p className={styles.detail}>{next.detail}</p>
        {next.waitingOn && <p className={styles.waiting}><UserRound size={15} aria-hidden="true" /><span><strong>Who acts next:</strong> {next.waitingOn}</span></p>}
      </div>
      {next.cta && (next.cta.href.includes('#')
        ?<a className={styles.cta} href={next.cta.href}>{next.cta.label} <ArrowRight size={16} aria-hidden="true" /></a>
        : <Link className={styles.cta} href={next.cta.href}>{next.cta.label} <ArrowRight size={16} aria-hidden="true" /></Link>)}
    </div>
    {steps.length > 0 && <details className={styles.steps}>
      <summary>{stepsLabel} A–{stepLetter(steps.length - 1)} · {doneCount === steps.length ? 'all done' : `${doneCount} done`}</summary>
      <ol>
        {steps.map((step, index) => <li key={step.key} className={styles[step.state]} aria-current={step.state === 'current' ? 'step' : undefined}>
          <span className={styles.stepIcon} aria-hidden="true">{step.state === 'done' ? <Check size={14} strokeWidth={2.5} /> : step.state === 'locked' ? <Lock size={13} /> : <span className={styles.letter}>{stepLetter(index)}</span>}</span>
          <span><span className={styles.stepLabel}>{stepLetter(index)}. {step.label}</span><span className={styles.srOnly}>{step.state === 'done' ? ' (done)' : step.state === 'current' ? ' (current step)' : step.state === 'locked' ? ' (locked)' : ''}</span>
            {step.state === 'locked' && step.hint && <span className={styles.stepHint}>{step.hint}</span>}
            {step.state === 'done' && step.hint && <span className={styles.stepHint}>{step.hint}</span>}
          </span>
        </li>)}
      </ol>
    </details>}
  </section>;
}

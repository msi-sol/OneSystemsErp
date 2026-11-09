'use client';

import { useEffect, useState } from 'react';
import styles from './AiThinking.module.css';

/**
 * Waiting indicator for AI checks: an animated spark and a shimmering status line that types out what the AI is
 * working on, cycling through `messages`, with the seconds elapsed. Shown only while a check is running.
 */
const SPARK_FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];

export const AI_THINKING_MESSAGES = {
  boq: ['Reading the BOQ items', 'Checking units and quantities', 'Looking for duplicate items', 'Spotting unclear descriptions', 'Checking items sit in the right sections', 'Preparing suggestions'],
  workPackages: ['Reading the BOQ sections', 'Reviewing the current work packages', 'Grouping sections into packages', 'Working out which packages come first', 'Preparing suggestions'],
  dates: ['Reading the work packages', 'Weighing package values and assumptions', 'Estimating durations', 'Working out the sequence', 'Fitting dates within the contract period', 'Preparing date suggestions'],
  benchmark: ['Reading the procurement benchmark', 'Checking quantity × unit cost on every line', 'Looking for duplicate lines', 'Matching budget lines to the BOQ', 'Comparing the totals', 'Preparing suggestions'],
  dupa: ['Reading the DUPA rows', 'Matching them to the package BOQ items', 'Checking quantity × rate on each row', 'Looking for duplicates and totals', 'Sorting rows into material, labor and equipment', 'Preparing suggestions'],
  materialRequest: ['Reading the material request', 'Checking quantities against the BOQ', 'Checking what was already requested', 'Reviewing the budget', 'Preparing the result'],
  quotations: ['Reading the supplier quotations', 'Comparing prices for the full quantities', 'Scoring delivery periods', 'Scoring payment terms', 'Ranking the suppliers', 'Writing the summary'],
  generic: ['Reading the data', 'Looking for issues', 'Cross-checking the numbers', 'Preparing the result'],
} as const;

type Props = {
  messages: readonly string[];
  /** Optional line under the status, e.g. how long it usually takes. */
  note?: string;
  /** Show the seconds counter (default true). */
  showElapsed?: boolean;
  className?: string;
};

export default function AiThinking({ messages, note, showElapsed = true, className }: Props) {
  const [frame, setFrame] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const message = messages[index % Math.max(messages.length, 1)] ?? 'Working';

  useEffect(() => {
    const spark = window.setInterval(() => setFrame(value => (value + 1) % SPARK_FRAMES.length), 120);
    const started = Date.now();
    const clock = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => { window.clearInterval(spark); window.clearInterval(clock); };
  }, []);

  // Type the current message out, hold it, then move to the next one.
  useEffect(() => {
    if (typed < message.length) {
      const timer = window.setTimeout(() => setTyped(value => value + 1), 28);
      return () => window.clearTimeout(timer);
    }
    const hold = window.setTimeout(() => { setIndex(value => (value + 1) % Math.max(messages.length, 1)); setTyped(0); }, 2600);
    return () => window.clearTimeout(hold);
  }, [typed, message, messages.length]);

  const slow = elapsed >= 90;
  return <div className={`${styles.thinking} ${className ?? ''}`} role="status" aria-live="polite">
    <div className={styles.line}>
      <span className={styles.spark} aria-hidden="true">{SPARK_FRAMES[frame]}</span>
      {/* Screen readers get the whole message once; the typing effect is visual only. */}
      <span className={styles.srOnly}>{message}…</span>
      <span className={styles.text} aria-hidden="true">{message.slice(0, typed)}{typed >= message.length ? '…' : ''}<span className={styles.caret} /></span>
      {showElapsed && <span className={styles.elapsed} aria-hidden="true">{elapsed}s</span>}
    </div>
    {(note || slow) && <p className={styles.note}>{slow ? 'Still working: the AI service is slower than usual. It stops by itself after about 4 minutes, and nothing is changed either way.' : note}</p>}
  </div>;
}

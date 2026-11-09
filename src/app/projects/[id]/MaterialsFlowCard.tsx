import Link from 'next/link';
import { Check } from 'lucide-react';
import styles from './materialsFlow.module.css';

/**
 * "Where am I / what next" for the materials path, shown on both the Procurement Benchmark and the Master Materials
 * List tabs. Sub-steps use letters, like the BOQ card, so they are not confused with numbered workflow stages.
 * Orientation only: each action is still checked by its own module.
 */
export type MaterialsFlowState = {
  benchmarkLines: number;
  benchmarkLocked: boolean;
  materials: number;
  materialsLocked: boolean;
  /** The project uses the newer reviewed-benchmark workflow (its own approval), not the lock buttons. */
  reviewed: boolean;
};

const STEPS = ['Upload the benchmark', 'Check and lock it', 'Generate the materials list', 'Lock the list for requests'];

export default function MaterialsFlowCard({ projectId, tab, state }: { projectId: string; tab: 'benchmark' | 'consolidation'; state: MaterialsFlowState }) {
  const done = [state.benchmarkLines > 0, state.benchmarkLocked || state.materials > 0, state.materials > 0, state.materialsLocked];
  const current = done.findIndex(value => !value);
  const benchmarkHref = `/projects/${projectId}?tab=benchmark`;
  const materialsHref = `/projects/${projectId}?tab=consolidation`;
  const next = current === 0
    ? { title: 'Upload the procurement benchmark', detail: 'The benchmark is the internal spending limit. It can be lower than the BOQ and contract value.', cta: tab === 'benchmark' ? null : { label: 'Open Procurement Benchmark', href: benchmarkHref } }
    : current === 1
      ? { title: 'Check the benchmark, then lock it', detail: 'Fix lines here: the materials list copies them. The AI Check finds amount mistakes, duplicates and lines with no BOQ item.', cta: tab === 'benchmark' ? { label: 'Go to lock', href: '#benchmark-actions' } : { label: 'Open Procurement Benchmark', href: benchmarkHref } }
      : current === 2
        ? { title: 'Generate the master materials list', detail: 'Every benchmark line is carried over. Identical materials with the same unit are combined into one row.', cta: tab === 'consolidation' ? { label: 'Go to generate', href: '#materials-generate' } : { label: 'Open Master Materials List', href: materialsHref } }
        : current === 3
          ? { title: 'Check the list, then lock it', detail: 'Locking the list lets the team raise material requests from it.', cta: tab === 'consolidation' ? { label: 'Go to lock', href: '#materials-actions' } : { label: 'Open Master Materials List', href: materialsHref } }
          : { title: 'Materials list is ready for requests', detail: 'Select materials in the list to raise a material request.', cta: tab === 'benchmark' ? { label: 'Open Master Materials List', href: materialsHref } : null };
  return <section className={styles.card} aria-label="Benchmark to materials list: progress and next step">
    <ol className={styles.steps}>
      {STEPS.map((label, index) => {
        const status = done[index] ? 'done' : index === current ? 'current' : 'todo';
        return <li key={label} className={styles[status]} aria-current={status === 'current' ? 'step' : undefined}>
          <span className={styles.marker} aria-hidden="true">{status === 'done' ? <Check size={14} strokeWidth={2.5} /> : String.fromCharCode(65 + index)}</span>
          <span>{String.fromCharCode(65 + index)}. {label}<span className="sr-only">{status === 'done' ? ' (done)' : status === 'current' ? ' (current step)' : ''}</span></span>
        </li>;
      })}
    </ol>
    <div className={styles.next}>
      <div className={styles.nextText}>
        {current >= 0 && <p className={styles.eyebrow}>Next · step {String.fromCharCode(65 + current)}</p>}
        <h2 className={styles.title}>{next.title}</h2>
        <p className={styles.detail}>{next.detail}{state.reviewed && current >= 1 && current <= 3 ? ' This project uses the reviewed-benchmark approval, so its own review screen controls approval.' : ''}</p>
      </div>
      {next.cta && (next.cta.href.startsWith('#')
        ? <a className={styles.cta} href={next.cta.href}>{next.cta.label} →</a>
        : <Link className={styles.cta} href={next.cta.href}>{next.cta.label} →</Link>)}
    </div>
  </section>;
}

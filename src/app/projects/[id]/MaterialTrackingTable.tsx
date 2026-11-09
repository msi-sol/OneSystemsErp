'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { materialQuantity, materialTotalCost } from '@/lib/procurement/material-values';
import type { MaterialTracking, TrackingEvent, TrackingStage } from '@/lib/procurement/material-tracking';

/**
 * Tracking view of the Master Materials List: for each material, how far procurement has gone (requested →
 * ordered → delivered → issued), what is on hand, and a drop-down with every movement (requests, canvass, POs,
 * deliveries, issuances, returns), newest first. Uses the table styles of ConsolidatedBOQViewer.
 */
export const STAGE: Record<TrackingStage, { label: string; color: string; background: string }> = {
  NOT_REQUESTED: { label: 'Not requested', color: '#475569', background: '#f1f5f9' },
  REQUESTED: { label: 'Requested', color: '#1d4ed8', background: '#dbeafe' },
  ORDERED: { label: 'Ordered', color: '#6d28d9', background: '#ede9fe' },
  PARTLY_DELIVERED: { label: 'Partly delivered', color: '#b45309', background: '#fef3c7' },
  IN_STOCK: { label: 'In stock', color: '#047857', background: '#d1fae5' },
  IN_USE: { label: 'In use · stock left', color: '#0f766e', background: '#ccfbf1' },
  ISSUED: { label: 'Fully issued', color: '#334155', background: '#e2e8f0' },
};
const KIND: Record<TrackingEvent['kind'], { label: string; color: string }> = {
  REQUEST: { label: 'Material request', color: '#1d4ed8' },
  CANVASS: { label: 'Canvass', color: '#7c3aed' },
  ORDER: { label: 'Purchase order', color: '#6d28d9' },
  DELIVERY: { label: 'Delivery', color: '#b45309' },
  ISSUANCE: { label: 'Issued to site', color: '#0f766e' },
  RETURN: { label: 'Return', color: '#475569' },
};
const qty = (value: number) => (value ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—');
const peso = (value: number) => `₱ ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value: string) => new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

type Item = { id: string; itemCode: string; description: string; unit: string; quantity: number; unitCost: number; totalCost: number; actualCost?: number; committedCost?: number; isVariationItem?: boolean; voAdditiveQty?: number; voDeductiveQty?: number; revisedQuantity?: number };

/**
 * A thin 0–100% bar with its figures written underneath (like the work-package completion bar). Over 100% (more
 * received than the procurement quantity, or more spent than the budget) the bar stays full but turns red and the
 * text says by how much, so an overrun is never hidden.
 */
function Bar({ percent, over, color, title, ariaLabel, children }: { percent: number; over: boolean; color: string; title: string; ariaLabel: string; children: React.ReactNode }) {
  const width = Math.min(100, Math.max(0, percent));
  return <div title={title}>
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={width} aria-label={ariaLabel}
      style={{ height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden' }}>
      <div style={{ width: `${width}%`, height: '100%', borderRadius: 999, background: over ? '#ef4444' : color, transition: 'width .3s' }} />
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', marginTop: 5, fontSize: '0.76rem', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{children}</div>
  </div>;
}
const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round(part / whole * 100) : part > 0 ? 100 : 0);
const num = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const short = (value: number) => `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const V = ({ children, color }: { children: React.ReactNode; color?: string }) => <strong style={{ color: color || '#0f172a' }}>{children}</strong>;

/**
 * Two separate bars per material. Quantity: received / procurement quantity (0/3 until anything is delivered).
 * Budget: spent or committed (delivered cost plus POs not yet delivered) against the item's budget, with the balance.
 */
function StockPills({ budget, budgetValue, spent, unit, track, label, color }: { budget: number; budgetValue: number; spent: number; unit: string; track?: MaterialTracking; label: string; color: string }) {
  const delivered = track?.delivered ?? 0, ordered = track?.ordered ?? 0;
  const qtyPercent = percentOf(delivered, budget);
  const qtyOver = delivered > budget + 1e-9;
  const orderedOver = ordered > budget + 1e-9;
  const moneyPercent = percentOf(spent, budgetValue);
  const moneyOver = spent > budgetValue + 0.005;
  const balance = budgetValue - spent;
  return <div style={{ display: 'grid', gap: 10 }}>
    <Bar percent={qtyPercent} over={qtyOver || orderedOver} color="#10b981"
      title={`Received ${num(delivered)} of ${num(budget)} ${unit} · ordered ${num(ordered)} · on hand ${num(track?.onHand ?? 0)}`}
      ariaLabel={`Received ${num(delivered)} of ${num(budget)} ${unit}`}>
      <span>Received: <V>{num(delivered)}/{num(budget)}</V> {unit}</span>
      {track?.awaiting ? <span style={{ color: '#b45309' }}>{track.awaiting} awaiting</span> : null}
      {qtyOver ? <V color="#b91c1c">Over by {num(delivered - budget)} {unit}</V> : orderedOver ? <V color="#b91c1c">Ordered over by {num(ordered - budget)} {unit}</V> : null}
    </Bar>
    <Bar percent={moneyPercent} over={moneyOver} color="#0ea5e9"
      title={`Spent or committed ${short(spent)} of ${short(budgetValue)} · balance ${short(balance)}`}
      ariaLabel={`Budget used ${short(spent)} of ${short(budgetValue)}`}>
      {moneyOver ? <V color="#b91c1c">Over budget by {short(-balance)}</V> : <span>Remaining Balance: <V>{short(balance)}</V></span>}
    </Bar>
  </div>;
}

export default function MaterialTrackingTable({ items, tracking, selectable, selected, onToggle, allSelected, onToggleAll, source }: {
  items: Item[];
  tracking: Record<string, MaterialTracking>;
  selectable: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  allSelected: boolean;
  onToggleAll: () => void;
  /** The existing "Source" chip for a material (benchmark lines / added here / VO). */
  source: (item: Item) => React.ReactNode;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) => setOpen(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const columns = selectable ? 5 : 4;

  return <table className="consolidation-table tracking-table">
    <thead>
      <tr>
        {selectable && <th style={{ textAlign: 'center', width: 40 }}><input type="checkbox" aria-label="Select all materials shown" checked={allSelected} onChange={onToggleAll} /></th>}
        <th style={{ whiteSpace: 'nowrap' }}>Item Code</th>
        <th>Material</th>
        <th style={{ minWidth: 380 }}>Received and budget balance</th>
        <th style={{ width: 90 }}><span className="sr-only">History</span></th>
      </tr>
    </thead>
    <tbody>
      {!items.length && <tr><td colSpan={columns} style={{ textAlign: 'center', color: '#666', padding: 24 }}>No materials match.</td></tr>}
      {items.map(item => {
        const track = tracking[item.id];
        const budget = materialQuantity(item as never);
        const stage = STAGE[track?.stage ?? 'NOT_REQUESTED'];
        const isOpen = open.has(item.id);
        return <Fragment key={item.id}>
          <tr className={isOpen ? 'tracking-open' : undefined} style={{ backgroundColor: selected.has(item.id) ? 'rgba(0, 255, 163, 0.05)' : undefined }}>
            {selectable && <td style={{ textAlign: 'center' }}><input type="checkbox" aria-label={`Select ${item.itemCode}`} checked={selected.has(item.id)} onChange={() => onToggle(item.id)} /></td>}
            <td className="nowrap" style={{ fontWeight: 'bold' }}>{item.itemCode}</td>
            <td className="description">
              <div>{item.description}</div>
              <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.75rem', color: '#64748b' }}>{source(item)}<span>{peso(item.unitCost)} / {item.unit}</span></div>
            </td>
            <td style={{ minWidth: 380 }}><StockPills budget={budget} budgetValue={materialTotalCost(item as never)} spent={Math.max(item.committedCost ?? 0, item.actualCost ?? 0)} unit={item.unit} track={track} label={stage.label} color={stage.color} /></td>
            <td style={{ textAlign: 'right' }}>
              <button type="button" onClick={() => toggleOpen(item.id)} aria-expanded={isOpen} aria-controls={`history-${item.id}`}
                style={{ border: '1px solid #cbd5e1', background: isOpen ? '#0f766e' : '#fff', color: isOpen ? '#fff' : '#0f172a', borderRadius: 6, padding: '4px 8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {isOpen ? '▾' : '▸'} History{track?.events.length ? ` (${track.events.length})` : ''}
              </button>
            </td>
          </tr>
          {isOpen && <tr id={`history-${item.id}`} className="tracking-history">
            <td colSpan={columns} style={{ background: '#f8fafc', padding: '12px 16px 16px 24px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: '0.8rem', color: '#334155', marginBottom: 6 }}>
                <span>Budget <strong>{qty(budget)} {item.unit}</strong></span>
                <span>Requested <strong>{qty(track?.requested ?? 0)}</strong></span>
                <span>Ordered <strong>{qty(track?.ordered ?? 0)}</strong></span>
                <span>Delivered <strong>{qty(track?.delivered ?? 0)}</strong></span>
                <span title="Released to site, minus what was returned to stock">Issued <strong>{qty(track?.issued ?? 0)}</strong></span>
                <span>On hand <strong style={{ color: '#047857' }}>{qty(track?.onHand ?? 0)}</strong></span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: '0.8rem', color: '#334155', marginBottom: 10 }}>
                <span>Budget value <strong>{peso(item.totalCost)}</strong></span>
                <span>Actual cost <strong>{peso(item.actualCost ?? 0)}</strong></span>
                {/* The committed counter keeps the full PO amount; what is delivered is already actual cost. */}
                <span>Open on POs <strong>{peso(Math.max(0, (item.committedCost ?? 0) - (item.actualCost ?? 0)))}</strong></span>
                <span>Still to order <strong>{qty(Math.max(0, budget - (track?.ordered ?? 0)))} {item.unit}</strong></span>
              </div>
              {!track?.events.length
                ? <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>No movements yet. Requests, purchase orders, deliveries and issuances of this material will appear here.</p>
                : <ol style={{ listStyle: 'none', margin: 0, padding: 0, borderLeft: '2px solid #cbd5e1' }}>
                  {track.events.map((event, index) => <li key={index} style={{ position: 'relative', padding: '6px 0 8px 16px', opacity: event.counted || event.kind === 'CANVASS' ? 1 : 0.6 }}>
                    <span aria-hidden="true" style={{ position: 'absolute', left: -6, top: 11, width: 10, height: 10, borderRadius: '50%', background: KIND[event.kind].color }} />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'baseline', fontSize: '0.84rem' }}>
                      <span style={{ color: '#64748b', minWidth: 92 }}>{day(event.date)}</span>
                      <strong style={{ color: KIND[event.kind].color }}>{KIND[event.kind].label}</strong>
                      {event.href ? <Link href={event.href} style={{ color: '#0f766e', fontWeight: 600 }}>{event.document}</Link> : <span>{event.document}</span>}
                      <span>{event.kind === 'RETURN' ? '+' : ''}{qty(event.quantity)} {item.unit}</span>
                      <span style={{ padding: '1px 7px', borderRadius: 10, background: '#e2e8f0', color: '#334155', fontSize: '0.72rem', textTransform: 'capitalize' }}>{event.status}</span>
                      {!event.counted && event.kind !== 'CANVASS' && <span style={{ fontSize: '0.72rem', color: '#64748b' }}>not counted in the totals</span>}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>{event.detail}</div>
                  </li>)}
                </ol>}
            </td>
          </tr>}
        </Fragment>;
      })}
    </tbody>
  </table>;
}

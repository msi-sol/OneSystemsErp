/**
 * Matching a DUPA (detailed unit price analysis) directly to approved BOQ items, and reconciling its amount with
 * them. Pure functions: no database, no AI. The DUPA does not have to follow the suggested work-package structure;
 * every approved BOQ item is a candidate, and the package is derived from the matched item.
 */

export type MatchableBoqItem = {
  id: string; itemCode: string; description: string; unit: string;
  quantity: number; unitCost: number; amount: number;
  /** Work packages this BOQ item is allocated to (may be empty or several). */
  packageIds: string[];
};

export type DupaForMatching = { title: string; titleLines: string[]; components: string[]; fileName: string };

export type BoqMatch = {
  status: 'matched' | 'ambiguous' | 'unmatched';
  /** Best candidates first; one when matched, two or more when ambiguous. */
  items: Array<{ id: string; score: number; reason: string }>;
};

const STOP = new Set(['the', 'and', 'for', 'with', 'of', 'to', 'in', 'on', 'a', 'an', 'dupa', 'unit', 'price', 'analysis', 'item', 'items', 'works', 'work',
  'example', 'source', 'adapted', 'xlsx', 'xls', 'pdf', 'docx', 'lot', 'per', 'no', 'pay', 'detailed', 'cost', 'total', 'sheet', 'rows', 'description']);
const words = (value: string) => new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(word => word.length > 2 && !STOP.has(word) && !/^\d+$/.test(word)));
const norm = (value: string) => ` ${value.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
const UNIT_ALIASES: Record<string, string> = { 'cu.m': 'm3', cum: 'm3', 'cu m': 'm3', m3: 'm3', 'sq.m': 'm2', sqm: 'm2', 'sq m': 'm2', m2: 'm2', kgs: 'kg', kg: 'kg', 'l.m': 'lm', lm: 'lm', m: 'm', pcs: 'pc', pc: 'pc', lot: 'lot', ls: 'lot', 'l.s': 'lot' };
export const normalizeUnit = (unit: string) => { const key = unit.toLowerCase().replace(/\s+/g, ' ').trim(); return UNIT_ALIASES[key] ?? UNIT_ALIASES[key.replace(/\./g, '')] ?? key.replace(/\./g, ''); };

/**
 * Scores every BOQ item against the DUPA title (item code first, then description words, then unit), with the
 * components as a weak tie-breaker. A unique strong candidate is "matched"; close candidates are "ambiguous" and
 * need a reviewer; nothing convincing is "unmatched".
 */
export function matchDupaToBoq(dupa: DupaForMatching, items: MatchableBoqItem[]): BoqMatch {
  const titleText = `${dupa.titleLines.join(' ')} ${dupa.title}`;
  const titleNorm = norm(`${titleText} ${dupa.fileName.replace(/\.[^.]+$/, '')}`);
  const titleWords = words(titleText);
  const componentWords = words(dupa.components.join(' '));
  const unitInTitle = new Set([...titleNorm.matchAll(/\b(cu\.?\s?m|cum|m3|sq\.?\s?m|sqm|m2|kgs?|l\.?m|lot|l\.?s|pcs?)\b/g)].map(found => normalizeUnit(found[1])));

  const scored = items.map(item => {
    const reasons: string[] = [];
    let score = 0;
    const code = item.itemCode.trim();
    // An item code like "B.1" or "803(1)a" written in the title is the strongest signal.
    if (code.length >= 2 && titleNorm.includes(norm(code))) { score += 10; reasons.push(`item code ${code}`); }
    const description = words(item.description);
    const shared = [...titleWords].filter(word => description.has(word));
    if (shared.length) {
      const coverage = shared.length / Math.max(1, description.size);
      score += shared.length * 2 + coverage * 4;
      reasons.push(`"${shared.slice(0, 3).join('", "')}" in the description`);
    }
    if (unitInTitle.size && unitInTitle.has(normalizeUnit(item.unit))) { score += 1; reasons.push(`unit ${item.unit}`); }
    score += [...componentWords].filter(word => description.has(word)).length * 0.25;
    return { id: item.id, score: Number(score.toFixed(2)), reason: reasons.join(', ') || 'similar components' };
  }).filter(entry => entry.score >= 3).sort((left, right) => right.score - left.score);

  if (!scored.length) return { status: 'unmatched', items: [] };
  const [best, second] = scored;
  // A clear winner: well ahead of the next candidate (or alone).
  if (!second || best.score >= second.score * 1.5 + 1) return { status: 'matched', items: [best] };
  return { status: 'ambiguous', items: scored.filter(entry => entry.score >= best.score * 0.66).slice(0, 5) };
}

export type DupaReconciliation = {
  /** extended = the DUPA total is the full item amount; per-unit = the DUPA prices one unit (or a reference volume). */
  basis: 'extended' | 'per-unit' | 'unclear';
  dupaTotal: number;
  /** What the DUPA amounts to for the linked items: the total itself, or total × BOQ quantity for a per-unit DUPA. */
  dupaAmount: number;
  boqAmount: number;
  difference: number;
  reconciles: boolean;
  note: string;
};

const close = (left: number, right: number) => Math.abs(left - right) <= Math.max(1, Math.abs(right) * 0.005);

/**
 * Compares a DUPA with the BOQ items it prices. A DUPA total equal to the items' amount is an extended breakdown; a
 * total equal to the unit cost (one linked item) is a per-unit breakdown and is extended by the BOQ quantity before
 * comparing. Nothing is changed: a difference is reported, never absorbed.
 */
/** The quantity a DUPA is priced for when its title says so, e.g. "Concrete DUPA 10 m³" → 10. */
export function referenceQuantityFromTitle(title: string): number | null {
  const found = /(\d+(?:[.,]\d+)?)\s*(?:cu\.?\s?m\b|m3\b|m³|sq\.?\s?m\b|m2\b|m²|kgs?\b|l\.?m\b|pcs?\b|units?\b)/i.exec(title);
  const value = found ? Number(found[1].replace(',', '.')) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function reconcileDupa(dupaTotal: number, linked: Array<Pick<MatchableBoqItem, 'quantity' | 'unitCost' | 'amount'>>, referenceQuantity: number | null = null): DupaReconciliation {
  const boqAmount = Number(linked.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
  const result = (basis: DupaReconciliation['basis'], dupaAmount: number, note: string): DupaReconciliation => {
    const difference = Number((dupaAmount - boqAmount).toFixed(2));
    return { basis, dupaTotal, dupaAmount: Number(dupaAmount.toFixed(2)), boqAmount, difference, reconciles: linked.length > 0 && close(dupaAmount, boqAmount), note };
  };
  if (!linked.length) return result('unclear', dupaTotal, 'Link the BOQ item this DUPA prices to compare amounts.');
  if (close(dupaTotal, boqAmount)) return result('extended', dupaTotal, 'The DUPA total equals the BOQ amount.');
  if (linked.length === 1) {
    const [item] = linked;
    if (item.unitCost > 0 && close(dupaTotal, item.unitCost)) {
      return result('per-unit', dupaTotal * item.quantity, `Priced per unit: ${dupaTotal.toFixed(2)} × ${item.quantity} BOQ quantity.`);
    }
    // A reference volume stated in the title (e.g. "DUPA for 10 m³"): the total covers that quantity, so its rate is
    // total ÷ reference quantity, extended by the BOQ quantity.
    if (referenceQuantity && referenceQuantity !== 1) {
      const rate = dupaTotal / referenceQuantity;
      return result('per-unit', rate * item.quantity, `Priced for ${referenceQuantity} units (${rate.toFixed(2)} each); extended by the BOQ quantity ${item.quantity}.`);
    }
  }
  return result('unclear', dupaTotal, 'The DUPA total matches neither the BOQ amount nor its unit cost. Check the DUPA or the linked items.');
}

export type CoverageSummary = {
  covered: Array<{ id: string; dupaAmount: number; boqAmount: number; difference: number; reconciles: boolean }>;
  missing: string[];
  discrepancies: number;
  boqTotal: number;
  dupaTotal: number;
};

/**
 * For a set of DUPAs (a partial or complete upload) against the BOQ items in scope: which items are covered, which
 * are missing, and where the amounts differ. A BOQ item linked by several DUPAs adds their amounts together.
 */
export function summarizeCoverage(dupas: Array<{ total: number; boqItemIds: string[]; referenceQuantity?: number | null }>, scope: MatchableBoqItem[]): CoverageSummary {
  const byId = new Map(scope.map(item => [item.id, item]));
  const amounts = new Map<string, number>();
  for (const dupa of dupas) {
    const linked = dupa.boqItemIds.map(id => byId.get(id)).filter((item): item is MatchableBoqItem => !!item);
    if (!linked.length) continue;
    const reconciliation = reconcileDupa(dupa.total, linked, dupa.referenceQuantity ?? null);
    // Spread a multi-item DUPA over its items in proportion to their BOQ amounts.
    const base = linked.reduce((sum, item) => sum + item.amount, 0);
    for (const item of linked) amounts.set(item.id, (amounts.get(item.id) ?? 0) + (base > 0 ? reconciliation.dupaAmount * item.amount / base : reconciliation.dupaAmount / linked.length));
  }
  const covered = [...amounts.entries()].map(([id, dupaAmount]) => {
    const item = byId.get(id)!;
    const difference = Number((dupaAmount - item.amount).toFixed(2));
    return { id, dupaAmount: Number(dupaAmount.toFixed(2)), boqAmount: item.amount, difference, reconciles: close(dupaAmount, item.amount) };
  });
  return {
    covered,
    missing: scope.filter(item => !amounts.has(item.id)).map(item => item.id),
    discrepancies: covered.filter(entry => !entry.reconciles).length,
    boqTotal: Number(scope.reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
    dupaTotal: Number(covered.reduce((sum, entry) => sum + entry.dupaAmount, 0).toFixed(2)),
  };
}

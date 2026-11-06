import Decimal from 'decimal.js';

export type SectionIdentity = { id: string; name: string; order: number };
type Line = { id: string; category?: string | null; totalCost: number | string };

// Names repeat in real workbooks. Keep source occurrences separate when lineage exists.
export function boqSections(lines: Line[], identities: Record<string, SectionIdentity> = {}) {
  const groups = new Map<string, { id: string; name: string; order: number; itemIds: string[]; amount: string }>();
  lines.forEach((line, index) => {
    const name = line.category?.trim() || 'General';
    const source = identities[line.id];
    const identity = source && source.name.trim() === name ? source : { id: `category:${name}`, name, order: lines.length + index };
    const group = groups.get(identity.id) ?? { ...identity, itemIds: [], amount: '0' };
    group.itemIds.push(line.id);
    group.amount = new Decimal(group.amount).plus(String(line.totalCost)).toString();
    groups.set(identity.id, group);
  });
  return [...groups.values()].sort((a, b) => a.order - b.order).map(group => ({ ...group, amount: new Decimal(group.amount).toFixed(2) }));
}

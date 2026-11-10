import { matchDupaToBoq, normalizeUnit, reconcileDupa, referenceQuantityFromTitle, summarizeCoverage, type MatchableBoqItem } from '@/lib/scheduling/dupa-boq-match';

const item = (id: string, itemCode: string, description: string, unit: string, quantity: number, unitCost: number, packageIds: string[] = []): MatchableBoqItem =>
  ({ id, itemCode, description, unit, quantity, unitCost, amount: Number((quantity * unitCost).toFixed(2)), packageIds });

const BOQ = [
  item('concrete', 'B.1', 'Structural concrete 4000 psi, footings', 'cu.m', 24.5, 9000, ['pkg-structure']),
  item('rebar', 'B.2', 'Reinforcing steel bars Grade 40', 'kg', 2000, 75, ['pkg-structure']),
  item('formworks', 'B.3', 'Formworks and scaffolding', 'sq.m', 120, 650, ['pkg-structure']),
  item('wire', 'C.1', 'THHN wire 3.5 mm2', 'm', 1200, 38, ['pkg-electrical']),
  item('panel', 'C.2', 'Panel board 12 branches with breakers', 'set', 2, 18500, ['pkg-electrical']),
];
const dupa = (title: string, components: string[] = []) => ({ title, titleLines: [title], components, fileName: 'dupas.xlsx' });

describe('matchDupaToBoq', () => {
  it('matches by item code written in the title', () => {
    const result = matchDupaToBoq(dupa('Item B.2 - Rebar works'), BOQ);
    expect(result.status).toBe('matched');
    expect(result.items[0]).toMatchObject({ id: 'rebar' });
    expect(result.items[0].reason).toContain('item code B.2');
  });

  it('matches by description and unit when there is no item code', () => {
    const result = matchDupaToBoq(dupa('Structural concrete footings per cu.m', ['Portland cement', 'Sand', 'Gravel']), BOQ);
    expect(result).toMatchObject({ status: 'matched', items: [{ id: 'concrete' }] });
  });

  it('marks close candidates as ambiguous for review', () => {
    const items = [item('a', 'X.1', 'Concrete pavement 150 mm', 'sq.m', 100, 900), item('b', 'X.2', 'Concrete pavement 200 mm', 'sq.m', 100, 1100)];
    const result = matchDupaToBoq(dupa('Concrete pavement'), items);
    expect(result.status).toBe('ambiguous');
    expect(result.items.map(entry => entry.id).sort()).toEqual(['a', 'b']);
  });

  it('leaves an unrelated DUPA unmatched', () => {
    expect(matchDupaToBoq(dupa('Landscaping and planting', ['Bermuda grass', 'Topsoil']), BOQ)).toEqual({ status: 'unmatched', items: [] });
  });

  it('normalizes common unit spellings', () => {
    expect(normalizeUnit('cu.m')).toBe('m3');
    expect(normalizeUnit('SQ.M')).toBe('m2');
    expect(normalizeUnit('kgs')).toBe('kg');
  });
});

describe('reconcileDupa', () => {
  const concrete = BOQ[0];

  it('treats a DUPA equal to the item amount as an extended breakdown', () => {
    expect(reconcileDupa(220500, [concrete])).toMatchObject({ basis: 'extended', reconciles: true, difference: 0 });
  });

  it('extends a per-unit DUPA by the BOQ quantity before comparing', () => {
    const result = reconcileDupa(9000, [concrete]);
    expect(result).toMatchObject({ basis: 'per-unit', dupaAmount: 220500, boqAmount: 220500, reconciles: true });
  });

  it('recognizes a reference-volume DUPA when its title states the volume (e.g. 10 m³)', () => {
    expect(referenceQuantityFromTitle('Concrete DUPA 10 m³ example')).toBe(10);
    expect(reconcileDupa(90000, [concrete], 10)).toMatchObject({ basis: 'per-unit', dupaAmount: 220500, reconciles: true });
    // Without a stated volume, a multiple of the unit cost is not guessed to be per-unit.
    expect(reconcileDupa(90000, [concrete])).toMatchObject({ basis: 'unclear', reconciles: false });
  });

  it('reports a reference-volume DUPA that does not reconcile', () => {
    expect(reconcileDupa(80000, [concrete], 10)).toMatchObject({ basis: 'per-unit', dupaAmount: 196000, difference: -24500, reconciles: false });
  });

  it('reports a real difference without changing either amount', () => {
    const result = reconcileDupa(200000, [concrete]);
    expect(result).toMatchObject({ basis: 'unclear', dupaAmount: 200000, boqAmount: 220500, difference: -20500, reconciles: false });
  });

  it('cannot reconcile without a linked BOQ item', () => {
    expect(reconcileDupa(1000, [])).toMatchObject({ basis: 'unclear', reconciles: false });
  });
});

describe('summarizeCoverage', () => {
  it('lists covered and missing items and counts discrepancies for a partial upload', () => {
    const structure = BOQ.filter(entry => entry.packageIds.includes('pkg-structure'));
    const summary = summarizeCoverage([
      { total: 9000, boqItemIds: ['concrete'] },        // per-unit, reconciles
      { total: 140000, boqItemIds: ['rebar'] },         // 150,000 expected: differs
    ], structure);
    expect(summary.covered.map(entry => entry.id).sort()).toEqual(['concrete', 'rebar']);
    expect(summary.missing).toEqual(['formworks']);
    expect(summary.discrepancies).toBe(1);
    expect(summary.covered.find(entry => entry.id === 'rebar')).toMatchObject({ dupaAmount: 140000, boqAmount: 150000, difference: -10000, reconciles: false });
  });

  it('adds several DUPAs for the same BOQ item together', () => {
    const summary = summarizeCoverage([{ total: 75000, boqItemIds: ['rebar'] }, { total: 75000, boqItemIds: ['rebar'] }], [BOQ[1]]);
    expect(summary.covered[0]).toMatchObject({ dupaAmount: 150000, reconciles: true });
    expect(summary.missing).toEqual([]);
  });
});

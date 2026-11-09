/**
 * Supplier quotations compared with the approved procurement benchmark (meeting minutes: "compare prices with the
 * procurement benchmark; quotes may be above or below budget"). Display only: the approval rule for an over-budget
 * quote has not been decided, so nothing here blocks a quotation.
 */
export type BenchmarkMaterial = { unitCost?: number | null; revisedBenchmarkUnitCost?: number | null };
export type ComparedCanvassItem = { id: string; quantityRequired: number; consolidatedBoqItem: BenchmarkMaterial & { description?: string; unit?: string } };
export type ComparedQuoteItem = { canvassItemId: string; unitCost: number; quantityAvailable?: number | null };

/**
 * The rate the benchmark allows for a material: the revised rate after variations, else the approved rate.
 * The revised rate column defaults to 0 (not null) when it was never set, as with master materials generated from
 * the Procurement Benchmark tab, so 0 means "not revised" and falls back to the approved rate.
 */
export function benchmarkRate(material: BenchmarkMaterial): number | null {
  const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
  if (valid(material.revisedBenchmarkUnitCost)) return material.revisedBenchmarkUnitCost;
  return valid(material.unitCost) ? material.unitCost : null;
}

const cents = (value: number) => Math.round(value * 100) / 100;

export function compareQuoteToBenchmark(items: ComparedCanvassItem[], quoteItems: ComparedQuoteItem[]) {
  const lines = items.flatMap((item) => {
    const quoted = quoteItems.find((line) => line.canvassItemId === item.id);
    const quantity = Number(quoted?.quantityAvailable ?? item.quantityRequired);
    const rate = benchmarkRate(item.consolidatedBoqItem);
    if (!quoted || !(quantity > 0) || rate === null || !Number.isFinite(Number(quoted.unitCost))) return [];
    const quotedAmount = cents(quantity * Number(quoted.unitCost));
    const benchmarkAmount = cents(quantity * rate);
    const difference = cents(quotedAmount - benchmarkAmount);
    return [{ canvassItemId: item.id, description: item.consolidatedBoqItem.description ?? '', unit: item.consolidatedBoqItem.unit ?? '',
      quantity, quotedRate: Number(quoted.unitCost), benchmarkRate: rate, quotedAmount, benchmarkAmount, difference,
      percent: benchmarkAmount > 0 ? (difference / benchmarkAmount) * 100 : 0, overBudget: difference > 0 }];
  });
  const quotedTotal = cents(lines.reduce((sum, line) => sum + line.quotedAmount, 0));
  const benchmarkTotal = cents(lines.reduce((sum, line) => sum + line.benchmarkAmount, 0));
  const difference = cents(quotedTotal - benchmarkTotal);
  return { lines, quotedTotal, benchmarkTotal, difference, percent: benchmarkTotal > 0 ? (difference / benchmarkTotal) * 100 : 0,
    overBudget: difference > 0, overBudgetLines: lines.filter((line) => line.overBudget) };
}

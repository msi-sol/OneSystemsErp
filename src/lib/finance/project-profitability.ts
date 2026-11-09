/**
 * Project profitability figures (Profitability Center). Pure: the caller loads the rows.
 *
 * - Open commitments: an approved PO commits its amount; once a delivery posts the actual cost of that material,
 *   the same amount is no longer "committed". Older data never reduced the commitment on delivery, so the open
 *   amount is recomputed here (approved minus delivered cost, oldest commitment first) and never exceeds what the
 *   ledger still shows as remaining. Actual + committed therefore never counts a delivery twice.
 * - Purchase savings: only what has been ordered can show a saving: the benchmark rate × ordered quantity, minus
 *   what the PO pays. The unspent budget is reported separately as "budget left", not as savings.
 * - BOQ-level cost: material costs reach a BOQ item through the master material's benchmark lines and their BOQ
 *   links (split by each line's benchmark amount). Costs with no BOQ link are reported as unlinked, so totals match.
 */
export type ProfitabilityInput = {
  awardedItems: Array<{ id: string; itemCode: string | null; description: string; totalCost: number }>;
  /** Master materials list (target cost), with the BOQ links of the benchmark lines each material came from. */
  materials: Array<{ id: string; totalCost: number; unitCost: number; links: Array<{ awardedBoqItemId: string | null; weight: number }> }>;
  /** Used as the target when no master materials list exists yet. */
  benchmarkTotal: number;
  costs: Array<{ netAmount: number; costCategory: string | null; consolidatedBoqItemId: string | null; awardedBoqItemId: string | null }>;
  commitments: Array<{ approvedAmount: number; remainingCommitment: number; commitmentType: string; consolidatedBoqItemId: string | null; awardedBoqItemId: string | null; createdAt: Date | string }>;
  /** Lines of purchase orders that are approved or further along (not draft, under review, cancelled or rejected). */
  orderedLines: Array<{ consolidatedBoqItemId: string; quantity: number; unitCost: number }>;
};

const round = (value: number) => Math.round(value * 100) / 100;

export function computeProfitability(input: ProfitabilityInput) {
  const materialsById = new Map(input.materials.map(material => [material.id, material]));
  const contractRevenue = round(input.awardedItems.reduce((sum, item) => sum + item.totalCost, 0));
  const targetExecutionCost = round(input.materials.length ? input.materials.reduce((sum, item) => sum + item.totalCost, 0) : input.benchmarkTotal);
  const actualCostIncurred = round(input.costs.reduce((sum, entry) => sum + entry.netAmount, 0));

  // Delivered material cost per master material, consumed by that material's PO commitments oldest first.
  const delivered = new Map<string, number>();
  for (const entry of input.costs) {
    if (entry.consolidatedBoqItemId && entry.costCategory === 'MATERIALS') delivered.set(entry.consolidatedBoqItemId, (delivered.get(entry.consolidatedBoqItemId) || 0) + entry.netAmount);
  }
  const openCommitments = [...input.commitments]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(entry => {
      if (entry.commitmentType !== 'PURCHASE_ORDER' || !entry.consolidatedBoqItemId) return { entry, open: Math.max(0, entry.remainingCommitment) };
      const available = delivered.get(entry.consolidatedBoqItemId) || 0;
      const consumed = Math.min(entry.approvedAmount, available);
      delivered.set(entry.consolidatedBoqItemId, available - consumed);
      return { entry, open: Math.max(0, Math.min(entry.remainingCommitment, entry.approvedAmount - consumed)) };
    });
  const committedCost = round(openCommitments.reduce((sum, row) => sum + row.open, 0));
  const totalExecutionCost = round(actualCostIncurred + committedCost);
  const budgetLeft = round(targetExecutionCost - totalExecutionCost);
  const isOverrun = totalExecutionCost > targetExecutionCost + 0.005;

  // Savings on what has been ordered, at the master material's (benchmark) rate.
  let orderedAmount = 0, budgetForOrdered = 0, orderedLineCount = 0;
  for (const line of input.orderedLines) {
    const material = materialsById.get(line.consolidatedBoqItemId);
    if (!material) continue;
    orderedAmount += line.quantity * line.unitCost;
    budgetForOrdered += line.quantity * material.unitCost;
    orderedLineCount += 1;
  }
  const purchaseSavings = { orderedAmount: round(orderedAmount), budgetForOrdered: round(budgetForOrdered), savings: round(budgetForOrdered - orderedAmount), lines: orderedLineCount };

  // Execution cost per BOQ item.
  const perBoq = new Map<string, number>();
  let unlinkedCost = 0;
  const assign = (amount: number, consolidatedBoqItemId: string | null, awardedBoqItemId: string | null) => {
    if (!amount) return;
    if (awardedBoqItemId) { perBoq.set(awardedBoqItemId, (perBoq.get(awardedBoqItemId) || 0) + amount); return; }
    const material = consolidatedBoqItemId ? materialsById.get(consolidatedBoqItemId) : undefined;
    const linked = material?.links.filter(link => link.awardedBoqItemId) ?? [];
    const totalWeight = material?.links.reduce((sum, link) => sum + Math.max(0, link.weight), 0) ?? 0;
    if (!material || !linked.length || totalWeight <= 0) { unlinkedCost += amount; return; }
    let shared = 0;
    for (const link of linked) {
      const part = amount * Math.max(0, link.weight) / totalWeight;
      perBoq.set(link.awardedBoqItemId!, (perBoq.get(link.awardedBoqItemId!) || 0) + part);
      shared += part;
    }
    unlinkedCost += amount - shared; // benchmark lines of this material that have no BOQ link
  };
  for (const entry of input.costs) assign(entry.netAmount, entry.consolidatedBoqItemId, entry.awardedBoqItemId);
  for (const { entry, open } of openCommitments) assign(open, entry.consolidatedBoqItemId, entry.awardedBoqItemId);

  const boqLevelDetails = input.awardedItems.map(item => {
    const cost = round(perBoq.get(item.id) || 0);
    return {
      id: item.id, itemCode: item.itemCode, description: item.description, awardedAmount: item.totalCost,
      actualCost: cost, variance: round(item.totalCost - cost),
      status: cost === 0 ? 'NOT_STARTED' as const : cost > item.totalCost + 0.005 ? 'OVERRUN' as const : 'WITHIN_CONTRACT' as const,
    };
  });

  const targetProfit = round(contractRevenue - targetExecutionCost);
  const realizedProfit = round(contractRevenue - actualCostIncurred);
  return {
    contractRevenue, targetExecutionCost, actualCostIncurred, committedCost, totalExecutionCost, budgetLeft, isOverrun,
    targetProfit, targetProfitMargin: contractRevenue > 0 ? targetProfit / contractRevenue * 100 : 0,
    executionVariance: round(targetExecutionCost - actualCostIncurred),
    realizedProfit, realizedProfitMargin: contractRevenue > 0 ? realizedProfit / contractRevenue * 100 : 0,
    purchaseSavings, boqLevelDetails, unlinkedCost: round(unlinkedCost),
    // Kept for older readers: the budget left (it used to be labelled "value engineering savings").
    veSavings: budgetLeft,
  };
}

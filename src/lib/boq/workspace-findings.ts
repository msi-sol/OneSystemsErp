import { Prisma } from '@prisma/client';
import type { BOQFinding } from './review-state';
import type { WorkspaceItem } from './workspace-types';

function cents(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(String(value)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).mul(100);
}

function finding(input: Omit<BOQFinding, 'status' | 'reason' | 'decidedBy' | 'decidedAt'>): BOQFinding {
  return { ...input, status: 'OPEN', reason: null, decidedBy: null, decidedAt: null };
}

/** Source-faithful deterministic findings from an accepted workbook reading. */
export function buildWorkspaceBOQFindings(
  items: readonly WorkspaceItem[],
  input: { printedTotal?: string | null; itemIdsBySourceRow?: Readonly<Record<number, string>>; sheetName?: string | null },
): BOQFinding[] {
  const observations: BOQFinding[] = [];
  const asReadValue = items.reduce((sum, item) => sum.plus(String(item.amount)), new Prisma.Decimal(0));

  for (const item of items) {
    const itemId = input.itemIdsBySourceRow?.[item.sourceRowNumber] ?? null;
    if (item.quantityDefaulted) observations.push(finding({
      id: `quantity-defaulted-${item.sourceRowNumber}`,
      code: 'QUANTITY_DEFAULTED', field: 'quantity', itemId, rowNumber: item.sourceRowNumber,
      message: `No quantity was found for this BOQ row. The imported quantity is ${String(item.quantity)} and needs confirmation.`,
      severity: 'BLOCKING', evidence: { sheetName: input.sheetName ?? null, rowNumber: item.sourceRowNumber, assumedQuantity: String(item.quantity) },
    }));
    if (item.unitDefaulted) observations.push(finding({
      id: `unit-defaulted-${item.sourceRowNumber}`,
      code: 'UNIT_DEFAULTED', field: 'unit', itemId, rowNumber: item.sourceRowNumber,
      message: `No unit was found for this BOQ row. The imported unit is '${item.unit}' and needs confirmation.`,
      severity: 'BLOCKING', evidence: { sheetName: input.sheetName ?? null, rowNumber: item.sourceRowNumber, assumedUnit: item.unit },
    }));
    const identifierIsOnlyGap = item.itemCodeSynthesized && !item.quantityDefaulted && !item.unitDefaulted && !item.rateDerived;
    if (item.rateDerived && !item.quantityDefaulted && !item.unitDefaulted && !identifierIsOnlyGap && item.sourceUnitCost === null) observations.push(finding({
      id: `low-confidence-${item.sourceRowNumber}`,
      code: 'LOW_CONFIDENCE', field: 'source reading', itemId, rowNumber: item.sourceRowNumber,
      message: 'Parts of this row were hard to read with certainty. Compare it against the source row, then correct it or confirm it as it stands.',
      severity: 'ATTENTION', evidence: { sheetName: input.sheetName ?? null, rowNumber: item.sourceRowNumber },
    }));
    const tolerance = new Prisma.Decimal(String(Math.abs(item.quantity)))
      .mul('0.00005')
      .plus(new Prisma.Decimal(String(Math.abs(item.unitCost))).mul('0.00005'))
      .plus('0.01');
    const arithmeticDifference = new Prisma.Decimal(String(item.quantity)).mul(String(item.unitCost)).minus(String(item.amount)).abs();
    if (arithmeticDifference.gt(tolerance)) observations.push(finding({
      id: `amount-arithmetic-${item.sourceRowNumber}`,
      code: 'AMOUNT_ARITHMETIC', field: 'amount', itemId, rowNumber: item.sourceRowNumber,
      message: `This row's amount is ${new Prisma.Decimal(String(item.amount)).toFixed(2)}, but quantity × used unit rate is ${new Prisma.Decimal(String(item.quantity)).mul(String(item.unitCost)).toFixed(2)}.`,
      severity: 'BLOCKING', evidence: { sheetName: input.sheetName ?? null, rowNumber: item.sourceRowNumber, recordedAmount: String(item.amount), computedAmount: new Prisma.Decimal(String(item.quantity)).mul(String(item.unitCost)).toString() },
    }));
  }

  const statedRateDifferences = items.filter(item => item.rateDerived && item.sourceUnitCost !== null);
  if (statedRateDifferences.length) observations.push(finding({
    id: 'stated-rate-not-amount-rate', code: 'STATED_RATE_NOT_AMOUNT_RATE', field: 'unitCost', itemId: null, rowNumber: null,
    message: `On ${statedRateDifferences.length} BOQ row${statedRateDifferences.length === 1 ? '' : 's'}, the stated unit rate does not reproduce the workbook amount. The amount was preserved and the used rate was derived; review the source rate.`,
    severity: 'ATTENTION', evidence: { sheetName: input.sheetName ?? null, rowCount: statedRateDifferences.length, exampleRows: statedRateDifferences.slice(0, 5).map(item => ({ rowNumber: item.sourceRowNumber, statedRate: String(item.sourceUnitCost), usedRate: String(item.unitCost), amount: String(item.amount) })) },
  }));

  if (input.printedTotal !== null && input.printedTotal !== undefined) {
    const printedCents = cents(input.printedTotal);
    const readCents = cents(asReadValue.toString());
    const differenceCents = printedCents.minus(readCents);
    // Each line amount is read at the centavos Excel shows, while a printed SUM adds the unrounded values: that can
    // drift by up to half a centavo per line. Within that range it is rounding, not a missing or wrong line.
    const roundingOnly = differenceCents.abs().lte(Math.max(1, Math.ceil(items.length / 2)));
    if (differenceCents.abs().gt(1)) observations.push(finding({
      id: 'printed-total-differs', code: 'PRINTED_TOTAL_DIFFERS', field: 'printedTotal', itemId: null, rowNumber: null,
      message: roundingOnly
        ? `The workbook prints a total of ${new Prisma.Decimal(input.printedTotal).toFixed(2)}; the BOQ items add up to ${asReadValue.toFixed(2)}. The ${new Prisma.Decimal(differenceCents.abs().toString()).div(100).toFixed(2)} difference is rounding: each line is read at the centavos shown in Excel.`
        : `The workbook prints a total of ${new Prisma.Decimal(input.printedTotal).toFixed(2)}, but the BOQ items add up to ${asReadValue.toFixed(2)}.`,
      severity: roundingOnly ? 'ATTENTION' : 'BLOCKING', evidence: { printedTotal: new Prisma.Decimal(input.printedTotal).toFixed(2), asReadValue: asReadValue.toFixed(2), differenceCents: differenceCents.toString(), sheetName: input.sheetName ?? null },
    }));
  }
  return observations;
}

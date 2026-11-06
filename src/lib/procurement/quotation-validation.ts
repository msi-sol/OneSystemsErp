export type CanvassLine = { id: string; quantityRequired: number };

export type QuotationLineInput = {
  canvassItemId?: unknown;
  unitCost?: unknown;
  quantityAvailable?: unknown;
  brand?: unknown;
  remarks?: unknown;
};

export type ValidatedQuotationLine = {
  canvassItemId: string;
  unitCost: number;
  quantityAvailable: number;
  totalCost: number;
  brand?: string;
  remarks?: string;
};

export type QuotationCoverageLine = {
  canvassItemId: string;
  quantityAvailable: unknown;
  unitCost: unknown;
};

export function validateQuotationLines(input: unknown, canvassLines: CanvassLine[]): ValidatedQuotationLine[] {
  if (!Array.isArray(input) || input.length === 0 || canvassLines.length === 0) {
    throw new Error('A quotation must include at least one canvassed item.');
  }

  const expectedById = new Map(canvassLines.map(line => [line.id, line]));
  const seen = new Set<string>();
  if (expectedById.size !== canvassLines.length || input.length !== expectedById.size) {
    throw new Error('The quotation must contain each canvassed item exactly once.');
  }

  const normalized = input.map((value: QuotationLineInput) => {
    if (!value || typeof value !== 'object' || typeof value.canvassItemId !== 'string') {
      throw new Error('A quotation line has an invalid canvassed item.');
    }

    const canvassItemId = value.canvassItemId;
    const canvassLine = expectedById.get(canvassItemId);
    if (!canvassLine || seen.has(canvassItemId)) {
      throw new Error('Quotation lines must reference unique items from this canvass.');
    }
    seen.add(canvassItemId);

    const quantityAvailable = value.quantityAvailable;
    if (typeof quantityAvailable !== 'number' || !Number.isFinite(quantityAvailable) ||
        quantityAvailable < 0 || quantityAvailable > canvassLine.quantityRequired) {
      throw new Error(`Available quantity for canvassed item ${canvassItemId} must be between 0 and the requested quantity.`);
    }

    let unitCost = value.unitCost;
    if (quantityAvailable === 0 && (unitCost === undefined || unitCost === null || unitCost === '')) {
      unitCost = 0;
    }
    if (typeof unitCost !== 'number' || !Number.isFinite(unitCost) ||
        (quantityAvailable > 0 && unitCost <= 0) || (quantityAvailable === 0 && unitCost < 0)) {
      throw new Error(`Enter a finite positive unit cost for available item ${canvassItemId}.`);
    }

    const totalCost = unitCost * quantityAvailable;
    if (!Number.isFinite(totalCost)) throw new Error('The quotation total is outside the supported numeric range.');

    return {
      canvassItemId,
      unitCost,
      quantityAvailable,
      totalCost,
      ...(typeof value.brand === 'string' ? { brand: value.brand } : {}),
      ...(typeof value.remarks === 'string' ? { remarks: value.remarks } : {}),
    };
  });

  if (seen.size !== expectedById.size) throw new Error('The quotation must include every canvassed item.');
  if (!normalized.some(line => line.quantityAvailable > 0) || normalized.reduce((total, line) => total + line.totalCost, 0) <= 0) {
    throw new Error('A quotation must include at least one available item with a positive price.');
  }

  return normalized;
}

export function getMinimumPositiveQuotationTotal(totals: unknown[]): number {
  if (totals.length === 0) throw new Error('No quotations found to compare.');
  const prices = totals.map(total => typeof total === 'number' ? total : Number(total));
  if (prices.some(price => !Number.isFinite(price) || price <= 0)) {
    throw new Error('Cannot compare quotations with missing, zero, or invalid totals. Correct the quotation prices and try again.');
  }
  return Math.min(...prices);
}

export function isFullQuotationCoverage(requirements: CanvassLine[], quoteLines: QuotationCoverageLine[]): boolean {
  if (requirements.length === 0 || quoteLines.length !== requirements.length) return false;
  const requiredById = new Map(requirements.map(item => [item.id, Number(item.quantityRequired)]));
  if (requiredById.size !== requirements.length) return false;

  const availableById = new Map<string, number>();
  for (const line of quoteLines) {
    const required = requiredById.get(line.canvassItemId);
    const available = Number(line.quantityAvailable);
    if (required === undefined || availableById.has(line.canvassItemId) ||
        !Number.isFinite(required) || required < 0 || !Number.isFinite(available) || available < required) {
      return false;
    }
    availableById.set(line.canvassItemId, available);
  }
  return availableById.size === requiredById.size;
}

export function getComparableQuotationTotal(requirements: CanvassLine[], quoteLines: QuotationCoverageLine[]): number | null {
  if (!isFullQuotationCoverage(requirements, quoteLines)) return null;
  const linesById = new Map(quoteLines.map(line => [line.canvassItemId, line]));
  let total = 0;
  for (const requirement of requirements) {
    const quantity = Number(requirement.quantityRequired);
    const unitCost = Number(linesById.get(requirement.id)?.unitCost);
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      throw new Error(`A fully covering quotation has an invalid unit cost for item ${requirement.id}.`);
    }
    total += quantity * unitCost;
    if (!Number.isFinite(total)) throw new Error('A comparable quotation total is outside the supported numeric range.');
  }
  if (total <= 0) throw new Error('A comparable quotation total must be positive.');
  return total;
}

export function splitTaxInclusiveAmount(totalAmount: number, isVatable: boolean): { netAmount: number; vatAmount: number } {
  if (!Number.isFinite(totalAmount) || totalAmount < 0) throw new Error('A finite nonnegative PO total is required.');
  if (!isVatable) return { netAmount: totalAmount, vatAmount: 0 };
  const netAmount = totalAmount / 1.12;
  return { netAmount, vatAmount: totalAmount - netAmount };
}

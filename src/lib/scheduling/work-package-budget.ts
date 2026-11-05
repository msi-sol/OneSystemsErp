export type BudgetSplit = {
  materials: number;
  labor: number;
  equipment: number;
  ratios: {
    materials: number;
    labor: number;
    equipment: number;
  };
};

/**
 * Initial direct-cost planning profile for Philippine public-works demos.
 *
 * This deliberately produces a cost target below the BOQ/contract value. It is
 * not a supplier quotation, a wage determination, or a substitute for the
 * location-specific DPWH Construction Materials Price Data (CMPD).
 */
export const PH_PUBLIC_WORKS_PLANNING_PROFILE = {
  name: "Philippine public-works direct-cost plan",
  priceReference: "Refresh against regional CMPD, supplier quotations, payroll, and equipment rates before approval.",
  sources: [
    "DPWH CMPD process (Department Order No. 125, s. 2025)",
    "PSA Construction Materials Wholesale Price Index, June 2026",
  ],
} as const;

function scopeProfile(name: string) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("general") || lowerName.includes("mobilization")) {
    return { directCostFactor: 0.72, ratios: { materials: 0.28, labor: 0.42, equipment: 0.3 } };
  }
  if (lowerName.includes("electrical") || lowerName.includes("mechanical")) {
    return { directCostFactor: 0.82, ratios: { materials: 0.62, labor: 0.28, equipment: 0.1 } };
  }
  if (lowerName.includes("canal") || lowerName.includes("drainage")) {
    return { directCostFactor: 0.84, ratios: { materials: 0.48, labor: 0.32, equipment: 0.2 } };
  }
  if (
    lowerName.includes("pavement") ||
    lowerName.includes("concrete") ||
    lowerName.includes("structural")
  ) {
    return { directCostFactor: 0.86, ratios: { materials: 0.55, labor: 0.3, equipment: 0.15 } };
  }
  return { directCostFactor: 0.84, ratios: { materials: 0.55, labor: 0.3, equipment: 0.15 } };
}

export function estimatePhPublicWorksBudget(
  boqOrContractValue: number,
  workPackageName: string,
): BudgetSplit {
  const profile = scopeProfile(workPackageName);
  const directCost = boqOrContractValue * profile.directCostFactor;

  return {
    materials: directCost * profile.ratios.materials,
    labor: directCost * profile.ratios.labor,
    equipment: directCost * profile.ratios.equipment,
    ratios: profile.ratios,
  };
}

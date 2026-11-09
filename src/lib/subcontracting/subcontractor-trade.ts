/** A subcontractor's trade, stored in `specialization` (JSON: a list of trades, or one string). */
export function subcontractorTrade(subcontractor: { specialization?: unknown } | null | undefined): string {
  const value = subcontractor?.specialization;
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).join(', ');
  return typeof value === 'string' ? value.trim() : '';
}

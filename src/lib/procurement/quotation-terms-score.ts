/**
 * Scores a quotation's delivery period and payment terms for the canvass comparison (each 20% of the score).
 *
 * The old scoring only matched exact phrases such as "7 Days" or "COD", so the payment options the app itself offers
 * ("PDC 30", "CASH ON DELIVERY", "BANK TRANSFER") and free text such as "2 weeks" all scored as unknown (50).
 * This reads the number of days instead. Missing or unreadable terms stay neutral (50).
 */
export const NEUTRAL_TERMS_SCORE = 50;

/** Days stated in the text: "7 days", "2 weeks", "1 month", "PDC 30", or a bare number. Null when none. */
export function termDays(text: string): number | null {
  const lower = text.toLowerCase();
  const unit = lower.match(/(\d+(?:\.\d+)?)\s*(working days?|calendar days?|days?|d\b|weeks?|wks?|months?|mos?\b)/);
  if (unit) {
    const value = Number(unit[1]);
    if (/^w/.test(unit[2])) return value * 7;
    if (/^mo/.test(unit[2])) return value * 30;
    return value;
  }
  const bare = lower.match(/(\d+(?:\.\d+)?)/);
  return bare ? Number(bare[1]) : null;
}

/** Faster delivery scores higher. */
export function deliveryScore(deliveryPeriod: string | null | undefined): number {
  const text = (deliveryPeriod || '').trim();
  if (!text) return NEUTRAL_TERMS_SCORE;
  if (/on[\s-]?hand|in[\s-]?stock|stock on hand|immediate|same[\s-]?day|ready/i.test(text)) return 100;
  const days = termDays(text);
  if (days === null) return NEUTRAL_TERMS_SCORE;
  if (days <= 3) return 100;
  if (days <= 7) return 90;
  if (days <= 14) return 80;
  if (days <= 30) return 60;
  if (days <= 45) return 40;
  return 30;
}

/** Longer credit scores higher; paying in advance scores lowest; paying on delivery is neutral. */
export function paymentScore(paymentTerms: string | null | undefined): number {
  const text = (paymentTerms || '').trim();
  if (!text) return NEUTRAL_TERMS_SCORE;
  if (/advance|prepaid|pre-paid|full payment|100%\s*(down|before)/i.test(text)) return 30;
  if (/\d+\s*%/.test(text) && /down|dp\b|deposit/i.test(text)) return 40;
  const days = /pdc|post[\s-]?dated|credit|net|terms?|days?|weeks?|months?/i.test(text) ? termDays(text) : null;
  if (days !== null && days > 0) {
    if (days >= 60) return 100;
    if (days >= 45) return 95;
    if (days >= 30) return 90;
    if (days >= 15) return 80;
    return 65;
  }
  if (/cod\b|cash on delivery|on delivery|cash|gcash|bank transfer|dated check/i.test(text)) return 50;
  return NEUTRAL_TERMS_SCORE;
}

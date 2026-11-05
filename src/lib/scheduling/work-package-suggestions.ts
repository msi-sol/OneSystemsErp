export function packageDurationDays(name: string, weight: number) {
  const lowerName = name.toLowerCase();
  const base =
    lowerName.includes("structural") || lowerName.includes("pavement")
      ? 28
      : lowerName.includes("electrical") || lowerName.includes("mechanical")
        ? 18
        : lowerName.includes("canal") || lowerName.includes("drainage")
          ? 22
          : 14;
  return Math.max(7, Math.round(base + weight * 0.45));
}

export function procurementLeadDays(name: string) {
  const lowerName = name.toLowerCase();
  if (
    lowerName.includes("electrical") ||
    lowerName.includes("mechanical") ||
    lowerName.includes("gate")
  ) {
    return 21;
  }
  if (
    lowerName.includes("concrete") ||
    lowerName.includes("pavement") ||
    lowerName.includes("structural") ||
    lowerName.includes("canal") ||
    // F-14, fixed 3 September 2026: duration and crew have always read
    // canal|drainage as one civil trade; the lead lookup must hear the same
    // vocabulary, or a drainage section carries the civil duration and crew
    // with only the fallback week of procurement lead.
    lowerName.includes("drainage")
  ) {
    return 14;
  }
  return 7;
}

export function laborCrew(name: string) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("electrical") || lowerName.includes("mechanical")) {
    return "MEP crew / 4-6 pax";
  }
  if (lowerName.includes("general") || lowerName.includes("mobilization")) {
    return "Site setup / 3-5 pax";
  }
  if (lowerName.includes("canal") || lowerName.includes("drainage")) {
    return "Civil crew / 10-14 pax";
  }
  return "Civil crew / 8-12 pax";
}

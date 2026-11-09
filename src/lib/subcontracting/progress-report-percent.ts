/**
 * Reads each BOQ item's "this period" percentage from a subcontractor's text progress report: the first "NN%"
 * on the line naming the item or within the next few lines. Returns null for items the report does not mention
 * with a percentage, so the user enters those instead of the app guessing.
 */
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function readItemPercentages(report: string, items: Array<{ id: string; description: string }>): Record<string, number | null> {
  const lines = report.split(/\r?\n/);
  const normalizedLines = lines.map(normalize);
  const result: Record<string, number | null> = {};
  for (const item of items) {
    const full = normalize(item.description);
    const key = full.length > 40 ? full.slice(0, 40).trim() : full;
    const at = key ? normalizedLines.findIndex(line => line.includes(key)) : -1;
    result[item.id] = null;
    if (at < 0) continue;
    for (let index = at; index < Math.min(lines.length, at + 5); index += 1) {
      // A later line naming another item ends this item's block.
      if (index > at && items.some(other => other.id !== item.id && normalize(other.description) && normalizedLines[index].includes(normalize(other.description).slice(0, 40).trim()))) break;
      const match = lines[index].match(/(\d{1,3}(?:\.\d+)?)\s*%/);
      if (match) { result[item.id] = Math.min(100, Math.max(0, Number(match[1]))); break; }
    }
  }
  return result;
}

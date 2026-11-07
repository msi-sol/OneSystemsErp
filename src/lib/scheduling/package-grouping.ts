/**
 * Groups ordered BOQ sections into suggested work packages.
 *
 * Imports keep only each item's own (lowest) section, so a typical workbook arrives as a flat list such as
 * "I-A. AIR CONDITIONING - VRV SYSTEM A", "ACU Accessories:", "Copper Pipes …", "Fittings", "for ground:" …
 * One package per section produced dozens of fragments (70 for the PGH VRF BOQ). Following the meeting
 * requirement to "suggest work packages that group related scope", a new package starts only at a major
 * heading and the sub-sections that follow stay with it. When no major headings can be recognised the
 * previous one-package-per-section behaviour is kept, so no workbook gets a worse suggestion.
 */

export type OrderedSection<T> = { name: string; order: number; items: T[] };
export type SectionGroup<T> = { name: string; description: string; sections: string[]; items: T[] };

const ROMAN_HEADING = /^\(?[IVXL]{1,5}(?:[-.][A-Z0-9]{1,3})?[.)\s-]/;
/** Sub-headings such as "ACU Accessories:" or "for ground:" and rating rows such as "4 - 125AT, 3P". */
const isSubHeading = (name: string) => /:\s*$/.test(name) || /:\s*\d/.test(name) || /^\d/.test(name) || /^[a-z]/.test(name);

function isMostlyUppercase(name: string) {
  const letters = name.replace(/[^A-Za-z]/g, '');
  if (letters.length < 6) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length >= 0.8;
}

export function isMajorHeading(name: string, order: number, previousOrder: number | null) {
  const trimmed = name.trim();
  if (!trimmed || isSubHeading(trimmed)) return false;
  if (ROMAN_HEADING.test(trimmed)) return true;
  if (isMostlyUppercase(trimmed)) return true;
  // Section numbers skip the item-less parent headings the importer does not keep; a jump of two or more
  // hidden headings before a titled section marks the start of a new part of the BOQ.
  return previousOrder !== null && order - previousOrder >= 3;
}

export function groupSectionsIntoPackages<T>(sections: OrderedSection<T>[]): SectionGroup<T>[] {
  const ordered = [...sections].sort((left, right) => left.order - right.order);
  const single = (section: OrderedSection<T>): SectionGroup<T> => ({ name: section.name, description: section.name, sections: [section.name], items: [...section.items] });
  if (ordered.length <= 3) return ordered.map(single);

  const groups: OrderedSection<T>[][] = [];
  let previousOrder: number | null = null;
  for (const section of ordered) {
    if (!groups.length || isMajorHeading(section.name, section.order, previousOrder)) groups.push([section]);
    else groups[groups.length - 1].push(section);
    previousOrder = section.order;
  }
  // Nothing recognisable as a heading: keep one package per section rather than one giant package.
  if (groups.length === 1) return ordered.map(single);

  return groups.map((members) => {
    if (members.length === 1) return single(members[0]);
    const head = members[0].name;
    const related = members.length - 1;
    return {
      name: `${head} + ${related} related ${related === 1 ? 'section' : 'sections'}`,
      description: `${head}. Includes BOQ sections: ${members.map((member) => member.name).join('; ')}`,
      sections: members.map((member) => member.name),
      items: members.flatMap((member) => member.items),
    };
  });
}

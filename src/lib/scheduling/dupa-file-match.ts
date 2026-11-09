/** Matches a DUPA file to a work package by the package code (e.g. "WP-01") or name in the file name. */
export type DupaPackage = { id: string; code: string | null; name: string };

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function matchPackage(fileName: string, packages: DupaPackage[]): string {
  const name = normalize(fileName.replace(/\.[^.]+$/, ''));
  // Codes match as whole tokens ("WP-01" in "dupa wp01 final", not "WP-010").
  const byCode = packages.find(pkg => pkg.code && new RegExp(`(^| )${normalize(pkg.code).replace(/ /g, ' ?')}( |$)`).test(name));
  if (byCode) return byCode.id;
  const byName = packages.find(pkg => normalize(pkg.name).length > 3 && name.includes(normalize(pkg.name)));
  return byName?.id ?? '';
}

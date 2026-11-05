/**
 * Where the work happens — the project's own hierarchy.
 *
 * Free of Prisma and `server-only` for the same reason the allocation rules
 * are: a tree that can be corrupted is worse than no tree, and the rules that
 * stop it must be provable without a database.
 *
 * A location answers WHERE. It is not the work (that is the BOQ line), not the
 * plan (that is the work package), not the money (that is the cost category),
 * and not the identity of any of them. "Concrete Works - Floor 2 - WP-03" is
 * three answers crammed into one name; "Floor 2" is a location.
 */

export type LocationNode = {
  id: string;
  parentId: string | null;
  name: string;
  code?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type LocationTreeNode = LocationNode & {
  children: LocationTreeNode[];
  depth: number;
};

/** Siblings first by their given order, then by name — stable and readable. */
function bySortThenName(left: LocationNode, right: LocationNode) {
  const order = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
  return order !== 0 ? order : left.name.localeCompare(right.name);
}

/**
 * The hierarchy, ordered, with depth on every node.
 *
 * Nodes whose parent is missing from the input are treated as roots rather
 * than dropped: a filtered query (one branch, or only the active locations)
 * must still render what it was given instead of silently losing rows.
 */
export function buildLocationTree(locations: LocationNode[]): LocationTreeNode[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const childrenOf = new Map<string | null, LocationNode[]>();
  for (const location of locations) {
    const parent =
      location.parentId && byId.has(location.parentId) ? location.parentId : null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), location]);
  }
  const build = (parentId: string | null, depth: number): LocationTreeNode[] =>
    [...(childrenOf.get(parentId) ?? [])].sort(bySortThenName).map((location) => ({
      ...location,
      children: build(location.id, depth + 1),
      depth,
    }));
  return build(null, 0);
}

/**
 * "Building A › Level 2 › East Wing" — the breadcrumb a construction reader
 * expects, never an id. Returns the names from the root down.
 */
export function locationPath(locations: LocationNode[], id: string): string[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export function formatLocationPath(locations: LocationNode[], id: string) {
  return locationPath(locations, id).join(" › ");
}

/** Every location at or beneath one node, including itself. */
export function descendantIds(locations: LocationNode[], id: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const location of locations) {
    if (!location.parentId) continue;
    childrenOf.set(location.parentId, [
      ...(childrenOf.get(location.parentId) ?? []),
      location.id,
    ]);
  }
  const found = new Set<string>([id]);
  const queue = [id];
  while (queue.length) {
    const next = queue.shift()!;
    for (const child of childrenOf.get(next) ?? []) {
      if (found.has(child)) continue;
      found.add(child);
      queue.push(child);
    }
  }
  return found;
}

export type ReparentCheck =
  | { ok: true }
  | { ok: false; reason: "unknown-location" | "unknown-parent" | "cycle" | "duplicate-name" };

/**
 * May this location move under that parent?
 *
 * The rule that keeps the tree a tree: a location may not become a descendant
 * of itself. Moving "Building A" under "Building A › Level 2" would orphan the
 * whole branch from the root and make every path walk forever, so it is
 * refused rather than detected later.
 */
export function checkReparent(input: {
  locations: LocationNode[];
  id: string;
  newParentId: string | null;
}): ReparentCheck {
  const { id, locations, newParentId } = input;
  const byId = new Map(locations.map((location) => [location.id, location]));
  const moving = byId.get(id);
  if (!moving) return { ok: false, reason: "unknown-location" };
  if (newParentId !== null && !byId.has(newParentId)) {
    return { ok: false, reason: "unknown-parent" };
  }
  if (newParentId !== null && descendantIds(locations, id).has(newParentId)) {
    return { ok: false, reason: "cycle" };
  }
  if (hasSiblingNamed({ excludeId: id, locations, name: moving.name, parentId: newParentId })) {
    return { ok: false, reason: "duplicate-name" };
  }
  return { ok: true };
}

/** Whether a sibling of this parent already carries the name. */
export function hasSiblingNamed(input: {
  excludeId?: string;
  locations: LocationNode[];
  name: string;
  parentId: string | null;
}) {
  const wanted = input.name.trim().toLocaleLowerCase();
  return input.locations.some(
    (location) =>
      location.id !== input.excludeId &&
      (location.parentId ?? null) === input.parentId &&
      location.name.trim().toLocaleLowerCase() === wanted,
  );
}

/**
 * A location nothing points at may be archived freely; one that carries
 * planning or execution history is archived, never destroyed, and a parent
 * keeps its children.
 */
export function archiveConsequence(input: {
  allocationCount: number;
  childCount: number;
}): { archivable: true; note: string } | { archivable: false; reason: string } {
  if (input.childCount > 0) {
    return {
      archivable: false,
      reason:
        "Archive or move the locations under this one first — a parent is not archived out from under its children.",
    };
  }
  return {
    archivable: true,
    note:
      input.allocationCount > 0
        ? `${input.allocationCount} planned allocation${input.allocationCount === 1 ? "" : "s"} stay on record and keep naming this location.`
        : "Nothing is planned here yet.",
  };
}

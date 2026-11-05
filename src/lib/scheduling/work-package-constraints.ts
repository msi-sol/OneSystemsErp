/**
 * Work package constraints — what is stopping this planned work from starting.
 *
 * Free of Prisma and `server-only`: the vocabulary and the lifecycle rules are
 * provable without a database, and the service layer applies them rather than
 * re-deciding them.
 *
 * A constraint is a specific unresolved condition a person on the project
 * knows about. It is deliberately NOT a duplicate of truth an authoritative
 * module already holds: "resources not reviewed" stays derived from the
 * resource baseline, and material availability will come from procurement
 * when that readiness is authoritative. Constraints carry only what no
 * upstream system fact represents (WPS Phase 3 §41).
 */

export const CONSTRAINT_TYPES = [
  "DRAWING_OR_DOCUMENT",
  "ACCESS_OR_WORK_AREA",
  "PRECEDING_WORK",
  "SUBCONTRACTOR",
  "APPROVAL_OR_DECISION",
  "OTHER",
] as const;

export type ConstraintType = (typeof CONSTRAINT_TYPES)[number];

/** The type, in the words a construction office uses. */
export const CONSTRAINT_TYPE_LABEL: Record<ConstraintType, string> = {
  ACCESS_OR_WORK_AREA: "Access or work area",
  APPROVAL_OR_DECISION: "Approval or decision",
  DRAWING_OR_DOCUMENT: "Drawing or document",
  OTHER: "Other",
  PRECEDING_WORK: "Preceding work",
  SUBCONTRACTOR: "Subcontractor",
};

export function isConstraintType(value: string): value is ConstraintType {
  return (CONSTRAINT_TYPES as readonly string[]).includes(value);
}

export const CONSTRAINT_STATUSES = ["OPEN", "RESOLVED"] as const;
export type ConstraintStatus = (typeof CONSTRAINT_STATUSES)[number];

/**
 * May this constraint be resolved with this note?
 *
 * Resolution is a human act on the record: it needs the person and a reason,
 * and it happens once. A resolved constraint is history — never deleted,
 * never reopened by editing; a recurring problem is a new constraint.
 */
export function checkResolution(input: {
  resolutionNote: string;
  status: string;
}):
  | { ok: true; note: string }
  | { ok: false; reason: "already-resolved" | "note-required" } {
  if (input.status === "RESOLVED") {
    return { ok: false, reason: "already-resolved" };
  }
  const note = input.resolutionNote.trim();
  if (note.length < 3) return { ok: false, reason: "note-required" };
  return { note, ok: true };
}

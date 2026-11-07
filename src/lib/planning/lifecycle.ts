/**
 * One place that decides where a project stands on the BOQ → Work Packages path,
 * so every page shows the same step names, the same next action and the same
 * "who acts" wording. Orientation only: every action is still authorized and
 * validated by its own API route.
 */
import { WPS_STEPS } from '@/lib/scheduling/wps-overview';

export type PlanningPhase = 1 | 2 | 3;
export type PlanningStepState = 'done' | 'current' | 'todo' | 'locked';

export interface PlanningStep {
  key: string;
  label: string;
  state: PlanningStepState;
  /** Done: what was recorded. Locked: what unlocks it. */
  hint?: string;
}

export interface PlanningNextAction {
  title: string;
  detail: string;
  /** Present only when the current viewer can take the action. */
  cta?: { label: string; href: string };
  /** Present when someone else has to act. */
  waitingOn?: string;
}

export interface PlanningLifecycle {
  phase: PlanningPhase;
  /** The whole path is complete (approved work-package baseline). */
  complete: boolean;
  steps: PlanningStep[];
  next: PlanningNextAction;
}

export const PLANNING_PHASES: { phase: PlanningPhase; label: string }[] = [
  { phase: 1, label: 'Upload & check file' },
  { phase: 2, label: 'Review & approve BOQ' },
  { phase: 3, label: 'Prepare & approve packages' },
];

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const attention = (count: number, word: string) => `${plural(count, word)} still ${count === 1 ? 'needs' : 'need'} attention.`;

/** Mark the first unfinished step current and every later unfinished step locked. */
function sequence(steps: { key: string; label: string; done: boolean; doneHint?: string; lockedHint?: string }[]): PlanningStep[] {
  let currentFound = false;
  return steps.map(step => {
    if (step.done) return { key: step.key, label: step.label, state: 'done', hint: step.doneHint };
    if (!currentFound) { currentFound = true; return { key: step.key, label: step.label, state: 'current' }; }
    return { key: step.key, label: step.label, state: 'locked', hint: step.lockedHint };
  });
}

// ---------------------------------------------------------------------------
// Phase 1 — BOQ Workspace intake
// ---------------------------------------------------------------------------

/** The BOQ Workspace creates new projects only. */
export interface IntakeLifecycleInput {
  fileChosen: boolean;
  analyzed: boolean;
  blockingIssues: number;
  saved: boolean;
  savedProjectId?: string | null;
  canAnalyze: boolean;
}

export function deriveIntakeLifecycle(input: IntakeLifecycleInput): PlanningLifecycle {
  const steps = sequence([
    { key: 'file', label: 'Choose the BOQ file', done: input.fileChosen || input.saved },
    { key: 'analyze', label: 'Analyze the file', done: input.analyzed || input.saved, lockedHint: 'Choose a BOQ file first.' },
    { key: 'check', label: 'Check sheet, columns and items', done: (input.analyzed && input.blockingIssues === 0) || input.saved, lockedHint: 'Analyze the file first.' },
    { key: 'save', label: 'Create the project with its draft BOQ', done: input.saved, lockedHint: 'Resolve every blocking issue first.' },
  ]);

  let next: PlanningNextAction;
  if (!input.canAnalyze) {
    next = { title: 'View only', detail: 'Your account can view BOQs.', waitingOn: 'A project editor uploads and checks the BOQ file.' };
  } else if (input.saved) {
    next = {
      title: 'Next: review the draft BOQ',
      detail: 'The draft is saved under its project. Check sections, items and the contract value, then complete the engineering review and PM approval.',
      cta: input.savedProjectId ? { label: 'Open project BOQ', href: `/projects/${input.savedProjectId}/boq` } : undefined,
    };
  } else if (!input.fileChosen) {
    next = { title: 'Next: choose the BOQ file', detail: 'Drop or choose an Excel, PDF or Word file. No project is created until you confirm.' };
  } else if (!input.analyzed) {
    next = { title: 'Next: analyze the file', detail: 'Select “Analyze this workbook” to read its sheets, columns and items.' };
  } else if (input.blockingIssues > 0) {
    next = { title: `Next: resolve ${plural(input.blockingIssues, 'blocking issue')}`, detail: 'Correct the sheet, header row or column choices below, then update the preview.' };
  } else {
    next = { title: 'Next: check the reading and save', detail: 'Check the items, project name and contract value, then select “Confirm sheet & save draft” to create the project.' };
  }
  return { phase: input.saved ? 2 : 1, complete: false, steps, next };
}

// ---------------------------------------------------------------------------
// Phase 2 — BOQ review and baseline
// ---------------------------------------------------------------------------

export interface BoqLifecycleInput {
  projectId: string;
  hasVersion: boolean;
  /** The latest version is an editable draft. */
  draft: boolean;
  approved: boolean;
  reviewPrepared: boolean;
  openFindings: number;
  contractVerified: boolean;
  totalsMatch: boolean;
  reviewCurrent: boolean;
  /** A review exists but the BOQ changed after it. */
  reviewStale: boolean;
  canEdit: boolean;
  canEngineerReview: boolean;
  canApprove: boolean;
}

export function deriveBoqLifecycle(input: BoqLifecycleInput): PlanningLifecycle {
  const base = `/projects/${input.projectId}/boq`;
  const steps = sequence([
    { key: 'source', label: 'Confirm the BOQ source', done: input.hasVersion, lockedHint: '' },
    { key: 'prepare', label: 'Prepare the review', done: input.approved || (input.hasVersion && input.reviewPrepared), lockedHint: 'Confirm a BOQ source first.' },
    { key: 'findings', label: 'Resolve reading findings', done: input.approved || (input.reviewPrepared && input.openFindings === 0), lockedHint: 'Prepare the review first.' },
    { key: 'contract', label: 'Verify the signed contract value', done: input.approved || input.contractVerified, lockedHint: 'Resolve the reading findings first.' },
    { key: 'reconcile', label: 'Match BOQ total to contract', done: input.approved || input.totalsMatch, lockedHint: 'Verify the contract value first.' },
    { key: 'review', label: 'Engineering review', done: input.approved || input.reviewCurrent, lockedHint: 'Needs findings resolved, a verified contract and matching totals.' },
    { key: 'approve', label: 'PM approval & lock', done: input.approved, lockedHint: 'Needs a current engineering review.' },
  ]);

  let next: PlanningNextAction;
  if (input.approved) {
    next = { title: 'BOQ approved and locked', detail: 'This baseline is the source for work-package scope. Continue to Work Packages.', cta: { label: 'Open Work Packages', href: `/projects/${input.projectId}/work-packages` } };
  } else if (!input.hasVersion) {
    next = { title: 'This project has no BOQ', detail: 'Projects get their BOQ when they are created from a BOQ file in the BOQ Workspace.' };
  } else if (!input.draft) {
    next = { title: 'This version is a record', detail: 'The latest BOQ version is not an editable draft. Check Evidence & history for its status.', cta: { label: 'Open evidence & history', href: `${base}?view=evidence` } };
  } else if (!input.reviewPrepared) {
    next = input.canEdit
      ? { title: 'Next: prepare the review', detail: 'Create the review record for this draft so findings and approvals can be tracked.', cta: { label: 'Prepare review', href: `${base}#prepare-boq-review-heading` } }
      : { title: 'Waiting for review preparation', detail: 'This draft has no review record yet.', waitingOn: 'A project editor prepares the review.' };
  } else if (input.openFindings > 0) {
    next = input.canEngineerReview
      ? { title: `Next: resolve ${plural(input.openFindings, 'reading finding')}`, detail: 'Confirm each finding as read, or set it aside or defer it with a reason. Correct items first if the reading is wrong.', cta: { label: 'Review findings', href: `${base}#boq-findings` } }
      : { title: `${plural(input.openFindings, 'reading finding')} to resolve`, detail: 'Each finding needs a decision before the engineering review.', waitingOn: 'A Project Engineer decides the open findings.' };
  } else if (!input.contractVerified) {
    next = input.canApprove
      ? { title: 'Next: verify the signed contract value', detail: 'Record your check of the signed contract. Verification does not change the BOQ.', cta: { label: 'Verify contract value', href: `${base}#boq-contract-check` } }
      : { title: 'Waiting for contract verification', detail: 'The signed contract value must be verified before the engineering review.', waitingOn: 'The Project Manager verifies the signed contract value.' };
  } else if (!input.totalsMatch) {
    next = input.canEdit || input.canApprove
      ? { title: 'Next: resolve the contract difference', detail: 'The BOQ total and the contract value differ. Correct the BOQ items, or record a contract revision with a reason.', cta: { label: 'Review BOQ items', href: `${base}?view=items` } }
      : { title: 'BOQ and contract amounts differ', detail: 'Approval stays blocked until the amounts match.', waitingOn: 'A project editor corrects the items, or the Project Manager revises the contract value.' };
  } else if (!input.reviewCurrent) {
    const stale = input.reviewStale ? ' The BOQ changed after the last review, so a new review is needed.' : '';
    next = input.canEngineerReview
      ? { title: 'Next: record the engineering review', detail: `Review this exact draft and record your comments.${stale}`, cta: { label: 'Record engineering review', href: `${base}#boq-engineering-comments` } }
      : { title: 'Waiting for the engineering review', detail: `All checks pass.${stale}`, waitingOn: 'A Project Engineer records the engineering review.' };
  } else {
    next = input.canApprove
      ? { title: 'Next: approve and lock the BOQ', detail: 'The engineering review is current. Approving locks this BOQ as the baseline for work packages.', cta: { label: 'Go to approval', href: `${base}#boq-pm-approval-note` } }
      : { title: 'Waiting for PM approval', detail: 'The engineering review is current.', waitingOn: 'The Project Manager approves and locks the BOQ.' };
  }
  return { phase: input.approved ? 3 : 2, complete: false, steps, next };
}

// ---------------------------------------------------------------------------
// Phase 3 — Work packages
// ---------------------------------------------------------------------------

export interface WpsReadinessCheck { key: string; label: string; passed: boolean }

export interface WpsLifecycleInput {
  projectId: string;
  approvedBOQ: boolean;
  hasPlan: boolean;
  /** The draft was prepared in this module (current generation rules). */
  adopted: boolean;
  packageCount: number;
  checks: WpsReadinessCheck[];
  reviewCurrent: boolean;
  reviewStale: boolean;
  /** Viewing the approved, locked baseline. */
  baselineApproved: boolean;
  hasOpenRevision: boolean;
  canEdit: boolean;
  canReview: boolean;
  canApprove: boolean;
}

const stepChecks = (key: string) => WPS_STEPS.find(step => step.key === key)?.checks ?? [];
const SCOPE_KEYS = stepChecks('scope');
const SCHEDULE_KEYS = stepChecks('sequence');
const LOCATION_KEYS = stepChecks('locations');
const RESOURCE_KEYS = stepChecks('resources');

export function deriveWpsLifecycle(input: WpsLifecycleInput): PlanningLifecycle {
  const base = `/projects/${input.projectId}/work-packages`;
  const failing = (keys: string[]) => input.checks.filter(check => keys.includes(check.key) && !check.passed);
  const approved = input.baselineApproved;
  const planned = input.hasPlan && input.adopted && input.packageCount > 0;
  const scopeMissing = failing(SCOPE_KEYS), scheduleMissing = failing(SCHEDULE_KEYS), locationMissing = failing(LOCATION_KEYS), resourceMissing = failing(RESOURCE_KEYS);
  const ready = planned && input.checks.length > 0 && input.checks.every(check => check.passed);

  const stepList = [
    { key: 'packages', label: 'Create packages from the BOQ', done: approved || planned, lockedHint: '' },
    { key: 'scope', label: 'Allocate all BOQ scope', done: approved || (planned && !scopeMissing.length), lockedHint: 'Create packages first.' },
    { key: 'schedule', label: 'Dates & sequence', done: approved || (planned && !scheduleMissing.length), lockedHint: 'Allocate the BOQ scope first.' },
    { key: 'locations', label: 'Locations & constraints', done: approved || (planned && !locationMissing.length), lockedHint: 'Set dates and sequence first.' },
    { key: 'resources', label: 'Resources & DUPA', done: approved || (planned && !resourceMissing.length), lockedHint: 'Set locations and constraints first.' },
    { key: 'review', label: 'Engineering review', done: approved || (ready && input.reviewCurrent), lockedHint: 'Every preparation check must pass.' },
    { key: 'approve', label: 'PM approval & baseline', done: approved, lockedHint: 'Needs a current engineering review.' },
  ];
  const steps: PlanningStep[] = input.approvedBOQ
    ? sequence(stepList)
    : stepList.map(step => ({ key: step.key, label: step.label, state: 'locked', hint: 'Approve the BOQ baseline first.' }));

  // Check labels are phrased as the goal ("Every package has … dates"), so present them as what is still
  // needed; appended bare they read as if the check had already passed.
  const firstGap = (missing: WpsReadinessCheck[]) => missing[0]?.label ? `Not yet met: “${missing[0].label}”.` : '';
  /** `cta` omitted when the action is a button on the same page. */
  const prepare = (title: string, detail: string, cta?: { label: string; view: string }): PlanningNextAction => input.canEdit
    ? { title, detail, ...(cta ? { cta: { label: cta.label, href: `${base}?view=${cta.view}` } } : {}) }
    : { title, detail, waitingOn: 'A project Planner or Project Engineer prepares the plan. Project WPS capacities are granted on this page.' };

  let next: PlanningNextAction;
  if (!input.approvedBOQ) {
    next = { title: 'Approve the BOQ baseline first', detail: 'Work packages are planned against an approved, locked BOQ.', cta: { label: 'Open BOQ', href: `/projects/${input.projectId}/boq` } };
  } else if (approved) {
    next = input.hasOpenRevision
      ? { title: 'A plan revision is open', detail: 'The approved baseline stays active until the revision is reviewed and approved.', cta: { label: 'Open revision proposal', href: base } }
      : { title: 'Work-package baseline approved', detail: 'Plan the coming weeks, then review the procurement budget and generate package-linked materials.', cta: { label: 'Open look-ahead', href: `${base}?view=look-ahead&baseline=active` } };
  } else if (!input.hasPlan || !input.adopted) {
    next = prepare('Next: start the work-package plan', `Select “${input.hasPlan ? 'Prepare existing draft' : 'Start work-package plan'}” below. You can then generate suggested packages from the approved BOQ sections or add packages yourself.`);
  } else if (input.packageCount === 0) {
    next = prepare('Next: create work packages', 'Select “Generate suggested work packages” below (related BOQ sections are grouped into packages), or add packages yourself. Suggestions stay drafts until reviewed.');
  } else if (scopeMissing.length) {
    next = prepare('Next: allocate all BOQ scope', `Every approved BOQ quantity must sit in a package, and package values must add up to the BOQ total. ${firstGap(scopeMissing)}`.trim(), { label: 'Open scope planner', view: 'scope' });
  } else if (scheduleMissing.length) {
    next = prepare('Next: set dates and sequence', `${attention(scheduleMissing.length, 'schedule check')} ${firstGap(scheduleMissing)}`.trim(), { label: 'Open dates & sequence', view: 'sequence' });
  } else if (locationMissing.length) {
    next = prepare('Next: set locations and constraints', `${attention(locationMissing.length, 'location check')} ${firstGap(locationMissing)}`.trim(), { label: 'Open locations & constraints', view: 'locations' });
  } else if (resourceMissing.length) {
    next = prepare('Next: review resources and DUPA', `${attention(resourceMissing.length, 'resource check')} Upload a package DUPA to replace suggested allowances, or review the suggestions. ${firstGap(resourceMissing)}`.trim(), { label: 'Open resources & DUPA', view: 'resources' });
  } else if (!input.reviewCurrent) {
    const stale = input.reviewStale ? ' The plan changed after the last review, so a new review is needed.' : '';
    next = input.canReview
      ? { title: 'Next: record the engineering review', detail: `All preparation checks pass.${stale}`, cta: { label: 'Open review & approval', href: `${base}?view=review` } }
      : { title: 'Waiting for the engineering review', detail: `All preparation checks pass.${stale}`, waitingOn: 'A Project Engineer reviews the plan.' };
  } else {
    next = input.canApprove
      ? { title: 'Next: approve the work-package baseline', detail: 'The engineering review is current. Approval locks this plan for execution.', cta: { label: 'Open review & approval', href: `${base}?view=review` } }
      : { title: 'Waiting for PM approval', detail: 'The engineering review is current.', waitingOn: 'The Project Manager approves the work-package baseline.' };
  }
  return { phase: input.approvedBOQ ? 3 : 2, complete: input.approvedBOQ && approved && !input.hasOpenRevision, steps, next };
}

# Universal Project Intake and Scheduling Engine

## 1. Architectural Classification

Separate the system into five distinct layers:
A. Reusable platform controls
B. Format-specific document extraction adapters
C. Canonical project and BOQ normalization
D. Dynamic project-specific schedule generation
E. PGH historical recovery and regression fixture

## 2. Reusable Platform Controls

The following controls must be universally reusable across all projects:
- Auth.js authentication
- project-scoped PBAC
- role and capability enforcement
- user and project assignments
- Prisma.Decimal financial processing
- authoritative BOQ approval and locking
- actor provenance
- operational approval records
- AuditLog
- idempotency
- optimistic concurrency
- advisory locking where applicable
- schedule review workflow
- staged approvals
- baseline activation
- immutable active baselines
- revision cloning
- backup and recovery controls

These controls must not contain PGH-specific project IDs, amounts, checksums, dates, row counts, WBS counts, activity counts, or dependency counts.

## 3. Universal New-Project Workflow

1. Create the project.
2. Enter project dates and awarded contract amount.
3. Upload the awarded Program of Works and/or Bill of Quantity.
4. Detect the source document type and layout.
5. Extract source rows and project information.
6. Map extracted data into the canonical BOQ model.
7. Present validation warnings and mapping exceptions.
8. Allow authorized user review and correction.
9. Reconcile the canonical BOQ against the awarded contract amount.
10. Approve and lock the authoritative BOQ.
11. Generate a project-specific schedule.
12. Conduct technical, contract and financial review.
13. Complete staged approvals.
14. Activate the approved baseline.
15. Manage revisions without mutating the active baseline.

## 4. Visual Column-Mapping Workflow

Provide an authorized visual mapping interface to map unknown documents into the Canonical BOQ Model. Show fields mapped, location, extracted value, confidence score, warning, proposed transformation, and user approval status. Allow mappings to be saved as reusable profiles.

## 5. Universal Financial Reconciliation

Required accepted result for every project:
Canonical BOQ total = Approved awarded contract amount
Difference = 0.00

## 6. Project-Agnostic Schedule Generation

The engine must dynamically analyze and determine the WBS structure, activity durations, dependencies, testing, commissioning, and final acceptance phases based on the project disciplines, scope, scale, lead-time rules, and calendar constraints.

## 7. Dynamic Schedule Review

Generated schedules must be reviewed manually.
Lifecycle:
`AI_GENERATED_DRAFT` -> `READY_FOR_REVIEW` -> `UNDER_TECHNICAL_REVIEW` -> `TECHNICALLY_APPROVED` -> `PENDING_BASELINE_APPROVAL` -> `ACTIVE_BASELINE`

## 8. Required Separation of Modes

Maintain a strict separation between PRODUCTION MODE and RECONSTRUCTION MODE. Normal workflow does not require RECONSTRUCTION MODE environment variables.

## 9. Component Classification

- **Reusable now**: PBAC, authentication, baseline architecture, audit logging.
- **Reusable after refactor**: AI rule heuristics.
- **PGH-specific**: `cmrirhhw30000ic0406v47smb`, row counts, specific WBS hierarchy.
- **Reconstruction-only**: `GATE8D_REPLAY_MODE`, explicit id/seed scripts.
- **New universal component required**: Extractors, Adapters, Dynamic Schedule Engine, Mapping Workflow.

## 10. BOQ-linked work-package workspace

The project's Contract Value & BOQ tab links to **Open work packages**, and
the Scheduling page opens on **Work Packages**. Each package is an
existing `ScheduleActivity`, grouped by its WBS node and linked to its BOQ scope
through `ScheduleBOQAllocation`. This is a view of the existing schedule, not a
second schedule or an independent approval workflow.

The workspace shows stored planned dates, allocation amounts, their share of
the schedule's awarded contract value, and separately labelled recorded activity
progress. Its BOQ coverage table includes every awarded BOQ item, including
unallocated and zero-cost lines, and compares the quantities allocated across
the selected schedule. Unknown quantities and legacy mappings remain visibly
unverified; missing amounts are not replaced with quantity-times-rate estimates.
The display projection uses Decimal arithmetic before serializing the results.

**Plan in WBS & activities** opens the existing activity editor; **Review
workflow** leads to the existing review and baseline controls; **View contract
BOQ** opens the project's Contract Value & BOQ tab. Active, superseded and
archived baselines are identified as locked. Access to the scheduling page
uses the existing session and scheduling `canView` permission check. Authorized
draft editors can save package metadata in WBS & activities, and edit existing
nonlegacy allocation quantities in each package's scope after BOQ approval.
These writes use the guarded workflow transaction, project scope, editable
workflow status and optimistic schedule row version. Quantity edits reject
over-allocation and recalculate reference values from the approved BOQ's stated
amount, with deterministic cent rounding; they do not calculate BOQ amounts
from unit rates. Schedule totals and affected package totals update atomically.

For a latest `DRAFT` BOQ version, Contract Value & BOQ provides an item editor
and **Approve & Lock BOQ** using existing `canEditDraft` and `canApprove`
permissions. Saves check the current canonical checksum and preserve the
explicitly entered amount. Approval requires nonempty valid items and exact
reconciliation to the positive contract value, records actor/time and audit,
locks the BOQ and pins the version/checksum into editable schedules. The old
lock-only control cannot bypass this approval for a draft version. Schedule
review submission requires that approved, locked version and matching checksum.
Locked BOQs and reviewed or immutable schedules reject draft mutations.

Recorded activity percentages in this application are not evidence of measured
BOQ accomplishment. The workspace does not introduce quantity measurement,
change progress formulas or infer physical completion from dates, costs or
deliveries. Existing schedule generation, editing, technical/financial review,
baseline activation and revision controls remain the paths for those actions.

Review submission uses the authenticated user's project permission and
assignment. Activation checks the selected project's approved BOQ version and
checksum, rather than a checksum from a historical project fixture. Draft
activity creation, editing, deletion, and allocation edits require the project
draft-edit permission, the current schedule row version, and the guarded
workflow transaction; each mutation records its actor and audit details. The
BOQ project page uses the verified session and project access check as well.

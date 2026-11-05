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

## 11. BOQ Workspace, BOQ review and Work Packages

This section owns the native BOQ/WPS integration. Earlier schedule sections describe
legacy scheduling; plans tagged BOQ_WPS_WORKSPACE_V1 use the dedicated workflow
below. The source behavior reference is ERP-One-Systems on main, observed at
ba94eb596f82f19658bb9972cdafc0be7234b6d2 on 5 November 2026. This is a local,
uncommitted integration, not a production deployment declaration.

### Intake and source evidence

/boq is BOQ Workspace; /boq-template remains a compatibility route. The blank
Download Template UI is removed. Original-workbook retrieval is retained.
Analyze accepts XLSX up to 10 MiB, inventories sheets, asks for ambiguous sheet
and column selections, and previews the source. Analysis creates no project,
BOQ or source record. Confirmation rechecks permissions and content hash,
reparses the chosen mapping, preserves original bytes and creates a canonical
DRAFT BOQ. The analyzed total prefills an editable, unverified contract candidate;
the user confirms a positive contract value for a new project. Existing project
contract values are not overwritten by intake. A mismatch is disclosed in the
draft and blocks approval until explicitly reconciled, rather than blocking
source preservation or silently changing either amount.

Projects → New project from BOQ opens `/boq?mode=new`. An empty project's BOQ
module opens `/boq?project=[id]`, retaining that destination independently of the
global active-project selector. Other project formats remain available through
the compatibility entry; existing saved imports and template routes are retained.
No download/fill/re-upload template step is mandatory for this flow.

Pre-confirm review lists every extracted section occurrence with its source
heading row, count and total. Item review is paginated in groups of 25 and can
filter by section occurrence, including repeated headings with the same name.
Filtered counts/totals describe only the view; the full BOQ total remains visible.
Confirmation always re-parses and commits the full selected BOQ worksheet, never
just the preview page or filter. Other workbook sheets and all original file
content remain in the preserved source; they are not silently counted as BOQ scope.

Blank quantities default to 1 and blank units to lot with reviewable findings.
Malformed nonblank values remain findings requiring review/correction. The stated
amount is authoritative. When it conflicts with a stated rate, amount/quantity
supplies the used rate while the original stated rate remains source evidence.
Synthesized item codes are disclosed. Printed total differences become findings,
not silent replacement amounts or automatic intake rejection. Separate repeated
section headings retain distinct source identities for WPS suggestions.

### Separate BOQ module

/projects/[id]/boq supports reasoned line corrections, add/remove, contract
verification/revision, findings and explicit confirm/set-aside/defer decisions.
Engineer review fingerprints the current BOQ and review state; editing makes it
stale. PM approval requires current review, verified contract, resolved required
findings, reconciled scope/value, and acknowledgement of intentionally set-aside
source rows. Approval freezes the baseline and records evidence and actor/time.
Native review records cannot bypass this through legacy direct-lock/import
approval. Old template commits now enter DRAFT review rather than auto-approval.

A corrected reading of the retained workbook is previewed against an exact
mapping and current review fingerprint before apply. It preserves the first
reading, earlier reading history and human corrections. Newly readable source
rows do not silently create canonical items; missing rows retain canonical scope
and raise findings. Prior identities can reconnect when a row is restored.
A different corrected workbook is staged separately, with stable/possible row
identity decisions, additions/removals and independently accepted carry-forward
of corrections/decisions. Identity matching never implies carrying review.
Adoption creates a new draft version and retains earlier source evidence.

A legacy draft without a retained workbook has an explicit Prepare legacy BOQ
review action. This saves an honestly labelled canonical snapshot. It invents
neither original bytes nor a first reading. Read-only page loads create nothing.
Approved BOQs provide search, section filtering and retained review/source history.

### WPS preparation, review and revision

/projects/[id]/work-packages is separate from BOQ. The prior project tabs link
to these modules. A locked approved BOQ is required. Start/adopt an editable
draft, or start a reasoned revision when a baseline is already active.
Suggestions create one package per persisted BOQ section occurrence, full stated
scope, completion weights, duration/offset/crew assumptions, and three explicitly
unreviewed materials/labor/equipment allowances. Calendar dates remain human
entries. Manual packages and split package × BOQ item × location allocations
are supported. Allocation amounts use the approved stated BOQ amount, with
explicit deterministic cent rounding and aggregate quantity reconciliation.
The initial section suggestions do not establish a one-section/one-package
business rule: a package can combine items from different sections and one item
can be split across packages through the Scope planner.

### Independent package breakdown / DUPA intake

Open a package in an editable native work-package draft and use **Package
breakdown / DUPA**. This path also works for a manually created package and does
not require generating section suggestions. Select an XLSX workbook (up to
10 MiB), choose its intended package worksheet and map description, unit,
quantity and amount, plus optional item code/rate. The existing bounded workbook
parser is reused. The complete selected component table is reviewed before
preservation; unsupported formats and malformed mappings/values are rejected.
Hierarchical DUPA forms must expose a mappable component table; the system does
not infer productivity, scale unit analyses by BOQ quantities or combine sheets.

Preserving the upload stores the exact original bytes, hash, worksheet, mapping,
all normalized component rows and their section/source-row relationships, actor,
time and originating schedule. This creates evidence only. Adding costs is a
separate explicit action: choose each row's resource category, give a reason
describing its relationship to generated/existing costs, and acknowledge existing
package resources. Nothing is silently replaced. Exact normalized duplicate
components, repeat application and the same workbook/worksheet uploaded again
against the same package are refused. A genuinely different source can be
preserved as additional evidence; it is not an automatic replacement.

Resource application uses the current quantity × rate rule, including the
two-decimal rate and rounded amount checks. Missing/defaulted quantities or units
and inconsistent stated rates/amounts prevent application; the source can remain
evidence while the workbook is corrected. Imported resources are unreviewed
draft budget lines with upload/source-row provenance. Existing cost, coverage,
location, Engineer review and PM approval gates remain in force. Users remove
obsolete draft allowances separately through the existing audited resource action.
Inventory/catalog matching and procurement requirements remain explicit downstream
actions; uploaded cost rows do not create materials, purchase orders or actual costs.

Evidence is held in the existing versioned plan JSON document, with optional
backward-compatible fields and no new SQL schema or migration requirement. A plan
supports at most 20 preserved uploads and 500 total extracted component rows;
the existing 500-resource limit also applies. Upload/apply use project planning
capacity, package-to-plan checks, serializable transactions, row-version guards
and audit events. Failed persistence cleans up its newly stored file best-effort.
Evidence prevents package deletion. Revisions remap package associations while
keeping the original upload identity, file, source rows and originating schedule.
Approved baselines remain immutable; uploading requires a reasoned revision.

### WPS preparation and approval controls

Preparation includes unique package codes, dates/duration, completion weights,
cycle-free sequence links respecting entered dates, hierarchical project
locations, typed constraints with owner/needed-by/resolution, resource budgets,
and human review of suggested allowances. Resource line cost is entered quantity
× rate. All budget kinds, including additional allowances, count toward direct
cost. Direct cost must remain strictly below BOQ value. Scope/date changes in a
revision require renewed resource review. Every package must state scope and
location; total weights are 100% and BOQ quantities/values reconcile.

An OPEN constraint may be present at approval only with an owner and needed-by
date; it still marks execution blocked and requires acknowledgement if real
work or a weekly target proceeds. Resolved constraints are immutable; new issues
are new records. Live constraints and locations are project truth outside frozen
baselines. Drafts synchronize them with optimistic versions, invalidating stale
reviews. Referenced locations may be archived without erasing historical links;
active child locations prevent parent archival.

WPS capacities are explicit project grants: Planner, Project Engineer and Project
Manager. Admin/Owner status alone does not imply plan preparation/review/approval
capacity. Existing operational roles govern daily logs and weekly commitments;
server action gates match their controls. The authorized local all-module demo
has explicit WPS capacity grants. Capacity changes are audited.

Engineer review fingerprints the complete ready plan. PM approval requires its
current fingerprint and a written reason, records an authoritative BOQ-pinned
baseline snapshot, and prevents legacy financial/director approvals from acting
as an alternative path for tagged plans. Untagged legacy workflows remain.
Revisions clone stable package identities, current locations/live constraints and
planning details into an editable proposal. The previous baseline remains active
until approval. A stale-parent proposal cannot replace a changed baseline;
cancelling archives the proposal without deleting its history.

### Execution, commitments and physical evidence

Look-ahead supports 14/21/28/42-day horizons, late/underway/upcoming lanes and
undated/open-constraint attention. Weekly plans have up to 31 inclusive days,
located BOQ targets and overlapping-period reservation checks against remaining
physical scope. Repeated allocation saves upsert one target; target identity
cannot be moved. Draft/committed targets may be adjusted; removal is draft-only.
Committing requires the current baseline and nonempty targets. Closing draft or
committed plans freezes measured achievement/shortfall; discarding a draft needs
a reason. A superseded baseline's ended commitment can still be closed honestly.

Daily logs record one baseline package per date, optional narrative/weather,
measured BOQ/location quantities, labor and scalar equipment hours. A focused
save replaces only supplied streams. Corrections/removals retain earlier physical
evidence and recalculate effective totals. Prior-baseline logs are read-only.
Measured actuals remain bounded by allocation and approved BOQ quantities, and
revision scope cannot fall below executed quantities at the stable package ×
BOQ × location identity. Physical progress comes from measured quantities;
dates, procurement spend and arbitrary progress percentages are not measurements.
Weekly achievement uses only measurements within its period. Claims and payment
certification remain in the existing ERP modules and are not inferred here.

Old demo baselines lacking verified activation/BOQ evidence remain readable;
they are not backfilled with fabricated approvals. A prepared, reviewed and
PM-approved revision enables native execution for those projects.

### Package materials and existing ERP integration

Package material requirements use real project material masters, explicit
shared catalog identity, issued/installed/held quantities, project unreserved
stock, warehouse unreserved stock, package reservations, incoming requests and
transfers. Shortage is never negative. Purchase requests are limited to confirmed
shortage and are linked to the package with append-only audit events. Matching
material names never establishes shared identity; units must be compatible.

Warehouse balance adjustments require evidence/reference and inventory approval.
Reservations cannot consume another package's stock. Transfers have draft,
dispatched and received stages; stock leaves the warehouse at dispatch and
enters native project stock at receipt, reserved for its package. Cancellation
is draft-only. All movements enforce serial transactions and state versions.
Native material issuance approval respects reservations in the same transaction,
consumes its own reservation and preserves the existing ERP release workflow.

Real MR/PO/delivery/issuance/return/consumption records remain in existing ERP
modules and are explicitly associated with stable package identity. Operational
links select the correct active project. Material installations must name a
released package issuance and a site log on the same baseline/package/date,
and cannot exceed net issued material after prior returns/installations.
Native return processing also refuses returning already installed quantities.
An installation is material evidence, not a substitute for measured BOQ work.

### Persistence and local operation

MySQL additive migrations introduce BOQReviewState, WorkPackageExecutionState,
WorkPackageCapacityGrant and WorkPackageMaterialInventoryState. Versioned JSON
aggregates retain source/review and execution history with optimistic row
versions; audit records are appended. Existing schedule metadata remains in the
schedule description under BOQ_WPS_WORKSPACE_V1, preserving legacy notes.
No existing migration is rewritten and no database reset is required.

Originals use private .runtime/boq-workspace or configured S3. Downloads enforce
project access. Retained files and database backups belong together operationally
and stay out of source/release packaging. Local backend proxy operations need
BACKEND_INTERNAL_URL and BACKEND_INTERNAL_SECRET configured for the Express
backend. The local web app runs on 3001 and backend on 4000. Next development
accepts the explicit 127.0.0.1 loopback host. Production hosting still requires
its own configuration and persistent retained storage.

### Manual local walkthrough

For the complete intake path: Projects → **New project from BOQ** → choose an
XLSX → **Analyze this workbook** → review all sections/items and mappings →
confirm the full BOQ sheet. Verify the contract, decide required findings, record
Engineer review and obtain PM BOQ approval. Open Work Packages, start the draft
and confirm suggestions or create packages manually. Use Scope planner to adjust
the breakdown. Open a package for its independent breakdown/DUPA upload, preserve
the reviewed component table, then optionally categorize/apply costs. Review
resource allowances and complete the existing plan readiness/approval controls
before using the approved execution/material workflows.

For the existing legacy practice record:

1. Open /boq and expand BOQ Action Required. Choose PRACTICE — Draft BOQ and
   Work Packages, then Edit BOQ. This existing practice draft is intentionally
   unapproved for manual testing.
2. Choose Prepare legacy BOQ review, edit/add/remove lines as desired, and save
   with reasons. Verify/revise the contract and decide required findings.
3. Enter engineering comments and Record engineering review. Then Approve BOQ
   baseline and confirm PM approval. Editing after review requires a new review.
4. Open Work Packages. Choose Prepare existing draft for this saved practice
   plan. For a new empty project, Start work-package plan and optionally Generate
   suggested work packages. Confirm suggestions explicitly.
5. Maintain Locations, allocate full quantities in Scope planner, set each
   package's dates/weights, check Sequence and Constraints, and set/review all
   material/labor/equipment allowances in Resources & budgets.
6. In Review & revision, resolve every readiness failure, record the Engineer
   review, then enter the PM approval reason and approve the baseline.
7. Use Look-ahead, Weekly commitments and Daily site logs. Record actual quantities
   against located scope; review recalculated achievement. Open a package for
   its material requirements, inventory reservations/transfers and native ERP
   procurement/issuance links. Add real project material masters first when none
   exist; a money allowance does not establish purchasable material quantities.
8. Start a reasoned revision to test changes while the previous baseline remains
   active, then review/approve or cancel the proposal. Closed weekly outcomes,
   original source evidence and earlier baseline history remain retained.

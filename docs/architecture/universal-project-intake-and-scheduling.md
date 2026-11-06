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

Production originals use configured private S3 (`AWS_S3_BUCKET_NAME` or the
existing backend alias `S3_BUCKET_NAME`). Missing configuration or S3 failure
stops the save; production never falls back to disk. Local development always
uses private `.runtime/boq-workspace`, even if S3 settings exist. Historical
`retained:boq-workspace/` paths remain readable through the retained backend
upload mount. The production bucket, role, configuration and recovery procedure
are owned by [the deployment guide](../../deploy/cicd/README.md#application-uploads).
Original downloads enforce project access. Retained files and database backups belong together operationally
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

## 12. Meeting workflow integration — 6 November 2026

The meeting requirements are implemented in the main `OneSystemsErp` checkout,
building on the native BOQ/WPS flow above. These are local source changes until
the exact validation and deployment results are recorded; this section does not
declare a production deployment.

### Document intake and readable BOQ review

BOQ Workspace and individual package DUPA intake accept `.xlsx`, `.pdf`, and
`.docx`, at most 10 MiB. Excel keeps the bounded deterministic workbook parser.
PDF and Word use the configured Gemini reader; Word XML is read from a bounded
Office archive with namespace-aware XML parsing. `.xls`, `.doc`, invalid archives,
oversized/empty files and incomplete document tables are rejected explicitly.
Missing AI configuration or a provider failure leaves the source unimported and
offers the Excel path; it never creates placeholder financial values.

AI output is unapproved source evidence, not a calculation or approval. It must
contain explicitly stated item amounts; missing amounts are not filled from
quantity × rate. A signed, expiring reading binds the complete extraction to the
original file hash, actor and intended project/package, allowing preview and
confirmation to reuse exactly the reviewed reading. Confirmation retains the
original PDF/Word bytes and MIME type as well as normalized rows and extraction
metadata. Re-reading a saved document uses its preserved reading, not a fresh,
possibly different model response. Local files remain local; production files
use the existing private S3 store.

Labelled Excel project metadata and AI-read document metadata prefill the new
project fields. Extracted details start read-only with an explicit edit action;
an absent signed value remains an unverified BOQ-total candidate. Existing project
contract values are never overwritten by intake. Source/current BOQ comparison
shows item and section changes, quantities by unit, rates, amounts, totals and
persisted review/approval history. PDF originals can be viewed inline through
the same project-authorized route; originals remain downloadable.

### DUPA reconciliation

User ruling, 6 November 2026: a reviewer explicitly selects draft allowance rows
that an uploaded DUPA replaces. Other resource rows remain. Application validates
the current draft row version, package ownership, category selections and stated
cost arithmetic, rejects duplicates against retained rows, and stores replaced
resource snapshots plus the reason and actor in retained upload/audit history.
An approved schedule still requires the existing reasoned revision process.

### Reviewed procurement benchmark → master materials

`/projects/[id]/benchmark` provides source analysis, manual/AI-assisted scope and
package suggestions, correction, explicit approval and material generation.
`PROJECT_MANAGEMENT` project edit capabilities govern drafts; existing approve/
lock capabilities govern approval. The approved BOQ and active schedule remain
prerequisites. Approval verifies that the schedule pins the current approved BOQ.

User ruling, 6 November 2026: the approved benchmark defines spending and quantity
limits; the BOQ remains the contract baseline. Additional budget rows require a
reason and explicit per-row approver acknowledgement, retained with approver/time.
Unmapped packages, unclassified resource kinds and quantity × rate differences,
including a cent, block approval until corrected. Source values remain preserved.
AI mapping suggestions use only supplied project IDs, remain draft, and show no
fabricated confidence score. A material-to-BOQ mapping is explicitly a scope
reference, not a conversion between material and BOQ units.

Review versions and history use the existing append-only audit document pattern
(`PROCUREMENT_BENCHMARK_REVIEW_STATE`, transaction ID = project ID), with serializable
transactions and an expected revision token. No SQL schema change is required.
Approval creates locked benchmark records. Generation is a separate atomic,
idempotent step: only approved MATERIAL rows enter the existing master-material
table; matching normalized descriptions AND units combine quantities and stated
amounts while `BOQMapping` retains each source line/package. Labor/equipment/other
budget rows remain approved budget evidence and do not become inventory.
Weighted material rates retain the existing consolidation calculation's precision;
the sum of approved source amounts remains the authoritative total. A benchmark
with no material rows can finish generation with an empty material output rather
than becoming trapped after approval. Missing source units/quantities must be
completed by the reviewer; the parser's fallback quantity/unit is not approvable.

Generated package quantities become existing WPS material requirements. A generated
package's requirement cannot be raised above its approved benchmark allocation;
an unapproved master material cannot be attached through this path. Projects that
do not use a generated benchmark retain their earlier requirement behavior.
Existing benchmark/master records are never silently replaced. Locked, mapped,
or downstream-used records refuse destructive legacy replacement/deletion; an
approved benchmark cannot be changed through a legacy upload shortcut. Initial
generation currently requires an empty master-material list; merging a new budget
version into already-used masters requires an explicit reviewed revision design.
Draft source replacement is also refused; correcting a row does not replace the
retained original. Mapping notes retain compact review/line/package references,
with complete source values and reasons in the immutable review document. This
supports older local installations whose mapping-note column is still 191
characters; unusually long legacy identifiers are rejected before approval.

User ruling, 6 November 2026: MR quantities reserve approved allowances on
submission, not during draft or AI checking. Cancelled/rejected uncommitted
requests release them. Physical stock holds remain separate. Requests against
generated materials require explicit package links; all active request quantities
count once at both material/project and package level, including fulfilled
requests so prior purchases cannot reopen the original allowance.

Receipt entry now derives remaining quantities from approved receipts attached
to the specific PO, rather than project-wide delivered stock. Receipts still
reference material IDs; repeated material lines are allocated in PO-line order
for display. Positive quantities and same-project/PO membership are checked.
Approval updates PO delivery progress and receipt/stock/cost/AP/workflow records
in one serializable transaction; failed or repeated approval cannot partially
reapply those effects. Over-delivery exception policy is unchanged.

Over-budget PO exception authority and detailed warehouse/site-movement changes
remain user rulings. New benchmark approval/generation establishes approved
limits and provenance; it must not be described as complete downstream financial
enforcement until the PO ceiling/exception implementation has been verified.
AI document extraction and AI mapping require `GEMINI_API_KEY`; absence is an
explicit service error with an Excel/manual alternative, not a fabricated reading.

### Planning orientation and summary display (6 November 2026)

The BOQ intake, project BOQ and Work Packages screens share a three-step
orientation guide: upload/check, BOQ review/approval, and package preparation/
approval. The guide describes the next action; existing module permissions and
approval checks remain authoritative. Confirmed intake continues to open the
BOQ page for the returned project ID. Breadcrumbs provide access to that
project's summary and BOQ without a second sidebar.

Project Summary reads the latest BOQ version and its total/status, current
project BOQ item count, and latest-created schedule's status/package count.
The latest-created schedule is explicitly labeled and is not necessarily an
active execution baseline. Draft import amounts remain distinct from approved
actual costs. Missing cost-ledger entries show an unavailable actual cost;
recorded approved zero entries still show zero. Contract minus posted costs is
labeled as a balance before future costs, not a projected profit.

Follow-up user rulings on 6 November 2026 restrict BOQ Workspace intake to new
projects. Existing project links lead back to the owning project BOQ; source
correction/version controls remain there. Both workspace analysis and confirmation
reject an existing project target. Project cards group actual BOQ/WPS decisions;
the original management register remains available with its existing permissions.

The user approved importing numeric values at their explicit Excel display
precision, with row-level rounding notes and byte-identical original retention.
Identifiers are not rounded. Merged-header slave cells do not create duplicate
mapping candidates. Number/formula legend rows, recognized non-priced annotations
and SUM subtotal evidence do not become priced items. A benchmark row with no
unit/rate/amount can be marked non-priced only through an explicit row decision
with a reason; priced or malformed rows cannot use that exception. Such decisions,
reading notes, source item totals and the printed total remain in benchmark source
history. The PGH benchmark's printed/item difference remains visible; no balancing
amount is invented.

The Super Admin uploader receives effective planning/review/approval access to
their own imported project without a separate membership/grant setup. This is an
access rule, not automatic approval: Engineer review, PM approval, baseline pins,
readiness checks, archived restrictions and simulated-role restrictions remain.
Other users continue through explicit project capacities.

BOQ review presents the current review task before supporting comparison evidence.
The editable item table and matched source/current comparison provide section
filters and 25/50-row pages while keeping full-data totals visible. Work Packages
separates preparation from site-work views and links preparation checks to the
corresponding editor; generated scope remains an editable draft.

An individual package uses Scope, Schedule, Resources & budgets and DUPA tabs.
Its resource rows and package choices are scoped to that package; plan-wide
allowance suggestion stays in the full-plan resources view. Project-wide
constraints remain visible alongside the selected package's constraints.
Benchmark source preview and mapping tables page 25 rows at a time, preserving
full-data totals and edits. Missing AI configuration is reported explicitly;
manual matching and the existing approval prerequisites remain in effect.

The BOQ page uses addressable Overview, Sections, BOQ items and Evidence & history
views. Overview retains contract verification and Engineer/PM review controls.
Sections list source occurrences with counts and totals and link to the selected
items view. A repeated section name is not a unique key: preserved section
identities keep those occurrences distinct. Legacy rows without source identities
use their recorded category without inventing source lineage. The approved item
viewer searches the whole BOQ and renders 25 rows per page; filtered totals cover
all matching rows. Evidence holds existing comparisons, corrections and version
records. No approval or financial calculation is changed by view selection.

Generated benchmark master materials expose project quantity reservations from
submitted/active MRFs and cost commitments from approved/issued purchase orders.
PO quantities are not added again to their originating MRF reservations. Draft,
AI-checking, cancelled and rejected MRFs do not reserve quantity. The cost view is
commitment tracking, not cash paid or an estimated draft-MRF cost. Each material
shows its approved quantity/source amount, usage, remaining balance and reached
or exceeded limits. The master-list MRF action opens the package-linked request
form for generated benchmark records; legacy records retain their existing
request path. Explicitly classified benchmark materials using a lot unit remain
requestable; the legacy lump-sum scope filter does not hide them.

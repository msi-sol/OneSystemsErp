import { randomUUID } from 'node:crypto';
import { Prisma, ProjectScheduleWorkflowStatus } from '@prisma/client';
import { prisma, transactionContext } from '@/lib/prisma';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { estimatePhPublicWorksBudget } from './work-package-budget';
import { buildBreakdownResources, PackageBreakdownError, resourceFingerprint, type PackageBreakdownUpload, type BreakdownKind } from './package-breakdown';
import { parseWorkspaceWorkbook } from '@/lib/boq/workspace-parser';
import type { WorkspaceMapping } from '@/lib/boq/workspace-types';
import { storeWorkspaceOriginal, removeWorkspaceOriginal } from '@/lib/boq/workspace-service';
import { isConstraintType } from './work-package-constraints';
import { assertWorkPackageExecutedScope } from './work-package-execution';
import {mergeLiveConstraints,recordDraftConstraint}from'./work-package-constraint-sync';
import {
  readPlanDetails,
  type PlanConstraint,
  type PlanDetails,
  type PlanLocation,
  type PlanResource,
} from '@/lib/scheduling/work-package-details-types';

const EDITABLE = new Set<ProjectScheduleWorkflowStatus>([
  ProjectScheduleWorkflowStatus.AI_GENERATED_DRAFT,
  ProjectScheduleWorkflowStatus.INVALID_GENERATED_DRAFT,
  ProjectScheduleWorkflowStatus.TECHNICAL_REVISIONS_REQUIRED,
]);
const WORKSPACE_KIND = 'BOQ_WPS_WORKSPACE_V1';

export class WorkPackageDetailsError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'WorkPackageDetailsError';
  }
}

type Actor = { id: string; role: string; name?: string | null };
type DetailsSchedule = { id: string; projectId: string; description: string | null; rowVersion: number; workflowStatus: ProjectScheduleWorkflowStatus; generationRulesVersion: string | null };
function fail(code: string, status = 400): never { throw new WorkPackageDetailsError(code, status); }
function conflict(code: string): never { return fail(code, 409); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_REQUEST_BODY');
  return value as Record<string, unknown>;
}
function onlyKeys(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('UNKNOWN_REQUEST_FIELD');
}
function requiredText(value: unknown, code: string, max = 191): string {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  const result = value.trim();
  if (Array.from(result).length > max) fail(`${code}_TOO_LONG`);
  return result;
}
function optionalText(value: unknown, code: string, max = 191): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredText(value, code, max);
}
function expectedVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail('INVALID_EXPECTED_ROW_VERSION');
  return value;
}
function date(value: unknown, code: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(code);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(code);
  return value;
}
function decimalString(value: unknown, field: string, money: boolean): string {
  if (typeof value !== 'string' && typeof value !== 'number') fail(`INVALID_${field}`);
  const raw = String(value).trim();
  if (!raw || raw.length > 66 || !/^\d+(?:\.\d+)?$/.test(raw)) fail(`INVALID_${field}`);
  let parsed: Prisma.Decimal;
  try { parsed = new Prisma.Decimal(raw); } catch { return fail(`INVALID_${field}`); }
  if (!parsed.isFinite() || parsed.isNegative() || parsed.gt(Number.MAX_SAFE_INTEGER)) fail(`INVALID_${field}`);
  if (money && parsed.decimalPlaces() > 2) fail(`${field}_MAX_TWO_DECIMALS`);
  if (!money && parsed.decimalPlaces() > 30) fail(`${field}_MAX_30_DECIMALS`);
  const asFloat = Number(parsed.toString());
  if (!Number.isFinite(asFloat) || !new Prisma.Decimal(String(asFloat)).equals(parsed)) fail(`${field}_NOT_FLOAT_SAFE`);
  return parsed.toString();
}
function assertDetailLimit(details: PlanDetails) {
  if (details.locations.length > 500 || details.constraints.length > 500 || details.resources.length > 500 || Object.keys(details.allocationLocations).length > 500) conflict('PLAN_DETAILS_LIMIT_REACHED');
}
function detailsDocument(details: PlanDetails): string {
  assertDetailLimit(details);
  return JSON.stringify(details);
}
function makeId() { return randomUUID(); }

function applyBreakdown(details: PlanDetails, upload: PackageBreakdownUpload, body: Record<string, unknown>, actorId: string) {
  if (upload.appliedAt) conflict('This breakdown has already been applied. Existing or edited resource rows will not be imported again.');
  const reason = requiredText(body.reason, 'Explain how this upload relates to the existing package budget.', 500);
  if (reason.length < 5) fail('Add a reason of at least five characters.');
  const existing = details.resources.filter(row => row.activityId === upload.activityId);
  if (existing.length && body.acknowledgeExisting !== true) conflict('Review existing package costs, select any draft allowances to replace, and explicitly acknowledge the retained and uploaded rows.');
  const replacementIds = body.replaceResourceIds ?? [];
  if (!Array.isArray(replacementIds) || replacementIds.length > 500 || replacementIds.some(id => typeof id !== 'string') || new Set(replacementIds).size !== replacementIds.length) fail('Choose valid distinct draft resource rows to replace.');
  const replaced = existing.filter(row => replacementIds.includes(row.id));
  if (replaced.length !== replacementIds.length) conflict('A selected resource no longer belongs to this draft package. Refresh before applying the DUPA.');
  const retained = details.resources.filter(row => !replacementIds.includes(row.id));
  // Rows the user chose to leave out (e.g. after an AI Check suggestion); the original upload keeps every row.
  const excluded = body.excludeRows ?? [];
  if (!Array.isArray(excluded) || excluded.some(row => typeof row !== 'string' || !upload.rows.some(item => String(item.sourceRowNumber) === row))) fail('Choose valid DUPA rows to leave out.');
  const keptRows = upload.rows.filter(row => !excluded.includes(String(row.sourceRowNumber)));
  if (!keptRows.length) fail('Keep at least one DUPA row, or keep the generated allowances instead.');
  const keptCategories = body.categories && typeof body.categories === 'object' && !Array.isArray(body.categories)
    ? Object.fromEntries(Object.entries(body.categories as Record<string, unknown>).filter(([row]) => !excluded.includes(row)))
    : body.categories;
  let rows;
  try { rows = buildBreakdownResources(keptRows, keptCategories); }
  catch (error) { if (error instanceof PackageBreakdownError) fail(error.message, error.status); throw error; }
  if (retained.length + rows.length > 500) conflict('PLAN_DETAILS_LIMIT_REACHED');
  const fingerprints = new Set(retained.filter(row => row.activityId === upload.activityId).map(resourceFingerprint));
  for (const row of rows) {
    const fingerprint = resourceFingerprint(row);
    if (fingerprints.has(fingerprint)) conflict(`Duplicate resource component: ${row.description}. Review the current budget or retain the upload as evidence only.`);
    fingerprints.add(fingerprint);
  }
  const now = new Date().toISOString();
  const added = rows.map(row => ({ ...row, id: makeId(), activityId: upload.activityId, breakdownUploadId: upload.id,
    isSystemSuggested: true, reviewedAt: null, reviewedById: null }));
  upload.replacedResources = JSON.parse(JSON.stringify(replaced)) as PlanResource[];
  if (excluded.length) upload.excludedRows = excluded as string[];
  details.resources = [...retained, ...added];
  details.resourcesReviewNeeded = { ...details.resourcesReviewNeeded, [upload.activityId]: true };
  upload.appliedAt = now; upload.appliedById = actorId; upload.reason = reason;
  upload.categories = body.categories as Record<string, BreakdownKind>;
  upload.resourceIds = added.map(row => row.id);
}

/** Keep evidence and its package association inside the existing versioned plan document. */
export async function attachWorkPackageBreakdown(args: {
  projectId: string; scheduleId: string; activityId: string; expectedRowVersion: number; actor: Actor;
  buffer: Buffer; fileName: string; fileHash: string; selectedSheet: string; mapping: WorkspaceMapping;
  documentToken?: string | null;
}) {
  const capacity = await planningCapacity(args.actor, args.projectId);
  if (!capacity.canEditPlan) fail('PLANNING_EDIT_PERMISSION_REQUIRED', 403);
  const expected = expectedVersion(args.expectedRowVersion);
  if (!args.fileName || args.fileName.length > 191) fail('Use a workbook filename of at most 191 characters.');
  if (/\.(pdf|docx|txt|png|jpe?g|webp)$/i.test(args.fileName) && !args.documentToken) fail('Analyze the DUPA document before preserving it.');
  const { analysis, items } = await parseWorkspaceWorkbook({ buffer: args.buffer, fileName: args.fileName, selectedSheet: args.selectedSheet, mapping: args.mapping,
    documentToken: args.documentToken, documentContext: `dupa:${args.actor.id}:${args.projectId}:${args.scheduleId}:${args.activityId}` });
  if (analysis.fileHash !== args.fileHash) conflict('The workbook changed. Analyze it again before preserving the breakdown.');
  if (analysis.errors.length || !analysis.mapping || !analysis.selectedSheet || !items.length) fail(analysis.errors[0]?.message || 'Choose a worksheet and map the required columns before preserving it.');
  if (items.length > 500) fail('A package breakdown supports at most 500 component rows.');
  let stored: string | null = null;
  try {
    return await runTransaction(async tx => {
      const schedule = await loadEditableSchedule(tx, args.projectId, args.scheduleId);
      if (schedule.rowVersion !== expected) conflict('SCHEDULE_VERSION_CONFLICT');
      const activity = await tx.scheduleActivity.findFirst({ where: { id: args.activityId, scheduleId: args.scheduleId }, select: { id: true } });
      if (!activity) fail('The selected package does not belong to this project and plan.', 404);
      const details = readPlanDetails(schedule.description);
      const uploads = details.breakdownUploads ?? [];
      if (uploads.some(row => row.activityId === args.activityId && row.fileHash === analysis.fileHash && row.sheetName === analysis.selectedSheet)) conflict('This worksheet is already preserved for this package. Open its saved evidence instead of uploading it again.');
      if (uploads.length >= 20 || uploads.reduce((sum, row) => sum + row.rows.length, 0) + items.length > 500) conflict('This plan has reached its breakdown evidence limit (20 uploads / 500 component rows).');
      const uploadId = makeId();
      stored = await storeWorkspaceOriginal(uploadId, args.projectId, analysis.fileHash, args.buffer, args.fileName);
      const upload: PackageBreakdownUpload = { id: uploadId, activityId: args.activityId, fileName: args.fileName,
        fileHash: analysis.fileHash, storagePath: stored, sheetName: analysis.selectedSheet!, mapping: analysis.mapping!, rows: items,
        uploadedAt: new Date().toISOString(), uploadedById: args.actor.id, originScheduleId: schedule.id,
        appliedAt: null, appliedById: null, resourceIds: [], categories: {}, reason: null };
      details.breakdownUploads = [...uploads, upload];
      return bumpAndSave(tx, schedule, expected, args.actor, 'WPS_PACKAGE_BREAKDOWN_PRESERVED', details, null, { uploadId, activityId: args.activityId, fileHash: analysis.fileHash, rows: items.length });
    });
  } catch (error) {
    if (stored) await removeWorkspaceOriginal(stored);
    throw error;
  }
}

function runTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, async () => {
    try {
      return await prisma.$transaction((tx) => work(tx as unknown as Prisma.TransactionClient), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 15000,
        timeout: 30000,
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') conflict('SCHEDULE_VERSION_CONFLICT');
      throw error;
    }
  });
}

async function loadEditableSchedule(tx: Prisma.TransactionClient, projectId: string, scheduleId: string): Promise<DetailsSchedule> {
  const project = await tx.project.findUnique({ where: { id: projectId }, select: { id: true, status: true } });
  if (!project) fail('PROJECT_NOT_FOUND', 404);
  if (project.status === 'ARCHIVED') conflict('PROJECT_ARCHIVED');
  const schedule = await tx.projectSchedule.findFirst({ where: { id: scheduleId, projectId } });
  if (!schedule) fail('SCHEDULE_NOT_FOUND', 404);
  if (!EDITABLE.has(schedule.workflowStatus)) conflict('SCHEDULE_NOT_EDITABLE_IN_CURRENT_STATUS');
  if (schedule.generationRulesVersion !== WORKSPACE_KIND) conflict('SCHEDULE_NOT_IN_BOQ_WORKSPACE');
  return schedule;
}

async function bumpAndSave(tx: Prisma.TransactionClient, schedule: DetailsSchedule, expected: number, actor: Actor, action: string, details: PlanDetails, oldValue: unknown, newValue: unknown) {
  if (schedule.rowVersion !== expected) conflict('SCHEDULE_VERSION_CONFLICT');
  const nextDescription = detailsDocument(details);
  const result = await tx.projectSchedule.updateMany({
    where: { id: schedule.id, projectId: schedule.projectId, workflowStatus: schedule.workflowStatus, rowVersion: expected },
    data: { description: nextDescription, rowVersion: { increment: 1 } },
  });
  if (result.count !== 1) conflict('SCHEDULE_VERSION_CONFLICT');
  const current=await tx.projectSchedule.findFirst({where:{id:schedule.id,projectId:schedule.projectId},include:{activities:{include:{boqAllocations:true}}}});
  if(current)await assertWorkPackageExecutedScope(tx,schedule.projectId,current);
  await tx.auditLog.create({ data: {
    userId: actor.id, userRole: actor.role, moduleName: 'PROJECT_SCHEDULING', transactionId: schedule.id,
    actionType: action, oldValue: JSON.stringify(oldValue), newValue: JSON.stringify({ ...record(newValue), rowVersion: expected + 1 }),
  } });
  return { scheduleId: schedule.id, rowVersion: expected + 1, details };
}

function locationById(details: PlanDetails, id: string): PlanLocation {
  const location = details.locations.find((item) => item.id === id);
  if (!location) fail('LOCATION_NOT_FOUND', 404);
  return location;
}
function checkLocationParent(details: PlanDetails, locationId: string, parentId: string | null) {
  if (parentId === locationId) fail('LOCATION_PARENT_CYCLE');
  if (parentId) locationById(details, parentId);
  let cursor = parentId;
  const seen = new Set<string>([locationId]);
  while (cursor) {
    if (seen.has(cursor)) fail('LOCATION_PARENT_CYCLE');
    seen.add(cursor);
    cursor = details.locations.find((item) => item.id === cursor)?.parentId ?? null;
  }
}
function checkSiblingName(details: PlanDetails, name: string, parentId: string | null, exceptId?: string) {
  const normalized = name.normalize('NFKC').trim().toLocaleLowerCase();
  if (details.locations.some((item) => item.id !== exceptId && item.parentId === parentId && item.name.normalize('NFKC').trim().toLocaleLowerCase() === normalized)) conflict('LOCATION_NAME_ALREADY_EXISTS');
}

export async function updateWorkPackageDetails(args: { projectId: string; actor: Actor; body: unknown }) {
  const root = record(args.body);
  const rootFields = ['action', 'scheduleId', 'expectedRowVersion', 'fields'];
  if (Object.keys(root).some((key) => !rootFields.includes(key))) {
    // Flat command fields remain accepted for compatibility with early callers.
    if (root.fields !== undefined) fail('UNKNOWN_REQUEST_FIELD');
  }
  const body = root.fields === undefined
    ? root
    : { ...record(root.fields), action: root.action, scheduleId: root.scheduleId, expectedRowVersion: root.expectedRowVersion };
  const action = body.action;
  if (typeof action !== 'string') fail('ACTION_REQUIRED');
  if(['location','remove-location'].includes(action))fail('Manage project locations in the Locations module.',409);
  const allowed: Record<string, string[]> = {
    location: ['action', 'scheduleId', 'expectedRowVersion', 'id', 'name', 'parentId','code','type'],
    'remove-location': ['action', 'scheduleId', 'expectedRowVersion', 'id'],
    constraint: ['action', 'scheduleId', 'expectedRowVersion', 'id', 'activityId', 'description', 'ownerId', 'neededBy', 'blocking', 'status', 'resolution','type','title'],
    resource: ['action', 'scheduleId', 'expectedRowVersion', 'id', 'activityId', 'kind', 'description', 'unit', 'quantity', 'unitCost', 'amount'],
    'remove-resource': ['action', 'scheduleId', 'expectedRowVersion', 'id'],
    'allocation-location': ['action', 'scheduleId', 'expectedRowVersion', 'allocationId', 'locationId'],
    'suggest-resources': ['action', 'scheduleId', 'expectedRowVersion','activityId'],
    'confirm-resources': ['action','scheduleId','expectedRowVersion','activityId','activityIds'],
    'package-assumptions': ['action','scheduleId','expectedRowVersion','activityId','plannedStartDay','procurementLeadDays','laborCrew'],
    'apply-breakdown': ['action','scheduleId','expectedRowVersion','uploadId','categories','reason','acknowledgeExisting','replaceResourceIds','excludeRows'],
  };
  if (!allowed[action]) fail('UNKNOWN_ACTION');
  onlyKeys(body, allowed[action]!);
  const scheduleId = requiredText(body.scheduleId, 'SCHEDULE_ID_REQUIRED');
  const expected = expectedVersion(body.expectedRowVersion);
  const capacity = await planningCapacity(args.actor, args.projectId);
  if (!capacity.canEditPlan) fail('PLANNING_EDIT_PERMISSION_REQUIRED', 403);

  return runTransaction(async (tx) => {
    const schedule = await loadEditableSchedule(tx, args.projectId, scheduleId);
    if (schedule.rowVersion !== expected) conflict('SCHEDULE_VERSION_CONFLICT');
    let details: PlanDetails;
    try { details = readPlanDetails(schedule.description); }
    catch { conflict('PLAN_DETAILS_DOCUMENT_INVALID'); }
    if (action === 'apply-breakdown') {
      const upload = details.breakdownUploads?.find(entry => entry.id === body.uploadId);
      if (!upload) fail('Package breakdown not found.', 404);
      const activity = await tx.scheduleActivity.findFirst({ where: { id: upload.activityId, scheduleId }, select: { id: true } });
      if (!activity) fail('The uploaded breakdown does not belong to a package in this plan.', 409);
      applyBreakdown(details, upload, body, args.actor.id);
      return bumpAndSave(tx, schedule, expected, args.actor, 'WPS_PACKAGE_BREAKDOWN_APPLIED', details, { uploadId: upload.id, appliedAt: null, replacedResources: upload.replacedResources || [] }, { uploadId: upload.id, resourceIds: upload.resourceIds });
    }
    const before = JSON.parse(JSON.stringify(details)) as PlanDetails;
    const activities = await tx.scheduleActivity.findMany({ where: { scheduleId }, select: { id: true, name: true, allocatedAmount: true } });

    if(action==='package-assumptions'){
      const activityId=requiredText(body.activityId,'ACTIVITY_ID_REQUIRED');if(!activities.some(row=>row.id===activityId))fail('ACTIVITY_NOT_FOUND',404);
      const start=Number(body.plannedStartDay),lead=Number(body.procurementLeadDays);
      if(!Number.isInteger(start)||start<1||!Number.isInteger(lead)||lead<0||start>36500||lead>36500)fail('INVALID_PLANNING_OFFSETS');
      details.packageAssumptions={...details.packageAssumptions,[activityId]:{plannedStartDay:start,procurementLeadDays:lead,laborCrew:requiredText(body.laborCrew,'CREW_DESCRIPTION_REQUIRED',500)}};
      return bumpAndSave(tx,schedule,expected,args.actor,'WPS_PACKAGE_ASSUMPTIONS_UPDATED',details,before,{activityId});
    }
    if (action === 'location') {
      const id = optionalText(body.id, 'INVALID_LOCATION_ID');
      const existing = id ? details.locations.find((item) => item.id === id) : undefined;
      if (id && !existing) fail('LOCATION_NOT_FOUND', 404);
      const name = requiredText(body.name, 'LOCATION_NAME_REQUIRED');
      const parentId = optionalText(body.parentId, 'INVALID_PARENT_LOCATION_ID');
      const locationId = existing?.id ?? makeId();
      checkLocationParent(details, locationId, parentId);
      checkSiblingName(details, name, parentId, existing?.id);
      if(parentId&&locationById(details,parentId).isActive===false)fail('PARENT_LOCATION_ARCHIVED');
      const code=optionalText(body.code,'INVALID_LOCATION_CODE');
      if(code&&details.locations.some(row=>row.id!==locationId&&row.code?.toLocaleLowerCase()===code.toLocaleLowerCase()))conflict('LOCATION_CODE_ALREADY_EXISTS');
      const location: PlanLocation = { id: locationId, name, parentId,code:code||undefined,type:optionalText(body.type,'INVALID_LOCATION_TYPE')||undefined,isActive:existing?.isActive!==false };
      if (existing) details.locations = details.locations.map((item) => item.id === locationId ? location : item);
      else {
        if (details.locations.length >= 500) conflict('PLAN_DETAILS_LIMIT_REACHED');
        details.locations.push(location);
      }
      return bumpAndSave(tx, schedule, expected, args.actor, existing ? 'BOQ_WPS_LOCATION_UPDATED' : 'BOQ_WPS_LOCATION_CREATED', details, before, { location });
    }

    if (action === 'remove-location') {
      const id = requiredText(body.id, 'LOCATION_ID_REQUIRED');
      const location = locationById(details, id);
      const referencedByChild = details.locations.some((item) => item.parentId === id);
      const referencedByAllocation = Object.values(details.allocationLocations).includes(id);
      const locatedAllocations = await tx.scheduleBOQAllocation.findMany({ where: { scheduleId }, select: { id: true, activityId: true } });
      const locatedActivityIds = new Set(locatedAllocations.filter((item) => details.allocationLocations[item.id] === id).map((item) => item.activityId));
      const referencedByConstraint = details.constraints.some((item) => item.activityId !== null && locatedActivityIds.has(item.activityId));
      if (referencedByChild || referencedByAllocation || referencedByConstraint) conflict('LOCATION_IS_REFERENCED');
      location.isActive=false;
      return bumpAndSave(tx, schedule, expected, args.actor, 'BOQ_WPS_LOCATION_ARCHIVED', details, before, { location, archived: true });
    }

    if (action === 'constraint') {
      const id = optionalText(body.id, 'INVALID_CONSTRAINT_ID');
      const existing = id ? details.constraints.find((item) => item.id === id) : undefined;
      if (id && !existing) fail('CONSTRAINT_NOT_FOUND', 404);
      if (existing?.status === 'RESOLVED') conflict('RESOLVED_CONSTRAINT_IS_IMMUTABLE');
      const activityId = optionalText(body.activityId, 'INVALID_ACTIVITY_ID');
      if (!activityId || !activities.some((item) => item.id === activityId)) fail('ACTIVITY_NOT_FOUND', 404);
      const description = requiredText(body.description, 'CONSTRAINT_DESCRIPTION_REQUIRED', 10000);
      const ownerId = optionalText(body.ownerId, 'INVALID_CONSTRAINT_OWNER_ID');
      if (ownerId) {
        const assignment = await tx.projectUserAssignment.findUnique({ where: { userId_projectId: { userId: ownerId, projectId: args.projectId } }, select: { assignmentStatus: true } });
        if (!assignment || assignment.assignmentStatus.toLowerCase() !== 'active') fail('CONSTRAINT_OWNER_MUST_HAVE_ACTIVE_PROJECT_ASSIGNMENT');
      }
      const neededBy = date(body.neededBy, 'INVALID_NEEDED_BY_DATE');
      if (typeof body.blocking !== 'boolean') fail('INVALID_CONSTRAINT_BLOCKING');
      const status = body.status;
      if (status !== 'OPEN' && status !== 'RESOLVED') fail('INVALID_CONSTRAINT_STATUS');
      const resolution = optionalText(body.resolution, 'INVALID_CONSTRAINT_RESOLUTION', 10000);
      if (status === 'RESOLVED' && !resolution) fail('CONSTRAINT_RESOLUTION_REQUIRED');
      const type=body.type===undefined?'OTHER':String(body.type);if(!isConstraintType(type))fail('INVALID_CONSTRAINT_TYPE');
      const title=optionalText(body.title,'INVALID_CONSTRAINT_TITLE')||description.slice(0,191);
      if(status==='RESOLVED'&&(!resolution||resolution.length<3))fail('CONSTRAINT_RESOLUTION_REQUIRED');
      const constraint: PlanConstraint = { id: existing?.id ?? makeId(), activityId, description, ownerId, neededBy, blocking: body.blocking, status, resolution,type,title,
        resolvedAt:status==='RESOLVED'?new Date().toISOString():null,resolvedById:status==='RESOLVED'?args.actor.id:null };
      if (existing) details.constraints = details.constraints.map((item) => item.id === existing.id ? constraint : item);
      else {
        if (details.constraints.length >= 500) conflict('PLAN_DETAILS_LIMIT_REACHED');
        details.constraints.push(constraint);
      }
      const live=await recordDraftConstraint(tx,{projectId:args.projectId,scheduleId:schedule.id,constraint,sourcePackageId:activityId?(details.packageIdentities?.[activityId]||activityId):null,actorId:args.actor.id});
      details.constraints=mergeLiveConstraints(details,activities.map(row=>row.id),live);
      return bumpAndSave(tx, schedule, expected, args.actor, status === 'RESOLVED' ? 'BOQ_WPS_CONSTRAINT_RESOLVED' : existing ? 'BOQ_WPS_CONSTRAINT_UPDATED' : 'BOQ_WPS_CONSTRAINT_CREATED', details, before, { constraint });
    }

    if (action === 'resource') {
      const id = optionalText(body.id, 'INVALID_RESOURCE_ID');
      const existing = id ? details.resources.find((item) => item.id === id) : undefined;
      if (id && !existing) fail('RESOURCE_NOT_FOUND', 404);
      const activityId = optionalText(body.activityId, 'INVALID_ACTIVITY_ID');
      if (!activityId || !activities.some((item) => item.id === activityId)) fail('ACTIVITY_NOT_FOUND', 404);
      if (!['MATERIAL', 'LABOR', 'EQUIPMENT', 'ALLOWANCE'].includes(String(body.kind))) fail('INVALID_RESOURCE_KIND');
      const kind = body.kind as PlanResource['kind'];
      const description = requiredText(body.description, 'RESOURCE_DESCRIPTION_REQUIRED', 10000);
      const unit = requiredText(body.unit, 'RESOURCE_UNIT_REQUIRED');
      const q = decimalString(body.quantity, 'RESOURCE_QUANTITY', false);
      const unitCost = decimalString(body.unitCost, 'RESOURCE_UNIT_COST', true);
      const amount = new Prisma.Decimal(q).mul(unitCost).toDecimalPlaces(2).toFixed(2);
      const resource: PlanResource = { id: existing?.id ?? makeId(), activityId, kind, description, unit, quantity: q, unitCost, amount,isSystemSuggested:false,reviewedAt:new Date().toISOString(),reviewedById:args.actor.id };
      if (existing?.breakdownUploadId) { resource.breakdownUploadId = existing.breakdownUploadId; resource.sourceRowNumber = existing.sourceRowNumber; }
      if (existing) details.resources = details.resources.map((item) => item.id === existing.id ? resource : item);
      else {
        if (details.resources.length >= 500) conflict('PLAN_DETAILS_LIMIT_REACHED');
        details.resources.push(resource);
      }
      return bumpAndSave(tx, schedule, expected, args.actor, existing ? 'BOQ_WPS_RESOURCE_UPDATED' : 'BOQ_WPS_RESOURCE_CREATED', details, before, { resource });
    }

    if (action === 'remove-resource') {
      const id = requiredText(body.id, 'RESOURCE_ID_REQUIRED');
      const resource = details.resources.find((item) => item.id === id);
      if (!resource) fail('RESOURCE_NOT_FOUND', 404);
      details.resources = details.resources.filter((item) => item.id !== id);
      return bumpAndSave(tx, schedule, expected, args.actor, 'BOQ_WPS_RESOURCE_REMOVED', details, before, { resource, removed: true });
    }

    if (action === 'allocation-location') {
      const allocationId = requiredText(body.allocationId, 'ALLOCATION_ID_REQUIRED');
      const allocation = await tx.scheduleBOQAllocation.findFirst({ where: { id: allocationId, scheduleId }, select: { id: true,activityId:true,awardedBoqItemId:true } });
      if (!allocation) fail('ALLOCATION_NOT_FOUND', 404);
      const locationId = optionalText(body.locationId, 'INVALID_LOCATION_ID');
      if (locationId && locationById(details, locationId).isActive===false)fail('LOCATION_ARCHIVED');
      const oldLocationId = details.allocationLocations[allocationId] ?? null;
      const siblings=await tx.scheduleBOQAllocation.findMany({where:{scheduleId,activityId:allocation.activityId,awardedBoqItemId:allocation.awardedBoqItemId},select:{id:true}});
      if(siblings.some(row=>row.id!==allocationId&&(details.allocationLocations[row.id]||null)===locationId))conflict('ALLOCATION_LOCATION_ALREADY_EXISTS');
      if (locationId) details.allocationLocations[allocationId] = locationId;
      else delete details.allocationLocations[allocationId];
      const fullSchedule=await tx.projectSchedule.findFirst({where:{id:scheduleId},select:{previousBaselineId:true}});
      if(fullSchedule?.previousBaselineId)details.resourcesReviewNeeded={...details.resourcesReviewNeeded,[allocation.activityId]:true};
      return bumpAndSave(tx, schedule, expected, args.actor, 'BOQ_WPS_ALLOCATION_LOCATION_SET', details, before, { allocationId, oldLocationId, locationId });
    }

    if(action==='confirm-resources'){
      // One package (activityId) or several at once (activityIds, the step's "Confirm all"), in one save.
      if(body.activityIds!==undefined&&body.activityId!==undefined)fail('USE_ACTIVITY_ID_OR_ACTIVITY_IDS');
      const ids=body.activityIds!==undefined
        ?(Array.isArray(body.activityIds)&&body.activityIds.length>0&&body.activityIds.length<=500?[...new Set(body.activityIds.map(value=>requiredText(value,'ACTIVITY_ID_REQUIRED')))]:fail('INVALID_ACTIVITY_IDS'))
        :[requiredText(body.activityId,'ACTIVITY_ID_REQUIRED')];
      const reviewedAt=new Date().toISOString();
      const confirmed:PlanResource[]=[];
      for(const activityId of ids){
        if(!activities.some(row=>row.id===activityId))fail('ACTIVITY_NOT_FOUND',404);
        const resources=details.resources.filter(row=>row.activityId===activityId);
        if(!resources.length)fail('NO_RESOURCE_ALLOWANCES');
        for(const resource of resources){resource.isSystemSuggested=false;resource.reviewedAt=reviewedAt;resource.reviewedById=args.actor.id;}
        if(details.resourcesReviewNeeded)delete details.resourcesReviewNeeded[activityId];
        confirmed.push(...resources);
      }
      return bumpAndSave(tx,schedule,expected,args.actor,'WPS_ALLOWANCES_REVIEWED',details,before,ids.length===1?{activityId:ids[0],resources:confirmed}:{activityIds:ids,resources:confirmed});
    }
    if (!activities.length) conflict('SCHEDULE_ACTIVITIES_REQUIRED');
    const added: PlanResource[] = [];
    for (const activity of activities.filter(row=>!body.activityId||row.id===body.activityId)) {
      if(details.resources.some(row=>row.activityId===activity.id))continue;
      const budget=estimatePhPublicWorksBudget(Number(activity.allocatedAmount),activity.name);
      for(const [kind,value]of [['MATERIAL',budget.materials],['LABOR',budget.labor],['EQUIPMENT',budget.equipment]] as const){
        const amount=new Prisma.Decimal(value).toDecimalPlaces(2).toFixed(2);
        added.push({id:makeId(),activityId:activity.id,kind,description:`Suggested ${kind.toLowerCase()} allowance for ${activity.name}`,unit:'lot',quantity:'1',unitCost:amount,amount,isSystemSuggested:true});
      }
    }
    if (details.resources.length + added.length > 500) conflict('PLAN_DETAILS_LIMIT_REACHED');
    details.resources.push(...added);
    return bumpAndSave(tx, schedule, expected, args.actor, 'BOQ_WPS_ALLOWANCES_SUGGESTED', details, before, { resources: added });
  });
}

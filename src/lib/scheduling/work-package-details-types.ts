import type { PackageBreakdownUpload } from './package-breakdown';
export const WORK_PACKAGE_DETAILS_KIND = 'BOQ_WPS_WORKSPACE_V1' as const;
export const MAX_PLAN_DETAIL_ENTRIES = 500;

export type PlanLocation = {
  id: string;
  name: string;
  parentId: string | null;
  code?: string;
  type?: string;
  isActive?: boolean;
};

export type PlanConstraint = {
  id: string;
  activityId: string | null;
  description: string;
  ownerId: string | null;
  neededBy: string | null;
  blocking: boolean;
  status: 'OPEN' | 'RESOLVED';
  resolution: string | null;
  type?: string;
  title?: string;
  resolvedAt?: string | null;
  resolvedById?: string | null;
};

export type PlanResource = {
  id: string;
  activityId: string | null;
  kind: 'MATERIAL' | 'LABOR' | 'EQUIPMENT' | 'ALLOWANCE';
  description: string;
  unit: string;
  quantity: string;
  unitCost: string;
  amount: string;
  isSystemSuggested?: boolean;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  breakdownUploadId?: string;
  sourceRowNumber?: number;
};

export type WorkPackagePlanDetails = {
  kind: typeof WORK_PACKAGE_DETAILS_KIND;
  legacyNote?: string;
  locations: PlanLocation[];
  constraints: PlanConstraint[];
  resources: PlanResource[];
  allocationLocations: Record<string, string>;
  packageIdentities?: Record<string,string>;
  resourcesReviewNeeded?: Record<string,boolean>;
  packageAssumptions?: Record<string,{plannedStartDay:number;procurementLeadDays:number;laborCrew:string}>;
  breakdownUploads?: PackageBreakdownUpload[];
};
export type PlanDetails = WorkPackagePlanDetails;

export class PlanDetailsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanDetailsParseError';
  }
}

export function emptyWorkPackagePlanDetails(legacyNote?: string | null): WorkPackagePlanDetails {
  return {
    kind: WORK_PACKAGE_DETAILS_KIND,
    ...(legacyNote ? { legacyNote } : {}),
    locations: [],
    constraints: [],
    resources: [],
    allocationLocations: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new PlanDetailsParseError(`Invalid plan details: ${field} must be nonempty text.`);
  return value;
}

/** Parse workspace metadata; preserve unrelated legacy schedule descriptions. */
export function readWorkPackagePlanDetails(raw: string | null | undefined): WorkPackagePlanDetails {
  if (raw == null || raw === '') return emptyWorkPackagePlanDetails();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyWorkPackagePlanDetails(raw);
  }
  if (!isRecord(parsed) || parsed.kind !== WORK_PACKAGE_DETAILS_KIND) return emptyWorkPackagePlanDetails(raw);
  if (!Array.isArray(parsed.locations) || !Array.isArray(parsed.constraints) || !Array.isArray(parsed.resources) || !isRecord(parsed.allocationLocations)) {
    throw new PlanDetailsParseError('Invalid BOQ Work Packages plan details document.');
  }
  if (parsed.locations.length > MAX_PLAN_DETAIL_ENTRIES || parsed.constraints.length > MAX_PLAN_DETAIL_ENTRIES || parsed.resources.length > MAX_PLAN_DETAIL_ENTRIES || Object.keys(parsed.allocationLocations).length > MAX_PLAN_DETAIL_ENTRIES) {
    throw new PlanDetailsParseError('BOQ Work Packages plan details exceed the supported entry limit.');
  }
  const locations = parsed.locations.map((value): PlanLocation => {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.parentId !== 'string' && value.parentId !== null) throw new PlanDetailsParseError('Invalid BOQ Work Packages location record.');
    return { id: requiredText(value.id, 'location.id'), name: requiredText(value.name, 'location.name'), parentId: value.parentId,
      ...(typeof value.code==='string'?{code:value.code}:{}),...(typeof value.type==='string'?{type:value.type}:{}),isActive:value.isActive!==false };
  });
  const constraints = parsed.constraints.map((value): PlanConstraint => {
    if (!isRecord(value) || typeof value.id !== 'string' || value.activityId !== null && typeof value.activityId !== 'string' || value.ownerId !== null && typeof value.ownerId !== 'string' || value.neededBy !== null && typeof value.neededBy !== 'string' || typeof value.blocking !== 'boolean' || value.status !== 'OPEN' && value.status !== 'RESOLVED' || value.resolution !== null && typeof value.resolution !== 'string') throw new PlanDetailsParseError('Invalid BOQ Work Packages constraint record.');
    return {
      id: requiredText(value.id, 'constraint.id'),
      activityId: value.activityId as string | null,
      description: requiredText(value.description, 'constraint.description'),
      ownerId: value.ownerId as string | null,
      neededBy: value.neededBy as string | null,
      blocking: value.blocking,
      status: value.status,
      resolution: value.resolution as string | null,
      ...(typeof value.type==='string'?{type:value.type}:{}),...(typeof value.title==='string'?{title:value.title}:{}),
      resolvedAt: typeof value.resolvedAt==='string'?value.resolvedAt:null,
      resolvedById: typeof value.resolvedById==='string'?value.resolvedById:null,
    };
  });
  const resources = parsed.resources.map((value): PlanResource => {
    if (!isRecord(value) || typeof value.id !== 'string' || value.activityId !== null && typeof value.activityId !== 'string' || !['MATERIAL', 'LABOR', 'EQUIPMENT', 'ALLOWANCE'].includes(String(value.kind)) || typeof value.unit !== 'string' || typeof value.quantity !== 'string' || typeof value.unitCost !== 'string' || typeof value.amount !== 'string') throw new PlanDetailsParseError('Invalid BOQ Work Packages resource record.');
    return {
      id: requiredText(value.id, 'resource.id'),
      activityId: value.activityId as string | null,
      kind: value.kind as PlanResource['kind'],
      description: requiredText(value.description, 'resource.description'),
      unit: value.unit,
      quantity: value.quantity,
      unitCost: value.unitCost,
      amount: value.amount,
      isSystemSuggested:value.isSystemSuggested===true,
      reviewedAt:typeof value.reviewedAt==='string'?value.reviewedAt:null,
      reviewedById:typeof value.reviewedById==='string'?value.reviewedById:null,
      ...(typeof value.breakdownUploadId === 'string' ? { breakdownUploadId: value.breakdownUploadId } : {}),
      ...(Number.isSafeInteger(value.sourceRowNumber) ? { sourceRowNumber: Number(value.sourceRowNumber) } : {}),
    };
  });
  const allocationLocations: Record<string, string> = {};
  for (const [allocationId, locationId] of Object.entries(parsed.allocationLocations)) {
    if (!allocationId || typeof locationId !== 'string' || !locationId) throw new PlanDetailsParseError('Invalid allocation location mapping.');
    allocationLocations[allocationId] = locationId;
  }
  if (parsed.legacyNote !== undefined && typeof parsed.legacyNote !== 'string') throw new PlanDetailsParseError('Invalid legacy schedule note.');
  const breakdownUploads = parsed.breakdownUploads ?? [];
  if (!Array.isArray(breakdownUploads) || breakdownUploads.length > 20 || breakdownUploads.some(value =>
    !isRecord(value) || typeof value.id !== 'string' || typeof value.activityId !== 'string'
    || typeof value.fileName !== 'string' || typeof value.storagePath !== 'string'
    || typeof value.fileHash !== 'string' || !/^[a-f\d]{64}$/.test(value.fileHash)
    || typeof value.sheetName !== 'string' || !isRecord(value.mapping)
    || typeof value.uploadedAt !== 'string' || typeof value.uploadedById !== 'string' || typeof value.originScheduleId !== 'string'
    || !Array.isArray(value.rows) || !value.rows.length || value.rows.length > 500
    || value.rows.some(row => !isRecord(row) || !Number.isSafeInteger(row.sourceRowNumber) || typeof row.description !== 'string' || typeof row.amount !== 'number' || typeof row.quantity !== 'number' || typeof row.unitCost !== 'number' || typeof row.unit !== 'string')
    || !Array.isArray(value.resourceIds) || value.resourceIds.some(id => typeof id !== 'string') || !isRecord(value.categories)
    || (value.replacedResources !== undefined && (!Array.isArray(value.replacedResources) || value.replacedResources.length > 500 || value.replacedResources.some(row => !isRecord(row) || typeof row.id !== 'string' || typeof row.description !== 'string' || typeof row.quantity !== 'string' || typeof row.amount !== 'string')))
    || (value.appliedAt !== null && typeof value.appliedAt !== 'string') || (value.appliedById !== null && typeof value.appliedById !== 'string')
    || (value.reason !== null && typeof value.reason !== 'string'))
    || breakdownUploads.reduce((sum, value) => sum + value.rows.length, 0) > 500) {
    throw new PlanDetailsParseError('Invalid package breakdown evidence.');
  }
  return {
    kind: WORK_PACKAGE_DETAILS_KIND,
    ...(typeof parsed.legacyNote === 'string' ? { legacyNote: parsed.legacyNote } : {}),
    locations,
    constraints,
    resources,
    allocationLocations,
    breakdownUploads: breakdownUploads as PackageBreakdownUpload[],
    packageIdentities: Object.fromEntries(Object.entries(isRecord(parsed.packageIdentities)?parsed.packageIdentities:{}).map(([key,value])=>[key,requiredText(value,'packageIdentity')])),
    resourcesReviewNeeded: Object.fromEntries(Object.entries(isRecord(parsed.resourcesReviewNeeded)?parsed.resourcesReviewNeeded:{}).map(([key,value])=>[key,value===true])),
    packageAssumptions: Object.fromEntries(Object.entries(isRecord(parsed.packageAssumptions)?parsed.packageAssumptions:{}).map(([key,value])=>{
      if(!isRecord(value)||!Number.isInteger(value.plannedStartDay)||!Number.isInteger(value.procurementLeadDays)||typeof value.laborCrew!=='string')throw new PlanDetailsParseError('Invalid package planning assumptions.');
      return[key,{plannedStartDay:Number(value.plannedStartDay),procurementLeadDays:Number(value.procurementLeadDays),laborCrew:value.laborCrew}];
    })),
  };
}

/** Backward-compatible names for the original implementation call sites. */
export const emptyPlanDetails = emptyWorkPackagePlanDetails;
export const readPlanDetails = readWorkPackagePlanDetails;

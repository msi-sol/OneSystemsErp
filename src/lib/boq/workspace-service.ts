import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Prisma } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { getPermissionsForRole, hasPermission } from '@/lib/permissions';
import { BOQ_CANONICALIZATION_VERSION } from '@/lib/boq/canonical-checksum';
import { buildDraftBOQChecksum, type DraftBOQLine } from '@/lib/boq/draft-workflow';
import { createBOQReviewDocument, type BOQSourceRow } from '@/lib/boq/review-state';
import { buildWorkspaceBOQFindings } from '@/lib/boq/workspace-findings';
import { readStoredUpload, uploadBucket, uploadStorageClient } from '@/lib/s3';
import { parseWorkspaceWorkbook } from './workspace-parser';
import { WorkspaceError, type WorkspaceAnalysis, type WorkspaceBreakdownMapping } from './workspace-types';

type WorkspaceActor = { id: string; role: string; name?: string | null };
type ConfirmWorkspaceInput = {
  actor: WorkspaceActor;
  buffer: Buffer;
  fileName: string;
  expectedFileHash: string;
  selectedSheet: string;
  mapping: NonNullable<WorkspaceAnalysis['mapping']>;
  breakdownMapping?: WorkspaceBreakdownMapping | null;
  projectId: string | null;
  projectName: string;
  projectContractAmount?: unknown;
};

const STORAGE_DIR = path.join('.runtime', 'boq-workspace');
function localOriginalPath(storagePath:string):string {
  const normalized=storagePath.replaceAll('\\','/');
  if(/^retained:boq-workspace\/[A-Za-z0-9-]+\.xlsx$/.test(normalized)) {
    // The release directory is read-only; uploads is linked to retained writable storage.
    return path.join(process.cwd(),'uploads','.boq-workspace',path.basename(normalized));
  }
  if(!/^\.runtime\/boq-workspace\/[A-Za-z0-9-]+\.xlsx$/.test(normalized))throw new WorkspaceError('The original workbook path is invalid.',404);
  return path.join(process.cwd(),'.runtime','boq-workspace',path.basename(normalized));
}
// Accept the existing backend BOQ upload setting as well as the frontend alias.
const s3Bucket = uploadBucket;
const getS3Client = uploadStorageClient;

function cloudStorageConfigured(): boolean {
  // Never let a copied production setting send local/demo files to the live bucket.
  return process.env.NODE_ENV === 'production';
}

function projectRoleAllows(rolePermissions: Record<string, Record<string, boolean> | undefined>, actions: string[]): boolean {
  const permissions = rolePermissions.PROJECT_MANAGEMENT;
  return Boolean(permissions && actions.some(action => permissions[action]));
}

export async function actorCanAccessProject(actor: WorkspaceActor, projectId: string, actions: string[]): Promise<boolean> {
  for (const action of actions) {
    if (await hasPermission(actor.id, 'PROJECT_MANAGEMENT', action)) return true;
  }
  const assignment = await prisma.projectUserAssignment.findUnique({
    where: { userId_projectId: { userId: actor.id, projectId } },
    select: { assignmentStatus: true, projectRole: true },
  });
  if (!assignment || assignment.assignmentStatus.toLowerCase() !== 'active') return false;
  const rolePermissions = await getPermissionsForRole(assignment.projectRole);
  return projectRoleAllows(rolePermissions as Record<string, Record<string, boolean> | undefined>, actions);
}

export async function authorizeWorkspaceAnalyze(actor: WorkspaceActor, projectId?: string | null): Promise<void> {
  if (projectId) {
    if (!await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } })) {
      throw new WorkspaceError('Project not found.', 404);
    }
    if (!await actorCanAccessProject(actor, projectId, ['canEdit', 'canEditDraft'])) {
      throw new WorkspaceError('You do not have permission to analyze a BOQ for this project.', 403);
    }
    return;
  }

  for (const action of ['canCreate', 'canEdit', 'canEditDraft']) {
    if (await hasPermission(actor.id, 'PROJECT_MANAGEMENT', action)) return;
  }
  const assignments = await prisma.projectUserAssignment.findMany({
    where: { userId: actor.id, assignmentStatus: 'active' },
    select: { projectRole: true },
  });
  for (const assignment of assignments) {
    const permissions = await getPermissionsForRole(assignment.projectRole);
    if (projectRoleAllows(permissions as Record<string, Record<string, boolean> | undefined>, ['canEdit', 'canEditDraft'])) return;
  }
  throw new WorkspaceError('You do not have permission to analyze BOQ workbooks.', 403);
}

async function authorizeConfirm(actor: WorkspaceActor, projectId: string | null): Promise<void> {
  if (!projectId) {
    if (!await hasPermission(actor.id, 'PROJECT_MANAGEMENT', 'canCreate')) {
      throw new WorkspaceError('You do not have permission to create a project.', 403);
    }
    return;
  }
  if (!await actorCanAccessProject(actor, projectId, ['canEdit', 'canEditDraft'])) {
    throw new WorkspaceError('You do not have permission to edit this project BOQ.', 403);
  }
}

function makeIdempotencyKey(input: ConfirmWorkspaceInput, analysis: WorkspaceAnalysis): string {
  const projectKey = input.projectId ?? `new:${input.projectName.trim().toLocaleLowerCase()}`;
  return createHash('sha256').update(JSON.stringify([
    analysis.fileHash,
    input.actor.id,
    projectKey,
    analysis.selectedSheet,
    analysis.mapping,
    analysis.breakdownMapping,
  ])).digest('hex');
}

/** Validate the signed contract candidate without treating a BOQ difference as an import error. */
export function parseWorkspaceContractCandidate(value: unknown): Prisma.Decimal {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
    throw new WorkspaceError('Enter the signed contract value before creating a project.', 400);
  }
  const amount = new Prisma.Decimal(value.trim());
  if (!amount.isFinite() || amount.lte(0) || amount.gt(Number.MAX_SAFE_INTEGER)) {
    throw new WorkspaceError('The signed contract value must be a positive safe amount.', 400);
  }
  return amount;
}

export async function storeWorkspaceOriginal(uploadId: string, projectId: string, fileHash: string, buffer: Buffer): Promise<string> {
  if (cloudStorageConfigured()) {
    const key = `boq-workspace/${projectId}/${uploadId}-${fileHash}.xlsx`;
    await getS3Client().send(new PutObjectCommand({
      Bucket: s3Bucket(),
      Key: key,
      Body: buffer,
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }));
    return `s3:${key}`;
  }
  const relativePath = path.join(STORAGE_DIR, `${uploadId}.xlsx`);
  const absolutePath = localOriginalPath(relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(absolutePath, buffer, { flag: 'wx', mode: 0o600 });
  return relativePath.replace(/\\/g, '/');
}

export async function removeWorkspaceOriginal(storagePath: string): Promise<void> {
  try {
    if (storagePath.startsWith('s3:')) {
      await getS3Client().send(new DeleteObjectCommand({ Bucket: s3Bucket(), Key: storagePath.slice(3) }));
    } else {
      await fs.unlink(localOriginalPath(storagePath));
    }
  } catch {
    // Cleanup is best effort; storage paths are unique and the failed transaction is not exposed.
  }
}

function readExistingIdempotency(upload: { id: string; projectId: string; commitStatus: string; metadataJson: string | null }, key: string) {
  if (!upload.metadataJson) return null;
  try {
    const metadata = JSON.parse(upload.metadataJson) as {
      idempotencyKey?: string;
      report?: unknown;
      status?: string;
      draftVersionId?: string;
      draftChecksum?: string;
    };
    if (metadata.idempotencyKey !== key) return null;
    return {
      success: true as const,
      uploadId: upload.id,
      projectId: upload.projectId,
      versionId: metadata.draftVersionId,
      checksum: metadata.draftChecksum,
      status: metadata.status ?? 'DRAFT_UPLOADED',
      report: metadata.report ?? {},
      alreadyConfirmed: true,
    };
  } catch {
    return null;
  }
}

export async function confirmBOQWorkspaceUpload(input: ConfirmWorkspaceInput) {
  if (!input.fileName || Array.from(input.fileName).length > 191) throw new WorkspaceError('The workbook filename must be 191 characters or fewer.', 400);
  if (input.projectName && Array.from(input.projectName.trim()).length > 191) throw new WorkspaceError('The project name must be 191 characters or fewer.', 400);

  await authorizeConfirm(input.actor, input.projectId);
  const { analysis, items } = await parseWorkspaceWorkbook({
    buffer: input.buffer,
    fileName: input.fileName,
    selectedSheet: input.selectedSheet,
    mapping: input.mapping,
  breakdownMapping: input.breakdownMapping,
  });
  if (analysis.fileHash !== input.expectedFileHash) throw new WorkspaceError('The workbook changed after analysis. Analyze it again before confirming.', 409);
  if (analysis.errors.length) throw new WorkspaceError('Correct the workbook errors before confirming the BOQ.', 400);
  if (!items.length) throw new WorkspaceError('The workbook contains no valid BOQ items.', 400);
  if (!input.projectId && !input.projectName.trim()) throw new WorkspaceError('Enter a name for the new project.', 400);
  await authorizeConfirm(input.actor, input.projectId);

  const total = new Prisma.Decimal(analysis.total);
  if (!total.isFinite() || total.lte(0) || total.gt(Number.MAX_SAFE_INTEGER)) throw new WorkspaceError('The BOQ total must be a positive safe amount.', 400);
  let enteredContract: Prisma.Decimal | null = null;
  if (!input.projectId) {
    enteredContract = parseWorkspaceContractCandidate(input.projectContractAmount);
  }
  const idempotencyKey = makeIdempotencyKey(input, analysis);
  let storedPath: string | null = null;

  try {
    const result = await prisma.$transaction(async tx => {
      const priorUploads = await tx.uploadedWorkbookFile.findMany({
        where: { fileHash: analysis.fileHash, uploadedBy: input.actor.id },
        select: { id: true, projectId: true, commitStatus: true, metadataJson: true },
      });
      for (const prior of priorUploads) {
        const existing = readExistingIdempotency(prior, idempotencyKey);
        if (existing) return existing;
      }

      let projectId = input.projectId;
      if (projectId) {
        const project = await tx.project.findUnique({ where: { id: projectId } });
        if (!project) throw new WorkspaceError('Project not found.', 404);
        if (project.boqLocked || await tx.awardedBOQItem.count({ where: { projectId } }) > 0 || await tx.projectBOQVersion.count({ where: { projectId } }) > 0) {
          throw new WorkspaceError('This project already has an awarded or locked BOQ. Start a revision through its existing workflow.', 409);
        }
        if (project.contractAmount === null || !Number.isFinite(project.contractAmount) || project.contractAmount <= 0 || project.contractAmount > Number.MAX_SAFE_INTEGER) {
          throw new WorkspaceError('The project must have a positive safe contract amount before importing a BOQ draft.', 400);
        }
      } else {
        const project = await tx.project.create({
          data: {
            name: input.projectName.trim(),
            status: 'PLANNING',
            contractAmount: enteredContract!.toNumber(),
            description: 'Project created from a draft BOQ workspace upload.',
          },
          select: { id: true },
        });
        projectId = project.id;
      }

      const uploadId = randomUUID();
      storedPath = await storeWorkspaceOriginal(uploadId, projectId, analysis.fileHash, input.buffer);
      const originalUrl = `/api/boq-workspace/uploads/${uploadId}/original`;
      const warningRows = new Set(analysis.warnings.map(entry => String(entry.row))).size;
      const report = {
        fileName: input.fileName,
        fileUrl: originalUrl,
        itemCount: items.length,
        validRowsCount: items.length,
        errorRowsCount: 0,
        warningRowsCount: warningRows,
        grandTotal: analysis.total,
        errors: [],
        warnings: analysis.warnings,
      };
      const metadata = {
        source: 'BOQ_WORKSPACE',
        status: 'DRAFT_UPLOADED',
        idempotencyKey,
        report,
        sheetName: analysis.selectedSheet,
        fileHash: analysis.fileHash,
        mapping: analysis.mapping,
        breakdownMapping: analysis.breakdownMapping,
      };
      const metadataJson = JSON.stringify(metadata);

      await tx.uploadedWorkbookFile.create({
        data: {
          id: uploadId,
          projectId,
          templateCode: 'BOQ_WORKSPACE',
          templateName: 'BOQ Workspace Import',
          documentType: 'BOQ',
          originalFilename: input.fileName,
          fileHash: analysis.fileHash,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileSize: input.buffer.byteLength,
          storagePath: storedPath,
          preservedOriginalUrl: originalUrl,
          uploadedBy: input.actor.id,
          validationStatus: 'SUCCESS',
          extractionStatus: 'SUCCESS',
          commitStatus: 'PENDING',
          recognizedTemplate: 'BOQ_WORKSPACE',
          metadataJson,
        },
      });

      const sectionKeys = [...new Set(items.map(item => item.sectionSourceKey))];
      const sectionIds = new Map<string, { id: string; name: string; order: number }>();
      for (const sectionKey of sectionKeys) {
        const firstItem = items.find(item => item.sectionSourceKey === sectionKey);
        if (!firstItem) continue;
        const section = await tx.bOQExtractedSection.create({
          data: {
            uploadedWorkbookFileId: uploadId,
            projectId,
            sheetName: analysis.selectedSheet,
            sourceRowNumber: firstItem.sectionStartRow ?? firstItem.sourceRowNumber ?? analysis.mapping?.headerRow ?? null,
            sectionName: firstItem.section,
            displayOrder: firstItem.sectionOrder,
          },
          select: { id: true },
        });
        sectionIds.set(sectionKey, { id: section.id, name: firstItem.section, order: firstItem.sectionOrder });
      }
      await tx.bOQExtractedItem.createMany({
        data: items.map(item => ({
          uploadedWorkbookFileId: uploadId,
          projectId,
          sectionId: sectionIds.get(item.sectionSourceKey)!.id,
          sheetName: analysis.selectedSheet,
          sourceRowNumber: item.sourceRowNumber,
          itemNumber: item.itemCode || null,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unitCost: item.unitCost,
          amount: item.amount,
          materialUnitCost: item.materialUnitCost ?? null,
          laborUnitCost: item.laborUnitCost ?? null,
          equipmentUnitCost: item.equipmentUnitCost ?? null,
          totalDirectCost: item.totalDirectCost ?? null,
          ocm: item.ocm ?? null,
          cp: item.cp ?? null,
          vat: item.vat ?? null,
          totalIndirectCost: item.totalIndirectCost ?? null,
          percentage: item.percentage ?? null,
          validationStatus: 'SUCCESS',
          validationErrorsJson: '[]',
        })),
      });

      const awardedItems: DraftBOQLine[] = [];
      const sectionIdentityByItemId: Record<string, { id: string; name: string; order: number }> = {};
      for (const item of items) {
        const awardedItem = await tx.awardedBOQItem.create({ data: {
          projectId,
          itemCode: item.itemCode || `ROW-${item.sourceRowNumber}`,
          category: item.section,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          directCost: item.totalDirectCost ?? 0,
          indirectCost: item.totalIndirectCost ?? 0,
          combinedUnitCost: item.unitCost,
          totalCost: item.amount,
          status: 'DRAFT',
          remainingQuantity: item.quantity,
          balanceAmount: item.amount,
          revisedContractQuantity: item.quantity,
          revisedContractUnitPrice: item.unitCost,
          revisedContractAmount: item.amount,
        } });
        awardedItems.push(awardedItem);
        const identity = sectionIds.get(item.sectionSourceKey);
        if (identity) sectionIdentityByItemId[awardedItem.id] = identity;
      }
      const checksum = buildDraftBOQChecksum(awardedItems);
      const version = await tx.projectBOQVersion.create({
        data: {
          projectId,
          sourceUploadedWorkbookFileId: uploadId,
          versionNumber: 1,
          versionLabel: 'Draft BOQ Workspace Import',
          status: 'DRAFT',
          committedBy: input.actor.id,
          committedAt: new Date(),
          totalDirectCost: items.reduce((sum, item) => sum + (item.totalDirectCost ?? 0), 0),
          totalIndirectCost: items.reduce((sum, item) => sum + (item.totalIndirectCost ?? 0), 0),
          totalAmount: total.toNumber(),
          checksum,
          checksumAlgorithm: 'SHA-256',
          checksumVersion: BOQ_CANONICALIZATION_VERSION,
          sourceProvenance: 'BOQ_WORKSPACE',
          remarks: 'Editable draft created from a confirmed BOQ Workspace workbook; not approved or locked.',
        },
        select: { id: true },
      });
      const sourceRows: BOQSourceRow[] = items.map((item, index) => ({
        sourceRowNumber: item.sourceRowNumber,
        section: item.section,
        sectionSourceKey: item.sectionSourceKey,
        sectionOrder: item.sectionOrder,
        sectionStartRow: item.sectionStartRow,
        itemCode: item.itemCode,
        itemId: awardedItems[index]?.id ?? null,
        description: item.description,
        unit: item.unit,
        quantity: String(item.quantity),
        unitCost: String(item.unitCost),
        sourceUnitCost: item.sourceUnitCost === null ? null : String(item.sourceUnitCost),
        rateDerived: item.rateDerived,
        quantityDefaulted: item.quantityDefaulted,
        unitDefaulted: item.unitDefaulted,
        itemCodeSynthesized: item.itemCodeSynthesized,
        amount: String(item.amount),
        breakdown: {
          materialUnitCost: item.materialUnitCost == null ? null : String(item.materialUnitCost),
          laborUnitCost: item.laborUnitCost == null ? null : String(item.laborUnitCost),
          equipmentUnitCost: item.equipmentUnitCost == null ? null : String(item.equipmentUnitCost),
          totalDirectCost: item.totalDirectCost == null ? null : String(item.totalDirectCost),
          ocm: item.ocm == null ? null : String(item.ocm),
          cp: item.cp == null ? null : String(item.cp),
          vat: item.vat == null ? null : String(item.vat),
          totalIndirectCost: item.totalIndirectCost == null ? null : String(item.totalIndirectCost),
          percentage: item.percentage == null ? null : String(item.percentage),
        },
      }));
      const itemIdsBySourceRow = Object.fromEntries(items.map((item, index) => [item.sourceRowNumber, awardedItems[index]?.id ?? '']));
      const findings = buildWorkspaceBOQFindings(items, { printedTotal: analysis.printedTotal, itemIdsBySourceRow, sheetName: analysis.selectedSheet });
      const reviewDocument = createBOQReviewDocument({
        projectId,
        versionId: version.id,
        uploadId,
        fileName: input.fileName,
        fileHash: analysis.fileHash,
        selectedSheet: analysis.selectedSheet ?? input.selectedSheet,
        mapping: analysis.mapping ?? input.mapping,
        breakdownMapping: analysis.breakdownMapping ?? input.breakdownMapping ?? {},
        rows: sourceRows,
        sectionIdentityByItemId,
        findings,
      });
      await tx.bOQReviewState.create({ data: { projectId, versionId: version.id, dataJson: JSON.stringify(reviewDocument) } });
      await tx.uploadedWorkbookFile.update({
        where: { id: uploadId },
        data: { metadataJson: JSON.stringify({ ...metadata, draftVersionId: version.id, draftChecksum: checksum }) },
      });
      await tx.workbookExtractionAudit.create({
        data: {
          uploadedWorkbookFileId: uploadId,
          projectId,
          action: 'BOQ_WORKSPACE_DRAFT_CREATED',
          status: 'SUCCESS',
          message: `Created ${items.length} editable draft BOQ items for review.`,
          detailsJson: JSON.stringify({ itemCount: items.length, total: analysis.total, fileHash: analysis.fileHash }),
          performedBy: input.actor.id,
          performedByRole: input.actor.role,
        },
      });

      return { success: true as const, uploadId, projectId, versionId: version.id, checksum, status: 'DRAFT_UPLOADED', report };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15000, timeout: 120000 });
    if ('alreadyConfirmed' in result) {
      if (storedPath) await removeWorkspaceOriginal(storedPath);
      storedPath = null;
    }
    return result;
  } catch (error) {
    if (storedPath) await removeWorkspaceOriginal(storedPath);
    if (error instanceof WorkspaceError) throw error;
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : null;
    const name = error instanceof Error ? error.name : 'UnknownError';
    console.error('BOQ workspace draft save failed', { code, name });
    if (['AccessDenied', 'NoSuchBucket', 'InvalidAccessKeyId', 'SignatureDoesNotMatch', 'ExpiredToken', 'CredentialsProviderError', 'PermanentRedirect', 'AuthorizationHeaderMalformed'].includes(name)) {
      throw new WorkspaceError('The workbook could not be saved to S3. Please ask your administrator to check the BOQ bucket configuration and upload permissions; no draft BOQ was saved.', 503);
    }
    if (code === 'EROFS' || code === 'EACCES' || code === 'ENOSPC') {
      throw new WorkspaceError('The original workbook could not be preserved in server storage. Please contact your administrator; no draft BOQ was saved.', 503);
    }
    if (code === 'P2034') throw new WorkspaceError('The project changed while saving. Refresh and confirm the BOQ again.', 409);
    if (code === 'P2028') throw new WorkspaceError('Saving the BOQ took too long. Please confirm it again; the incomplete draft was rolled back.', 503);
    throw new WorkspaceError('The draft BOQ could not be saved. Please try again.', 500);
  }
}

export async function readWorkspaceOriginal(storagePath: string): Promise<Buffer> {
  if (storagePath.startsWith('s3:')) {
    return readStoredUpload(storagePath);
  }
  const absolutePath = localOriginalPath(storagePath);
  try {
    return await fs.readFile(absolutePath);
  } catch {
    throw new WorkspaceError('The original workbook is unavailable.', 404);
  }
}

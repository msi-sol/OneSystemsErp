import { Prisma } from '@prisma/client';
import { prisma, transactionContext } from '@/lib/prisma';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { approveAndLockDraftBOQ, buildDraftBOQChecksum, DraftBOQWorkflowError, type DraftBOQDatabase, type DraftBOQTransaction } from './draft-workflow';
import { assertBOQReviewReady, parseBOQReviewDocument, reviewDocumentJson } from './review-state';

export class BOQModuleReviewError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
function fail(message: string, status: number): never { throw new BOQModuleReviewError(message, status); }
const REVIEW_ACTION = 'BOQ_WORKSPACE_ENGINEERING_REVIEW';

export function getBOQContractReconciliation(contractValue: unknown, boqValue: Prisma.Decimal.Value) {
  let contract: Prisma.Decimal;
  let boq: Prisma.Decimal;
  try {
    contract = new Prisma.Decimal(String(contractValue));
    boq = new Prisma.Decimal(boqValue);
  } catch {
    fail('A valid signed contract value and BOQ total are required.', 400);
  }
  if (!contract.isFinite() || contract.lte(0) || contract.gt(Number.MAX_SAFE_INTEGER) || !boq.isFinite()) {
    fail('A valid signed contract value and BOQ total are required.', 400);
  }
  const difference = contract.minus(boq);
  return {
    contractValue: contract.toFixed(2),
    boqTotal: boq.toFixed(2),
    difference: difference.abs().toFixed(2),
    reconciles: difference.isZero(),
  };
}

export async function getBOQEngineeringReview(versionId: string, checksum: string) {
  const record = await prisma.auditLog.findFirst({ where: { transactionId: versionId, actionType: REVIEW_ACTION }, orderBy: { createdAt: 'desc' } });
  if (!record?.newValue) return null;
  try {
    const review = JSON.parse(record.newValue) as { checksum: string; comments: string; reviewerName: string };
    const version = await prisma.projectBOQVersion.findFirst({ where: { id: versionId }, select: { projectId: true } });
    const state = version ? await prisma.bOQReviewState.findFirst({ where: { projectId: version.projectId, versionId }, select: { dataJson: true } }) : null;
    const document = state ? parseBOQReviewDocument(state.dataJson, version!.projectId, versionId) : null;
    const latestReadingAt = document?.readingHistory.map(reading => reading.appliedAt).filter((value): value is string => Boolean(value)).sort().at(-1);
    const readingAfterReview = Boolean(latestReadingAt && new Date(latestReadingAt) > record.createdAt);
    return { ...review, current: review.checksum === checksum && !readingAfterReview, decidedAt: record.createdAt.toISOString() };
  } catch { return null; }
}

async function mutateReviewDocument(
  projectId: string,
  actor: { id: string; role: string; name?: string | null },
  body: Record<string, unknown>,
  action: 'finding-decision' | 'verify-contract' | 'revise-contract',
) {
  const versionId = typeof body.versionId === 'string' ? body.versionId : '';
  const expectedRowVersion = body.expectedRowVersion;
  if (!versionId || !Number.isSafeInteger(expectedRowVersion) || Number(expectedRowVersion) < 0) fail('Invalid BOQ review version.', 400);
  const capacity = await planningCapacity(actor, projectId);
  if (!capacity.canView || (action === 'finding-decision' ? !capacity.canEdit : !capacity.canApprove)) fail('Your project capacity does not allow this action.', 403);
  return transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, () => prisma.$transaction(async tx => {
    const version = await tx.projectBOQVersion.findFirst({ where: { id: versionId, projectId }, orderBy: { versionNumber: 'desc' } });
    const project = await tx.project.findUnique({ where: { id: projectId } });
    const state = await tx.bOQReviewState.findFirst({ where: { projectId, versionId } });
    if (!project || project.status === 'ARCHIVED' || project.boqLocked || !version || version.status !== 'DRAFT') fail('This BOQ version is no longer an editable draft.', 409);
    if (!state || state.rowVersion !== Number(expectedRowVersion)) fail('The BOQ review changed. Refresh before continuing.', 409);
    const document = parseBOQReviewDocument(state.dataJson, projectId, versionId);
    if (!document) fail('The BOQ review record is invalid.', 409);
    let eventBefore: unknown = null;
    let eventAfter: unknown = null;
    let returnedReconciliation: ReturnType<typeof getBOQContractReconciliation> | undefined;
    const now = new Date().toISOString();
    let auditReason: string | null = null;
    if (action === 'finding-decision') {
      const findingId = typeof body.findingId === 'string' ? body.findingId : '';
      const decision = body.decision;
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      const finding = document.findings.find(item => item.id === findingId);
      if (!finding || finding.status !== 'OPEN' || finding.invalidatedAt) fail('This BOQ finding is no longer open.', 409);
      if (!['CONFIRMED', 'SET_ASIDE', 'DEFERRED'].includes(String(decision))) fail('Choose a supported finding decision.', 400);
      if ((decision === 'SET_ASIDE' || decision === 'DEFERRED') && (reason.length < 5 || reason.length > 300)) fail('Enter a reason of 5 to 300 characters.', 400);
      if (decision === 'DEFERRED' && finding.severity === 'BLOCKING') fail('A blocking BOQ finding cannot be deferred.', 400);
      eventBefore = { status: finding.status, reason: finding.reason };
      finding.status = decision as 'CONFIRMED' | 'SET_ASIDE' | 'DEFERRED';
      finding.reason = reason || null;
      finding.decidedBy = actor.id;
      finding.decidedAt = now;
      eventAfter = { findingId, status: finding.status, reason: finding.reason, field: finding.field, itemId: finding.itemId, rowNumber: finding.rowNumber };
      auditReason = reason || null;
    } else if (action === 'verify-contract') {
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (reason.length < 5 || reason.length > 300) fail('Enter why the signed contract value was checked.', 400);
      const lines = await tx.awardedBOQItem.findMany({ where: { projectId } });
      const total = lines.reduce((sum, line) => sum.plus(String(line.totalCost)), new Prisma.Decimal(0));
      if (!lines.length || total.lte(0)) fail('A positive BOQ total is required before the signed contract can be verified.', 400);
      returnedReconciliation = getBOQContractReconciliation(project.contractAmount, total);
      eventBefore = document.contract;
      document.contract = { verified: true, verifiedBy: actor.id, verifiedAt: now, verificationReason: reason };
      eventAfter = { ...document.contract, ...returnedReconciliation };
      auditReason = reason;
    } else {
      const amountText = typeof body.contractAmount === 'string' ? body.contractAmount.trim() : '';
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!/^\d+(?:\.\d{1,2})?$/.test(amountText) || !new Prisma.Decimal(amountText).isFinite() || new Prisma.Decimal(amountText).lte(0)) fail('Enter a positive signed contract value to cents.', 400);
      if (reason.length < 5 || reason.length > 300) fail('Enter a reason of 5 to 300 characters for the contract revision.', 400);
      eventBefore = { contractAmount: project.contractAmount, verification: document.contract };
      await tx.project.update({ where: { id: projectId }, data: { contractAmount: Number(amountText) } });
      document.contract = { verified: false, verifiedBy: null, verifiedAt: null, verificationReason: null };
      eventAfter = { contractAmount: Number(amountText), verification: document.contract };
      auditReason = reason;
    }
    document.history.push({ action, actorId: actor.id, reason: auditReason, at: now, before: eventBefore, after: eventAfter });
    const updated = await tx.bOQReviewState.updateMany({ where: { id: state.id, projectId, versionId, rowVersion: state.rowVersion }, data: { dataJson: reviewDocumentJson(document), rowVersion: { increment: 1 } } });
    if (updated.count !== 1) fail('The BOQ review changed. Refresh before continuing.', 409);
    await tx.auditLog.create({ data: { userId: actor.id, userRole: actor.role, moduleName: 'PROJECT_BOQ', transactionId: versionId, actionType: `PROJECT_BOQ_${action.replaceAll('-', '_').toUpperCase()}`, oldValue: JSON.stringify(eventBefore), newValue: JSON.stringify(eventAfter) } });
    return { success: true, rowVersion: state.rowVersion + 1, contract: document.contract, ...(returnedReconciliation ? { reconciliation: returnedReconciliation } : {}) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
}

export async function reviewBOQModule(projectId: string, actor: { id: string; role: string; name?: string | null }, body: Record<string, unknown>) {
  if (body.action === 'finding-decision' || body.action === 'verify-contract' || body.action === 'revise-contract') {
    return mutateReviewDocument(projectId, actor, body, body.action);
  }
  if (!['review', 'approve'].includes(String(body.action)) || typeof body.versionId !== 'string' || typeof body.expectedChecksum !== 'string') fail('Invalid BOQ review request.', 400);
  const versionId = String(body.versionId), checksum = String(body.expectedChecksum);
  const capacity = await planningCapacity(actor, projectId);
  if (!capacity.canView || (body.action === 'review' ? !capacity.canEngineerReview : !capacity.canApprove)) fail('Your project capacity does not allow this action.', 403);
  const comments = typeof body.comments === 'string' ? body.comments.trim() : '';
  if (body.action === 'review' && (comments.length < 5 || comments.length > 10000)) fail('Enter an engineering review between 5 and 10,000 characters.', 400);
  const approvalNote = typeof body.approvalNote === 'string' ? body.approvalNote.trim() : '';
  if (body.action === 'approve' && ((body.approvalNote !== undefined && typeof body.approvalNote !== 'string') || (approvalNote && (approvalNote.length < 5 || approvalNote.length > 1000)))) fail('An optional approval note must contain 5–1,000 characters.', 400);
  try {
    return await transactionContext.run({ sourceProvenance: 'GATE9_WORKFLOW_ENGINE' }, () => prisma.$transaction(async tx => {
      const version = await tx.projectBOQVersion.findFirst({ where: { projectId }, orderBy: { versionNumber: 'desc' } });
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project || project.status === 'ARCHIVED') fail('Project is unavailable or archived.', 409);
      if (!version || version.id !== versionId || version.status !== 'DRAFT' || project.boqLocked) fail('This BOQ version is no longer an editable draft.', 409);
      const lines = await tx.awardedBOQItem.findMany({ where: { projectId } });
      if (!lines.length || version.checksum !== checksum || buildDraftBOQChecksum(lines) !== checksum) fail('The BOQ changed. Refresh and review its current version.', 409);
      const total = lines.reduce((sum, line) => sum.plus(String(line.totalCost)), new Prisma.Decimal(0));
      if (lines.some(line => new Prisma.Decimal(String(line.quantity)).isZero() && new Prisma.Decimal(String(line.totalCost)).gt(0))) fail('A BOQ item with a positive amount must have a positive quantity.', 400);
      if (total.lte(0)) fail('The BOQ total must be positive before review.', 400);
      const state = await tx.bOQReviewState.findFirst({ where: { projectId, versionId } });
      if (!state || typeof body.expectedRowVersion !== 'number' || state.rowVersion !== body.expectedRowVersion) fail('The BOQ review changed. Refresh before continuing.', 409);
      const document = parseBOQReviewDocument(state.dataJson, projectId, versionId);
      if (!document) fail('The BOQ source review record is invalid.', 409);
      if (!document.contract.verified) fail('Verify the signed contract value before BOQ review.', 409);
      try { assertBOQReviewReady(document); } catch { fail('Resolve or record a decision for every required BOQ finding before review.', 409); }
      if (body.action === 'review') {
        await tx.auditLog.create({ data: { userId: actor.id, userRole: actor.role, moduleName: 'PROJECT_BOQ', transactionId: version.id,
          actionType: REVIEW_ACTION, newValue: JSON.stringify({ projectId, checksum, comments, reviewerName: actor.name || actor.id }) } });
        return { success: true, status: 'ENGINEERING_REVIEWED' };
      }
      const audit = await tx.auditLog.findFirst({ where: { transactionId: version.id, actionType: REVIEW_ACTION }, orderBy: { createdAt: 'desc' } });
      let reviewedChecksum = '';
      try { reviewedChecksum = JSON.parse(audit?.newValue || '{}').checksum; } catch { /* Invalid review is not approval evidence. */ }
      if (reviewedChecksum !== checksum) fail('An engineer must review this exact BOQ version before PM approval.', 409);
      const reconciliation = getBOQContractReconciliation(project.contractAmount, total);
      if (!reconciliation.reconciles) {
        fail(`PM approval is blocked: the BOQ total is PHP ${reconciliation.boqTotal} and the signed contract value is PHP ${reconciliation.contractValue} (difference PHP ${reconciliation.difference}). Correct the BOQ lines or explicitly revise the contract value with a reason; neither amount was changed.`, 400);
      }
      const setAsideFindings = document.findings.filter(finding => finding.status === 'SET_ASIDE' && !finding.invalidatedAt);
      if (setAsideFindings.length && !document.setAsideAcknowledgement) {
        if (body.setAsideAcknowledged !== true || typeof body.setAsideReason !== 'string' || body.setAsideReason.trim().length < 5 || body.setAsideReason.trim().length > 300) {
          fail('Acknowledge the BOQ source rows set aside during review and enter a reason.', 409);
        }
        document.setAsideAcknowledgement = { actorId: actor.id, reason: body.setAsideReason.trim(), at: new Date().toISOString() };
      }
      document.finalApproval = { actorId: actor.id, at: new Date().toISOString(), checksum, ...(approvalNote ? { note: approvalNote } : {}) };
      const stateUpdated = await tx.bOQReviewState.updateMany({ where: { id: state.id, projectId, versionId, rowVersion: state.rowVersion }, data: { dataJson: reviewDocumentJson(document), rowVersion: { increment: 1 } } });
      if (stateUpdated.count !== 1) fail('The BOQ review changed. Refresh before continuing.', 409);
      const approvalClient: DraftBOQDatabase = { $transaction: callback => callback(tx as unknown as DraftBOQTransaction) };
      await approveAndLockDraftBOQ(projectId, actor.id, { versionId, expectedChecksum: checksum }, approvalClient, true);
      if (version.sourceUploadedWorkbookFileId) await tx.uploadedWorkbookFile.updateMany({
        where: { id: version.sourceUploadedWorkbookFileId, projectId }, data: { commitStatus: 'COMMITTED' },
      });
      return { success: true, status: 'APPROVED' };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }));
  } catch (error) {
    if (error instanceof DraftBOQWorkflowError) fail(error.code, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') fail('The BOQ changed concurrently. Refresh before trying again.', 409);
    throw error;
  }
}

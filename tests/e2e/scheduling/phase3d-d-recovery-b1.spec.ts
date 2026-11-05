import { test, expect } from '@playwright/test';
import { PrismaClient, ProjectScheduleWorkflowStatus } from '@prisma/client';
import crypto from 'crypto';
import { activateScheduleBaseline } from '@/lib/scheduling/scheduleWorkflow';

// Initialize a separate test Prisma client to avoid conflicts
const prisma = new PrismaClient();

const generateIdempotencyKey = () => crypto.randomBytes(16).toString('hex');
const generateFingerprint = (payload: any) => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

test.describe('Phase 3D-D Recovery B1: Service Hardening', () => {
  // Use isolated test fixtures to avoid canonical ID corruption
  let testProject: any;
  let testSchedule: any;
  let testActor: any;
  
  test.beforeAll(async () => {
    // 1. Create a dummy test actor (must exist in DB to satisfy foreign keys)
    testActor = await prisma.user.create({
      data: {
        email: `test-actor-${Date.now()}@test.com`,
        name: 'Test Actor',
        role: 'PROJECT_MANAGER'
      }
    });
  });

  test.afterAll(async () => {
    await prisma.user.delete({ where: { id: testActor.id } }).catch(() => {});
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    // 1. Create a clean isolated project and schedule for each test
    testProject = await prisma.project.create({
      data: {
        name: `Test Project ${Date.now()}`,
        status: 'ACTIVE',
      }
    });

    testSchedule = await prisma.projectSchedule.create({
      data: {
        projectId: testProject.id,
        name: 'Test Schedule',
        workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL,
        rowVersion: 1,
        reviewRound: 1,
        projectStartDate: new Date('2026-01-01'),
        projectCompletionDate: new Date('2026-12-31'),
        awardedContractAmount: 1000000,
        scheduledAmount: 1000000,
        differenceAmount: 0,
      }
    });

    // WBS Root
    const wbs = await prisma.scheduleWBS.create({
      data: {
        scheduleId: testSchedule.id,
        name: 'Root Phase',
        level: 1,
        code: 'WBS-1'
      }
    });

    // Required Phases for Validation
    await prisma.scheduleWBS.create({
      data: {
        scheduleId: testSchedule.id,
        name: 'Testing and Commissioning',
        level: 2,
        code: 'WBS-2',
        parentId: wbs.id
      }
    });

    await prisma.scheduleWBS.create({
      data: {
        scheduleId: testSchedule.id,
        name: 'Project Acceptance',
        level: 2,
        code: 'WBS-3',
        parentId: wbs.id
      }
    });

    // Activities
    const act = await prisma.scheduleActivity.create({
      data: {
        scheduleId: testSchedule.id,
        wbsId: wbs.id,
        name: 'Test Activity 1',
        plannedStartDate: new Date('2026-01-01'),
        plannedFinishDate: new Date('2026-12-31'),
        criticalPath: true,
        totalFloat: 0
      }
    });

    // Awarded BOQ Item
    const boqItem = await prisma.awardedBOQItem.create({
      data: {
        projectId: testProject.id,
        itemCode: 'ITEM-1',
        description: 'Test Item',
        quantity: 1,
        unit: 'LUMP',
        combinedUnitCost: 1000000,
        totalCost: 1000000,
        category: 'MATERIAL'
      }
    });

    // Allocation
    await prisma.scheduleBOQAllocation.create({
      data: {
        scheduleId: testSchedule.id,
        activityId: act.id,
        awardedBoqItemId: boqItem.id,
        allocatedQuantity: 1
      }
    });

    // Technical Approval (Required for baseline activation)
    await prisma.scheduleApproval.create({
      data: {
        schedule: { connect: { id: testSchedule.id } },
        approvalStage: 'TECHNICAL',
        decision: 'APPROVE',
        reviewRound: 1,
        reviewer: { connect: { id: testActor.id } },
        reviewerNameSnapshot: testActor.name,
        reviewerRoleSnapshot: testActor.role,
        comments: 'Looks good',
        validationSnapshot: 'PASS',
        snapshotVersion: '1.0',
        scheduleSnapshotHash: 'dummy_hash', // We mock this during test by intercepting validation
      }
    });
  });

  test.afterEach(async () => {
    // Cleanup isolated fixture
    await prisma.scheduleApproval.deleteMany({ where: { scheduleId: testSchedule.id } }).catch(() => {});
    await prisma.baselineActivation.deleteMany({ where: { scheduleId: testSchedule.id } }).catch(() => {});
    await prisma.scheduleBOQAllocation.deleteMany({ where: { scheduleId: testSchedule.id } }).catch(() => {});
    await prisma.scheduleActivity.deleteMany({ where: { scheduleId: testSchedule.id } }).catch(() => {});
    await prisma.scheduleWBS.deleteMany({ where: { scheduleId: testSchedule.id } }).catch(() => {});
    await prisma.projectSchedule.delete({ where: { id: testSchedule.id } }).catch(() => {});
    await prisma.awardedBOQItem.deleteMany({ where: { projectId: testProject.id } }).catch(() => {});
    await prisma.project.delete({ where: { id: testProject.id } }).catch(() => {});
  });

  test('should successfully activate baseline if all conditions met', async () => {
    // Mock the validate function or just let it calculate the real hash
    // Wait, the real validate function calculates a hash. Our Technical Approval needs to match it.
    // So we first run validation manually to get the hash, and update our mock approval.
    const { validateScheduleForReview } = await import('@/lib/scheduling/scheduleWorkflow');
    const val = await validateScheduleForReview({ projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 });
    
    await prisma.scheduleApproval.updateMany({
      where: { scheduleId: testSchedule.id, approvalStage: 'TECHNICAL' },
      data: { scheduleSnapshotHash: val.hash }
    });
    
    // We must reset rowVersion to 1 and status to PENDING_BASELINE_APPROVAL
    await prisma.projectSchedule.update({ 
      where: { id: testSchedule.id }, 
      data: { 
        rowVersion: 1,
        workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL 
      } 
    });
    testSchedule.rowVersion = 1;

    const payload = {
      operation: 'activateScheduleBaseline',
      projectId: testProject.id,
      scheduleId: testSchedule.id,
      actorId: testActor.id,
      expectedRowVersion: 1
    };
    const key = generateIdempotencyKey();
    const fp = generateFingerprint(payload);

    const result = await activateScheduleBaseline({
      ...payload,
      idempotencyKey: key,
      requestFingerprint: fp
    });

    expect(result.workflowStatus).toBe(ProjectScheduleWorkflowStatus.ACTIVE_BASELINE);
    expect(result.baselineCode).toBe('BL-001');
    expect(result.rowVersion).toBe(3);

    const activations = await prisma.baselineActivation.findMany({ where: { scheduleId: testSchedule.id } });
    expect(activations.length).toBe(1);
    expect(activations[0].isAuthoritative).toBe(true);
    expect(activations[0].idempotencyKey).toBe(key);
    expect(activations[0].requestId).toBe(fp);
  });

  test('should return existing success on idempotent retry', async () => {
    // Setup valid hash
    const { validateScheduleForReview } = await import('@/lib/scheduling/scheduleWorkflow');
    const val = await validateScheduleForReview({ projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 });
    await prisma.scheduleApproval.updateMany({
      where: { scheduleId: testSchedule.id, approvalStage: 'TECHNICAL' },
      data: { scheduleSnapshotHash: val.hash }
    });
    await prisma.projectSchedule.update({ 
      where: { id: testSchedule.id }, 
      data: { 
        rowVersion: 1,
        workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL
      } 
    });

    const payload = {
      operation: 'activateScheduleBaseline',
      projectId: testProject.id,
      scheduleId: testSchedule.id,
      actorId: testActor.id,
      expectedRowVersion: 1
    };
    const key = generateIdempotencyKey();
    const fp = generateFingerprint(payload);

    // First call
    await activateScheduleBaseline({ ...payload, idempotencyKey: key, requestFingerprint: fp });
    
    // Retry call
    const result2 = await activateScheduleBaseline({ ...payload, idempotencyKey: key, requestFingerprint: fp });

    expect(result2.workflowStatus).toBe(ProjectScheduleWorkflowStatus.ACTIVE_BASELINE);
    
    const activations = await prisma.baselineActivation.findMany({ where: { scheduleId: testSchedule.id } });
    expect(activations.length).toBe(1); // Still exactly one record
  });

  test('should block conflicting idempotency fingerprint', async () => {
    // Setup valid hash
    const { validateScheduleForReview } = await import('@/lib/scheduling/scheduleWorkflow');
    const val = await validateScheduleForReview({ projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 });
    await prisma.scheduleApproval.updateMany({
      where: { scheduleId: testSchedule.id, approvalStage: 'TECHNICAL' },
      data: { scheduleSnapshotHash: val.hash }
    });
    await prisma.projectSchedule.update({ 
      where: { id: testSchedule.id }, 
      data: { 
        rowVersion: 1,
        workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL
      } 
    });

    const payload = {
      operation: 'activateScheduleBaseline',
      projectId: testProject.id,
      scheduleId: testSchedule.id,
      actorId: testActor.id,
      expectedRowVersion: 1
    };
    const key = generateIdempotencyKey();
    const fp1 = generateFingerprint(payload);
    
    // First call
    await activateScheduleBaseline({ ...payload, idempotencyKey: key, requestFingerprint: fp1 });
    
    // Retry call with different fingerprint
    const fp2 = generateFingerprint({ ...payload, expectedRowVersion: 999 });

    await expect(activateScheduleBaseline({ ...payload, idempotencyKey: key, requestFingerprint: fp2 })).rejects.toThrow('IDEMPOTENCY_KEY_CONFLICT');
  });

  test('should block if schedule not found', async () => {
    const payload = {
      operation: 'activateScheduleBaseline',
      projectId: testProject.id,
      scheduleId: 'invalid-id',
      actorId: testActor.id,
      expectedRowVersion: 1
    };
    await expect(activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) })).rejects.toThrow('SCHEDULE_NOT_FOUND');
  });

  test('should block if already active baseline', async () => {
    await prisma.projectSchedule.update({ where: { id: testSchedule.id }, data: { workflowStatus: ProjectScheduleWorkflowStatus.ACTIVE_BASELINE } });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    await expect(activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) })).rejects.toThrow('SCHEDULE_ALREADY_ACTIVE');
  });

  test('should block if invalid workflow status', async () => {
    await prisma.projectSchedule.update({ where: { id: testSchedule.id }, data: { workflowStatus: ProjectScheduleWorkflowStatus.AI_GENERATED_DRAFT } });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    await expect(activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) })).rejects.toThrow('INVALID_WORKFLOW_TRANSITION');
  });

  test('should block if rowVersion mismatch', async () => {
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 999 };
    await expect(activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) })).rejects.toThrow('SCHEDULE_VERSION_CONFLICT');
  });

  test('should block if authoritative activation already exists for this schedule', async () => {
    await prisma.baselineActivation.create({
      data: { scheduleId: testSchedule.id, activatedById: testActor.id, idempotencyKey: 'existing', requestId: 'existing', isAuthoritative: true, reviewRound: 1, revisionCode: 'BL-001', validationSnapshot: {} }
    });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    await expect(activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) })).rejects.toThrow('AUTHORITATIVE_ACTIVATION_ALREADY_EXISTS');
  });

  test('should block if validation fails (e.g. financial mismatch)', async () => {
    await prisma.projectSchedule.update({ where: { id: testSchedule.id }, data: { scheduledAmount: 500000 } });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    await expect(activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) })).rejects.toThrow('VALIDATION_FAILED_DURING_ACTIVATION');
  });

  test('should block if missing technical approval for current review round', async () => {
    await prisma.scheduleApproval.deleteMany({ where: { scheduleId: testSchedule.id } });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    await expect(activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) })).rejects.toThrow('MISSING_TECHNICAL_APPROVAL_FOR_CURRENT_ROUND');
  });

  test('should block if schedule snapshot hash mismatch', async () => {
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    await expect(activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) })).rejects.toThrow('SNAPSHOT_HASH_MISMATCH');
  });

  test('should correctly increment rowVersion', async () => {
    const { validateScheduleForReview } = await import('@/lib/scheduling/scheduleWorkflow');
    const val = await validateScheduleForReview({ projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 });
    await prisma.scheduleApproval.updateMany({ where: { scheduleId: testSchedule.id }, data: { scheduleSnapshotHash: val.hash } });
    await prisma.projectSchedule.update({ where: { id: testSchedule.id }, data: { rowVersion: 1, workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL } });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    const result = await activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) });
    expect(result.rowVersion).toBe(3);
  });

  test('should correctly generate baseline code BL-001 for first baseline', async () => {
    const { validateScheduleForReview } = await import('@/lib/scheduling/scheduleWorkflow');
    const val = await validateScheduleForReview({ projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 });
    await prisma.scheduleApproval.updateMany({ where: { scheduleId: testSchedule.id }, data: { scheduleSnapshotHash: val.hash } });
    await prisma.projectSchedule.update({ where: { id: testSchedule.id }, data: { rowVersion: 1, workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL } });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    const result = await activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) });
    expect(result.baselineCode).toBe('BL-001');
  });

  test('should correctly generate baseline code BL-002 for second baseline of the project', async () => {
    // Fake existing baseline for the project
    const dummyActive = await prisma.projectSchedule.create({
      data: { projectId: testProject.id, name: 'Old Baseline', workflowStatus: ProjectScheduleWorkflowStatus.ACTIVE_BASELINE, rowVersion: 1, baselineCode: 'BL-001' }
    });
    
    const { validateScheduleForReview } = await import('@/lib/scheduling/scheduleWorkflow');
    const val = await validateScheduleForReview({ projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 });
    await prisma.scheduleApproval.updateMany({ where: { scheduleId: testSchedule.id }, data: { scheduleSnapshotHash: val.hash } });
    await prisma.projectSchedule.update({ where: { id: testSchedule.id }, data: { rowVersion: 1, workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL } });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    const result = await activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) });
    
    expect(result.baselineCode).toBe('BL-002');
    
    await prisma.projectSchedule.delete({ where: { id: dummyActive.id } }).catch(() => {});
  });

  test('should correctly supersede previously active baseline of the project', async () => {
    const dummyActive = await prisma.projectSchedule.create({
      data: { projectId: testProject.id, name: 'Old Baseline', workflowStatus: ProjectScheduleWorkflowStatus.ACTIVE_BASELINE, rowVersion: 1, baselineCode: 'BL-001' }
    });
    
    const { validateScheduleForReview } = await import('@/lib/scheduling/scheduleWorkflow');
    const val = await validateScheduleForReview({ projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 });
    await prisma.scheduleApproval.updateMany({ where: { scheduleId: testSchedule.id }, data: { scheduleSnapshotHash: val.hash } });
    await prisma.projectSchedule.update({ where: { id: testSchedule.id }, data: { rowVersion: 1, workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL } });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    await activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) });
    
    const oldActive = await prisma.projectSchedule.findUnique({ where: { id: dummyActive.id } });
    expect(oldActive?.workflowStatus).toBe(ProjectScheduleWorkflowStatus.SUPERSEDED_BASELINE);
    
    await prisma.projectSchedule.delete({ where: { id: dummyActive.id } }).catch(() => {});
  });

  test('should correctly set baselineStartDate and baselineFinishDate on activities', async () => {
    const { validateScheduleForReview } = await import('@/lib/scheduling/scheduleWorkflow');
    const val = await validateScheduleForReview({ projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 });
    await prisma.scheduleApproval.updateMany({ where: { scheduleId: testSchedule.id }, data: { scheduleSnapshotHash: val.hash } });
    await prisma.projectSchedule.update({ where: { id: testSchedule.id }, data: { rowVersion: 1, workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL } });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    await activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) });
    
    const activities = await prisma.scheduleActivity.findMany({ where: { scheduleId: testSchedule.id } });
    expect(activities[0].baselineStartDate).not.toBeNull();
    expect(activities[0].baselineFinishDate).not.toBeNull();
  });



  test('should persist BaselineActivation with correct activatedById', async () => {
    const { validateScheduleForReview } = await import('@/lib/scheduling/scheduleWorkflow');
    const val = await validateScheduleForReview({ projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 });
    await prisma.scheduleApproval.updateMany({ where: { scheduleId: testSchedule.id }, data: { scheduleSnapshotHash: val.hash } });
    await prisma.projectSchedule.update({ where: { id: testSchedule.id }, data: { rowVersion: 1, workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL } });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    await activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) });
    
    const activation = await prisma.baselineActivation.findFirst({ where: { scheduleId: testSchedule.id } });
    expect(activation?.activatedById).toBe(testActor.id);
  });

  test('should persist BaselineActivation with isAuthoritative = true', async () => {
    const { validateScheduleForReview } = await import('@/lib/scheduling/scheduleWorkflow');
    const val = await validateScheduleForReview({ projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 });
    await prisma.scheduleApproval.updateMany({ where: { scheduleId: testSchedule.id }, data: { scheduleSnapshotHash: val.hash } });
    await prisma.projectSchedule.update({ where: { id: testSchedule.id }, data: { rowVersion: 1, workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL } });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    await activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) });
    
    const activation = await prisma.baselineActivation.findFirst({ where: { scheduleId: testSchedule.id } });
    expect(activation?.isAuthoritative).toBe(true);
  });

  test('should create FINAL_ACTIVATION ScheduleApproval', async () => {
    const { validateScheduleForReview } = await import('@/lib/scheduling/scheduleWorkflow');
    const val = await validateScheduleForReview({ projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 });
    await prisma.scheduleApproval.updateMany({ where: { scheduleId: testSchedule.id }, data: { scheduleSnapshotHash: val.hash } });
    await prisma.projectSchedule.update({ where: { id: testSchedule.id }, data: { rowVersion: 1, workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL } });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    await activateScheduleBaseline({ ...payload, idempotencyKey: generateIdempotencyKey(), requestFingerprint: generateFingerprint(payload) });
    
    const approval = await prisma.scheduleApproval.findFirst({ where: { scheduleId: testSchedule.id, approvalStage: 'FINAL_ACTIVATION' } });
    expect(approval).not.toBeNull();
    expect(approval?.decision).toBe('APPROVE');
  });

  test('should persist activation idempotency metadata in BaselineActivation', async () => {
    const { validateScheduleForReview } = await import('@/lib/scheduling/scheduleWorkflow');
    const val = await validateScheduleForReview({ projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 });
    await prisma.scheduleApproval.updateMany({ where: { scheduleId: testSchedule.id }, data: { scheduleSnapshotHash: val.hash } });
    await prisma.projectSchedule.update({ where: { id: testSchedule.id }, data: { rowVersion: 1, workflowStatus: ProjectScheduleWorkflowStatus.PENDING_BASELINE_APPROVAL } });
    const payload = { operation: 'activateScheduleBaseline', projectId: testProject.id, scheduleId: testSchedule.id, actorId: testActor.id, expectedRowVersion: 1 };
    const key = generateIdempotencyKey();
    const fp = generateFingerprint(payload);
    await activateScheduleBaseline({ ...payload, idempotencyKey: key, requestFingerprint: fp });
    
    const activation = await prisma.baselineActivation.findFirst({ where: { scheduleId: testSchedule.id } });
    expect(activation?.idempotencyKey).toBe(key);
    expect(activation?.requestId).toBe(fp);
  });


});

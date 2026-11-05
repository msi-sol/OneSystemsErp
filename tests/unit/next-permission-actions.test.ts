jest.mock('@/lib/prisma', () => {
  const model = () => new Proxy({} as Record<string, jest.Mock>, { get: (target, method: string) => (target[method] ??= jest.fn(async () => null)) });
  return {
    prisma: {
      user: model(), auditLog: model(), projectUserAssignment: model(), role: model(), userRole: model(),
      project: model(), projectSchedule: model(), projectBOQVersion: model(), scheduleGenerationAudit: model(),
      scheduleDependency: model(), scheduleBOQAllocation: model(), scheduleActivity: model(), scheduleWBS: model(), scheduleMilestone: model(),
      $transaction: jest.fn(async () => []),
    },
  };
});
jest.mock('@/lib/permissions', () => ({
  ...jest.requireActual('@/lib/permissions'),
  getUserPermissions: jest.fn(),
}));
jest.mock('@/lib/scheduling/authUtils', () => ({ getSessionActor: jest.fn(), checkSchedulingAccess: jest.fn() }));
jest.mock('@/lib/scheduling/aiOrchestrator', () => ({ runAIOrchestrator: jest.fn() }));
jest.mock('@/lib/securityLogger', () => ({ logFullSecurityEvent: jest.fn(async () => undefined) }));
jest.mock('@/lib/dal/auth', () => ({ verifySession: jest.fn(async () => ({ id: 'user-1' })) }));
jest.mock('next/headers', () => ({ cookies: jest.fn(async () => ({ get: () => undefined })) }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/link', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/projects/page.module.css', () => ({}));
jest.mock('@/app/projects/NewProjectButton', () => ({ __esModule: true, default: () => null }));
jest.mock('@/app/projects/ManagerAssigner', () => ({
  __esModule: true,
  default: ({ canEdit }: { canEdit: boolean }) => (canEdit ? 'manager-picker' : 'manager-name'),
}));
jest.mock('@/app/projects/DeleteProjectButton', () => ({ __esModule: true, default: () => 'delete-project' }));

import { renderToStaticMarkup } from 'react-dom/server';
import { checkUserAccess } from '@/lib/accessControl';
import { getPermissionsForRole, getUserPermissions } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { checkSchedulingAccess, getSessionActor } from '@/lib/scheduling/authUtils';
import { runAIOrchestrator } from '@/lib/scheduling/aiOrchestrator';
import { canAccess, type ActionType } from '@/lib/securityEngine';
import ProjectsPage from '@/app/projects/page';
import { DELETE as deleteSchedule } from '@/app/api/projects/[id]/scheduling/delete/route';
import { POST as simulate } from '@/app/api/projects/[id]/scheduling/simulate/route';

const db = prisma as any;
const userPermissions = getUserPermissions as jest.Mock;
const sessionActor = getSessionActor as jest.Mock;
const schedulingAccess = checkSchedulingAccess as jest.Mock;
const orchestrator = runAIOrchestrator as jest.Mock;
const routeContext = { params: Promise.resolve({ id: 'project-1' }) };
const pm = { id: 'user-1', role: 'PROJECT_MANAGER' };

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'PROJECT_MANAGER', status: 'ACTIVE', name: 'PM' });
  db.user.findFirst.mockResolvedValue(null);
  db.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  db.projectUserAssignment.findUnique.mockResolvedValue({ assignmentStatus: 'active', projectRole: 'PROJECT_MANAGER', accessLevel: 'full' });
  db.projectSchedule.findMany.mockResolvedValue([]);
  db.projectSchedule.findFirst.mockResolvedValue(null);
  db.projectBOQVersion.findFirst.mockResolvedValue({ id: 'boq-1' });
  sessionActor.mockResolvedValue(pm);
  schedulingAccess.mockResolvedValue({ allowed: true });
  orchestrator.mockResolvedValue({ success: true, scheduleId: 'schedule-new' });
});

describe('checkUserAccess', () => {
  test.each([
    ['EDIT', 'canEditDraft'],
    ['UPDATE', 'canEditDraft'],
    ['DELETE', 'canDeleteDraft'],
  ])('%s passes with %s and fails without it', async (action, right) => {
    userPermissions.mockResolvedValue({ SUBCONTRACTING: { [right]: true } });
    await expect(checkUserAccess('user-1', 'project-1', 'SUBCONTRACTING', action)).resolves.toMatchObject({ allowed: true });

    userPermissions.mockResolvedValue({ SUBCONTRACTING: { canView: true } });
    await expect(checkUserAccess('user-1', 'project-1', 'SUBCONTRACTING', action)).resolves.toMatchObject({ allowed: false });
  });
});

describe('canAccess', () => {
  const rights: [ActionType, string][] = [
    ['view', 'canView'], ['read', 'canView'], ['create', 'canCreate'], ['edit', 'canEditDraft'], ['write', 'canEditDraft'],
    ['delete', 'canDeleteDraft'], ['approve', 'canApprove'], ['submit', 'canSubmit'], ['lock', 'canLock'], ['export', 'canExport'],
    ['upload', 'canUploadAttachment'], ['download', 'canDownloadAttachment'],
  ];

  test.each(rights)('%s passes with %s', async (action, right) => {
    userPermissions.mockResolvedValue({ EQUIPMENT: { [right]: true } });
    await expect(canAccess({ userId: 'user-1', module: 'EQUIPMENT', action })).resolves.toBe(true);
  });

  test.each(rights)('%s fails when the row does not hold %s', async (action, right) => {
    const others = Object.fromEntries(rights.filter(([, name]) => name !== right).map(([, name]) => [name, true]));
    userPermissions.mockResolvedValue({ EQUIPMENT: others });
    await expect(canAccess({ userId: 'user-1', module: 'EQUIPMENT', action })).resolves.toBe(false);
  });
});

describe('administrator shortcut', () => {
  test('grants the real delete right, not the old name', async () => {
    db.role.findFirst.mockResolvedValue(null);
    const permissions: any = await getPermissionsForRole('SUPER_ADMIN');
    expect(permissions.PROJECT_MANAGEMENT.canDeleteDraft).toBe(true);
    expect(permissions.PROJECT_MANAGEMENT.canEditDraft).toBe(true);
    expect(permissions.PROJECT_MANAGEMENT.canDelete).toBeUndefined();
    expect(permissions.PROJECT_MANAGEMENT.canEdit).toBeUndefined();
  });
});

describe('projects page', () => {
  async function renderFor(permissions: Record<string, unknown>) {
    userPermissions.mockResolvedValue(permissions);
    db.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'PROJECT_MANAGER' });
    db.user.findMany = jest.fn(async () => []);
    db.project.findMany.mockResolvedValue([{
      id: 'project-1', name: 'Tower', status: 'PLANNING', contractAmount: 1, consolidatedBoqItems: [], manager: null,
    }]);
    return renderToStaticMarkup(await ProjectsPage());
  }

  test('an administrator can assign a manager and delete a project', async () => {
    const html = await renderFor({ IS_ADMIN: true, PROJECT_MANAGEMENT: { canApprove: true } });
    expect(html).toContain('manager-picker');
    expect(html).toContain('delete-project');
  });

  test('canApprove assigns a manager but does not delete a project', async () => {
    const html = await renderFor({ PROJECT_MANAGEMENT: { canApprove: true } });
    expect(html).toContain('manager-picker');
    expect(html).not.toContain('delete-project');
  });

  test('draft rights neither assign a manager nor delete a project', async () => {
    const html = await renderFor({ PROJECT_MANAGEMENT: { canEditDraft: true, canDeleteDraft: true } });
    expect(html).toContain('manager-name');
    expect(html).not.toContain('delete-project');
  });
});

describe('POST scheduling/simulate', () => {
  const run = () => simulate(new Request('http://erp.test/x', { method: 'POST', body: '{}' }), routeContext);

  // Answers the route's query the way the database would, for one schedule on the project.
  function withSchedule(workflowStatus: string, status = 'DRAFT') {
    db.projectSchedule.findFirst.mockImplementation(async ({ where }: any) => (
      !where.workflowStatus.notIn.includes(workflowStatus) && status !== where.status.not ? { id: 'schedule-1' } : null
    ));
  }

  test('needs canEditDraft', async () => {
    schedulingAccess.mockResolvedValue({ allowed: false });
    const response = await run();
    expect(schedulingAccess).toHaveBeenCalledWith('user-1', 'PROJECT_MANAGER', 'project-1', 'canEditDraft');
    expect(response.status).toBe(403);
    expect(orchestrator).not.toHaveBeenCalled();
  });

  test.each([
    'READY_FOR_REVIEW', 'UNDER_TECHNICAL_REVIEW', 'TECHNICALLY_APPROVED', 'UNDER_CONTRACT_REVIEW', 'CONTRACT_REVISIONS_REQUIRED',
    'CONTRACT_APPROVED', 'UNDER_FINANCE_REVIEW', 'FINANCE_REVISIONS_REQUIRED', 'FINANCE_APPROVED', 'PENDING_BASELINE_APPROVAL', 'ACTIVE_BASELINE',
  ])('does not replace a schedule in %s', async (workflowStatus) => {
    withSchedule(workflowStatus);
    const response = await run();
    expect(response.status).toBe(409);
    expect(orchestrator).not.toHaveBeenCalled();
  });

  test.each([
    'AI_GENERATED_DRAFT', 'INVALID_GENERATED_DRAFT', 'TECHNICAL_REVISIONS_REQUIRED', 'SUPERSEDED_BASELINE', 'ARCHIVED_BASELINE', 'REJECTED',
  ])('generates over a schedule in %s', async (workflowStatus) => {
    withSchedule(workflowStatus);
    const response = await run();
    expect(response.status).toBe(200);
    expect(orchestrator).toHaveBeenCalledTimes(1);
  });

  test('a schedule already retired by an earlier generation does not block', async () => {
    withSchedule('ACTIVE_BASELINE', 'LEGACY_INVALID_DRAFT');
    const response = await run();
    expect(response.status).toBe(200);
  });

  describe('without a session in reconstruction mode', () => {
    const env = process.env as Record<string, string | undefined>;
    const original = { NODE_ENV: env.NODE_ENV, SCHEDULING_GENERATION_MODE: env.SCHEDULING_GENERATION_MODE };

    beforeEach(() => {
      env.SCHEDULING_GENERATION_MODE = 'RECONSTRUCTION_GATE_8C';
      sessionActor.mockRejectedValue(new Error('UNAUTHORIZED'));
      db.user.findFirst.mockResolvedValue(pm);
    });
    afterEach(() => {
      env.NODE_ENV = original.NODE_ENV;
      if (original.SCHEDULING_GENERATION_MODE === undefined) delete env.SCHEDULING_GENERATION_MODE;
      else env.SCHEDULING_GENERATION_MODE = original.SCHEDULING_GENERATION_MODE;
    });

    test('production refuses the request', async () => {
      env.NODE_ENV = 'production';
      const response = await run();
      expect(response.status).toBe(401);
      expect(db.user.findFirst).not.toHaveBeenCalled();
      expect(orchestrator).not.toHaveBeenCalled();
    });

    test('outside production it acts as a project manager, for the local script', async () => {
      env.NODE_ENV = 'test';
      await run();
      expect(schedulingAccess).toHaveBeenCalledWith('user-1', 'PROJECT_MANAGER', 'project-1', 'canEditDraft');
    });
  });
});

describe('DELETE scheduling/delete', () => {
  const run = () => deleteSchedule(new Request('http://erp.test/x', { method: 'DELETE' }), routeContext);

  test('refuses a request without a session', async () => {
    sessionActor.mockRejectedValue(new Error('UNAUTHORIZED'));
    const response = await run();
    expect(response.status).toBe(401);
    expect(db.projectSchedule.findMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test('needs canDeleteDraft', async () => {
    schedulingAccess.mockResolvedValue({ allowed: false });
    const response = await run();
    expect(schedulingAccess).toHaveBeenCalledWith('user-1', 'PROJECT_MANAGER', 'project-1', 'canDeleteDraft');
    expect(response.status).toBe(403);
    expect(db.projectSchedule.findMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test.each(['READY_FOR_REVIEW', 'TECHNICALLY_APPROVED', 'ACTIVE_BASELINE', 'SUPERSEDED_BASELINE'])('does not delete a schedule in %s', async (workflowStatus) => {
    db.projectSchedule.findMany.mockResolvedValue([{ id: 'schedule-1', workflowStatus }]);
    const response = await run();
    expect(response.status).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test('does not delete anything when one of several schedules is past drafting', async () => {
    db.projectSchedule.findMany.mockResolvedValue([
      { id: 'schedule-1', workflowStatus: 'AI_GENERATED_DRAFT' },
      { id: 'schedule-2', workflowStatus: 'ACTIVE_BASELINE' },
    ]);
    const response = await run();
    expect(response.status).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  test.each(['AI_GENERATED_DRAFT', 'INVALID_GENERATED_DRAFT', 'TECHNICAL_REVISIONS_REQUIRED'])('deletes a schedule in %s', async (workflowStatus) => {
    db.projectSchedule.findMany.mockResolvedValue([{ id: 'schedule-1', workflowStatus }]);
    const response = await run();
    expect(response.status).toBe(200);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

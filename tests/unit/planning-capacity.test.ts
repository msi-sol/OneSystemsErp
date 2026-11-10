jest.mock('@/lib/prisma', () => ({
  prisma: {
    projectUserAssignment: { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    workPackageCapacityGrant: { findMany: jest.fn() },
    uploadedWorkbookFile: { findFirst: jest.fn() },
  },
}));
jest.mock('@/lib/permissions', () => ({ hasPermission: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

import { cookies } from 'next/headers';
import { hasPermission } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';

const db = prisma as unknown as {
  projectUserAssignment: { findUnique: jest.Mock };
  project: { findUnique: jest.Mock };
  workPackageCapacityGrant: { findMany: jest.Mock };
  uploadedWorkbookFile: { findFirst: jest.Mock };
};
const mockCookies = cookies as jest.Mock;

function setup({
  role = 'SUPER_ADMIN',
  sourceUploader = 'uploader',
  status = 'PLANNING',
  simulatedRole,
  grants = [],
  assignment = null,
  canView = false,
}: {
  role?: string;
  sourceUploader?: string | null;
  status?: string;
  simulatedRole?: string;
  grants?: { capacity: string }[];
  assignment?: { projectRole: string; assignmentStatus: string } | null;
  canView?: boolean;
} = {}) {
  db.projectUserAssignment.findUnique.mockResolvedValue(assignment);
  db.project.findUnique.mockResolvedValue({ status });
  db.workPackageCapacityGrant.findMany.mockResolvedValue(grants);
  db.uploadedWorkbookFile.findFirst.mockResolvedValue(sourceUploader ? { uploadedBy: sourceUploader } : null);
  (hasPermission as jest.Mock).mockImplementation((_userId: string, _module: string, permission: string) => Promise.resolve(permission === 'canView' && canView));
  mockCookies.mockResolvedValue({ get: () => simulatedRole ? { value: simulatedRole } : undefined });
  return planningCapacity({ id: 'uploader', role }, 'project-a');
}

describe('planning capacity source uploader access', () => {
  // These cover the capacity rules when they are switched on.
  beforeEach(() => { jest.clearAllMocks(); process.env.NEXT_PUBLIC_WPS_CAPACITIES_REQUIRED = 'true'; });
  afterAll(() => { delete process.env.NEXT_PUBLIC_WPS_CAPACITIES_REQUIRED; });

  it('derives planner, engineer, and PM capabilities from this project’s original BOQ uploader record', async () => {
    const result = await setup();

    expect(db.uploadedWorkbookFile.findFirst).toHaveBeenCalledWith({
      where: { projectId: 'project-a', templateCode: 'BOQ_WORKSPACE', templateName: 'BOQ Workspace Import' },
      orderBy: [{ uploadedAt: 'asc' }, { id: 'asc' }],
      select: { uploadedBy: true },
    });
    expect(result).toMatchObject({
      sourceUploaderAccess: true,
      capacities: ['PLANNER', 'PROJECT_ENGINEER', 'PROJECT_MANAGER'],
      canView: true,
      canEditPlan: true,
      canReviewPlan: true,
      canApprovePlan: true,
    });
    expect(result).not.toHaveProperty('approved');
    expect(db.workPackageCapacityGrant.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not auto-grant another SUPER_ADMIN on this project', async () => {
    const result = await setup({ sourceUploader: 'different-user' });

    expect(result.capacities).toEqual([]);
    expect(result.sourceUploaderAccess).toBe(false);
    expect(result.canEditPlan).toBe(false);
    expect(result.canReviewPlan).toBe(false);
    expect(result.canApprovePlan).toBe(false);
  });

  it('keeps the normal explicit grant path for non-owner project members', async () => {
    const result = await setup({
      role: 'PROJECT_MANAGER',
      sourceUploader: 'different-user',
      grants: [{ capacity: 'PROJECT_MANAGER' }],
      assignment: { projectRole: 'PROJECT_MANAGER', assignmentStatus: 'active' },
    });

    expect(result.sourceUploaderAccess).toBe(false);
    expect(result.capacities).toEqual(['PROJECT_MANAGER']);
    expect(result.canApprovePlan).toBe(true);
  });

  it('does not let simulated roles inherit uploader access or other simulated capabilities', async () => {
    const result = await setup({ simulatedRole: 'PROJECT_MANAGER', canView: true });

    expect(result.sourceUploaderAccess).toBe(false);
    expect(result.capacities).toEqual(['PROJECT_MANAGER']);
    expect(result.canEditPlan).toBe(false);
    expect(result.canReviewPlan).toBe(false);
    expect(result.canApprovePlan).toBe(true);
  });

  it('does not expose planning capabilities for an archived project', async () => {
    const result = await setup({ status: 'ARCHIVED' });

    expect(result.sourceUploaderAccess).toBe(false);
    expect(result.canEditPlan).toBe(false);
    expect(result.canReviewPlan).toBe(false);
    expect(result.canApprovePlan).toBe(false);
  });

  it('does not auto-grant a non-super-admin source uploader', async () => {
    const result = await setup({ role: 'PROJECT_ENGINEER' });

    expect(result.sourceUploaderAccess).toBe(false);
    expect(result.canEditPlan).toBe(false);
    expect(result.canReviewPlan).toBe(false);
    expect(result.canApprovePlan).toBe(false);
  });
});

describe('planning capacity with capacity rules off (default)', () => {
  beforeEach(() => { jest.clearAllMocks(); delete process.env.NEXT_PUBLIC_WPS_CAPACITIES_REQUIRED; });

  it('lets an admin simulating SUPER_ADMIN prepare, review and approve without capacity grants', async () => {
    const result = await setup({ role: 'ADMIN', sourceUploader: 'different-user', simulatedRole: 'SUPER_ADMIN' });

    expect(result.capacities).toEqual([]);
    expect(result).toMatchObject({ canEditPlan: true, canReviewPlan: true, canApprovePlan: true, canManageCapacities: false });
  });

  it('follows the project roles: an engineer prepares and reviews but does not approve', async () => {
    const result = await setup({ role: 'PROJECT_ENGINEER', sourceUploader: null, assignment: { projectRole: 'PROJECT_ENGINEER', assignmentStatus: 'active' } });

    expect(result).toMatchObject({ canEditPlan: true, canReviewPlan: true, canApprovePlan: false });
  });

  it('still gives a view-only user nothing, and nothing on an archived project', async () => {
    const viewer = await setup({ role: 'GUEST', sourceUploader: null, canView: true });
    expect(viewer).toMatchObject({ canView: true, canEditPlan: false, canReviewPlan: false, canApprovePlan: false });

    const archived = await setup({ status: 'ARCHIVED' });
    expect(archived).toMatchObject({ canEditPlan: false, canReviewPlan: false, canApprovePlan: false });
  });
});

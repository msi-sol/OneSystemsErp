jest.mock('@/lib/prisma', () => ({
  prisma: { $transaction: jest.fn() },
  transactionContext: { run: (_context: unknown, work: () => unknown) => work() },
}));
jest.mock('@/lib/scheduling/planning-capacity', () => ({ planningCapacity: jest.fn() }));
jest.mock('@/lib/scheduling/work-package-execution', () => ({ assertWorkPackageExecutedScope: jest.fn() }));

import { prisma } from '@/lib/prisma';
import { planningCapacity } from '@/lib/scheduling/planning-capacity';
import { assertWorkPackageExecutedScope } from '@/lib/scheduling/work-package-execution';
import { updateWorkPackageDetails } from '@/lib/scheduling/work-package-details';
import { WORK_PACKAGE_DETAILS_KIND } from '@/lib/scheduling/work-package-details-types';

const actor = { id: 'user-a', role: 'PROJECT_ENGINEER' };
const suggested = (id: string, activityId: string) => ({ id, activityId, kind: 'MATERIAL', description: 'Suggested material allowance', unit: 'lot', quantity: '1', unitCost: '10.00', amount: '10.00', isSystemSuggested: true });

function harness() {
  const schedule = {
    id: 'schedule-a', projectId: 'project-a', rowVersion: 4, workflowStatus: 'AI_GENERATED_DRAFT', generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1',
    description: JSON.stringify({
      kind: WORK_PACKAGE_DETAILS_KIND, locations: [], constraints: [], allocationLocations: {}, breakdownUploads: [],
      resources: [suggested('r-a', 'package-a'), suggested('r-b', 'package-b'), suggested('r-c', 'package-c')],
      resourcesReviewNeeded: { 'package-b': true },
    }),
  };
  const tx = {
    project: { findUnique: jest.fn().mockResolvedValue({ id: 'project-a', status: 'ACTIVE' }) },
    projectSchedule: {
      findFirst: jest.fn().mockResolvedValueOnce(schedule).mockResolvedValue({ ...schedule, activities: [] }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    scheduleActivity: { findMany: jest.fn().mockResolvedValue(['package-a', 'package-b', 'package-c'].map(id => ({ id, name: id, allocatedAmount: '100' }))) },
    auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-a' }) },
  };
  (planningCapacity as jest.Mock).mockResolvedValue({ canEditPlan: true });
  (assertWorkPackageExecutedScope as jest.Mock).mockResolvedValue(undefined);
  (prisma.$transaction as unknown as jest.Mock).mockImplementation((work: (client: unknown) => unknown) => work(tx));
  return tx;
}

describe('confirming suggested allowances', () => {
  beforeEach(() => jest.clearAllMocks());

  it('confirms several packages in one save and leaves the others as suggestions', async () => {
    const tx = harness();
    const result = await updateWorkPackageDetails({ projectId: 'project-a', actor, body: { action: 'confirm-resources', scheduleId: 'schedule-a', expectedRowVersion: 4, activityIds: ['package-a', 'package-b'] } });
    expect(tx.projectSchedule.updateMany).toHaveBeenCalledTimes(1);
    const byId = Object.fromEntries(result.details.resources.map(row => [row.id, row]));
    expect(byId['r-a']).toMatchObject({ isSystemSuggested: false, reviewedById: 'user-a' });
    expect(byId['r-b']).toMatchObject({ isSystemSuggested: false, reviewedById: 'user-a' });
    expect(byId['r-c']).toMatchObject({ isSystemSuggested: true });
    expect(result.details.resourcesReviewNeeded?.['package-b']).toBeUndefined();
    expect(result.rowVersion).toBe(5);
  });

  it('rejects an unknown package without saving', async () => {
    const tx = harness();
    await expect(updateWorkPackageDetails({ projectId: 'project-a', actor, body: { action: 'confirm-resources', scheduleId: 'schedule-a', expectedRowVersion: 4, activityIds: ['package-a', 'package-x'] } }))
      .rejects.toMatchObject({ message: 'ACTIVITY_NOT_FOUND' });
    expect(tx.projectSchedule.updateMany).not.toHaveBeenCalled();
  });
});

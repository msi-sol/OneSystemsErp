jest.mock('@/lib/prisma', () => ({
  prisma: {
    projectSchedule: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
  transactionContext: { run: jest.fn((_context: unknown, callback: () => unknown) => callback()) },
}));

import { prisma } from '@/lib/prisma';
import { startScheduleReview } from '@/lib/scheduling/scheduleWorkflow';

describe('legacy scheduling review boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects legacy technical-review transition for a tagged BOQ Work Packages schedule', async () => {
    (prisma.projectSchedule.findUnique as jest.Mock).mockResolvedValue({
      id: 'new-wps', projectId: 'project-a', rowVersion: 4, workflowStatus: 'READY_FOR_REVIEW',
      generationRulesVersion: 'BOQ_WPS_WORKSPACE_V1',
    });

    await expect(startScheduleReview({ projectId: 'project-a', scheduleId: 'new-wps', actorId: 'engineer-a', expectedRowVersion: 4 }))
      .rejects.toThrow('USE_BOQ_WPS_ENGINEER_PM_WORKFLOW');
    expect(prisma.projectSchedule.update).not.toHaveBeenCalled();
  });

  it('preserves the legacy transition for untagged schedules', async () => {
    (prisma.projectSchedule.findUnique as jest.Mock).mockResolvedValue({
      id: 'legacy', projectId: 'project-a', rowVersion: 4, workflowStatus: 'READY_FOR_REVIEW',
      generationRulesVersion: 'v1.0',
    });
    (prisma.projectSchedule.update as jest.Mock).mockResolvedValue({ id: 'legacy', workflowStatus: 'UNDER_TECHNICAL_REVIEW' });

    await expect(startScheduleReview({ projectId: 'project-a', scheduleId: 'legacy', actorId: 'engineer-a', expectedRowVersion: 4 }))
      .resolves.toMatchObject({ workflowStatus: 'UNDER_TECHNICAL_REVIEW' });
    expect(prisma.projectSchedule.update).toHaveBeenCalledTimes(1);
  });
});

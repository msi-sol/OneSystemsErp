jest.mock('@/lib/prisma', () => ({ prisma: {
  project: { findUnique: jest.fn() },
  projectBOQVersion: { findFirst: jest.fn() },
  projectSchedule: { findFirst: jest.fn() },
  purchaseOrder: { count: jest.fn() },
} }));
jest.mock('../../src/app/projects/[id]/ProjectTimelineEditor', () => ({ __esModule: true, default: () => null }));
jest.mock('../../src/app/projects/[id]/ProjectSummary.module.css', () => ({}));

import { renderToStaticMarkup } from 'react-dom/server';
import { prisma } from '@/lib/prisma';
import ProjectSummaryTab from '../../src/app/projects/[id]/ProjectSummaryTab';

it('includes approved delivery costs in the summary without counting source expenses twice', async () => {
  (prisma.project.findUnique as jest.Mock).mockResolvedValue({
    contractAmount: 1000, variationOrders: [], billings: [],
    expenses: [{ netAmount: 10 }], subcontractBillings: [{ currentGross: 20 }],
    projectCostLedgers: [{ netAmount: 88 }, { netAmount: 132 }],
    materialRequests: [], workers: [], awardedBoqItems: [], startDate: null, originalCompletionDate: null, revisedCompletionDate: null,
  });
  (prisma.projectBOQVersion.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.projectSchedule.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.purchaseOrder.count as jest.Mock).mockResolvedValue(0);
  const html = renderToStaticMarkup((await ProjectSummaryTab({ projectId: 'project-1' }))!);
  const actualCost = html.slice(html.indexOf('Actual Cost to Date'), html.indexOf('Contract remaining after approved costs'));
  expect(actualCost).toContain('220.00');
  expect(actualCost).not.toContain('30.00');
  expect(html).toContain('2 approved actual-cost ledger entries included.');
  expect(html).toContain('Balance before future costs');
  expect(html).not.toContain('Projected Profit');
  expect(prisma.project.findUnique).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({
    projectCostLedgers: { where: { approvalStatus: 'APPROVED' }, select: { netAmount: true } },
  }) }));
});

it('shows the project BOQ version and latest schedule with scoped summary links', async () => {
  (prisma.project.findUnique as jest.Mock).mockResolvedValue({
    contractAmount: 1000, variationOrders: [], billings: [], expenses: [], subcontractBillings: [],
    projectCostLedgers: [], materialRequests: [], workers: [], awardedBoqItems: [{ id: 'item-1' }, { id: 'item-2' }],
    startDate: null, originalCompletionDate: null, revisedCompletionDate: null,
  });
  (prisma.projectBOQVersion.findFirst as jest.Mock).mockResolvedValue({
    versionNumber: 1, versionLabel: 'Draft BOQ Workspace Import', status: 'DRAFT', totalAmount: 1234.5, sourceProvenance: 'BOQ_WORKSPACE',
  });
  (prisma.projectSchedule.findFirst as jest.Mock).mockResolvedValue({
    name: 'WPS Revision 2', workflowStatus: 'TECHNICAL_REVISIONS_REQUIRED', baselineCode: null, revisionCode: 'R2', _count: { activities: 3 },
  });
  (prisma.purchaseOrder.count as jest.Mock).mockResolvedValue(0);

  const html = renderToStaticMarkup((await ProjectSummaryTab({ projectId: 'project-1' }))!);

  expect(html).toContain('Draft workbook import · not approved');
  expect(html).toContain('1,234.50');
  expect(html).toContain('2 project BOQ items');
  expect(html).toContain('WPS Revision 2');
  expect(html).toContain('TECHNICAL REVISIONS REQUIRED');
  expect(html).toContain('3 packages · R2');
  expect(html).toContain('href="/projects/project-1/boq"');
  expect(html).toContain('href="/projects/project-1/work-packages"');
  expect(html).toContain('100.0%');
  expect(prisma.projectBOQVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'project-1' } }));
  expect(prisma.projectSchedule.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'project-1' } }));
});

it('marks missing BOQ and schedule data unavailable rather than inventing zero totals or packages', async () => {
  (prisma.project.findUnique as jest.Mock).mockResolvedValue({
    contractAmount: 0, variationOrders: [], billings: [], expenses: [], subcontractBillings: [],
    projectCostLedgers: [], materialRequests: [], workers: [], awardedBoqItems: [],
    startDate: null, originalCompletionDate: null, revisedCompletionDate: null,
  });
  (prisma.projectBOQVersion.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.projectSchedule.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.purchaseOrder.count as jest.Mock).mockResolvedValue(0);

  const html = renderToStaticMarkup((await ProjectSummaryTab({ projectId: 'project-1' }))!);

  expect(html).toContain('BOQ total and item count are unavailable');
  expect(html).toContain('package count and execution status are unavailable');
  expect(html).toContain('Actual Cost to Date</h3><p');
  expect(html).toContain('Not available');
  expect(html).toContain('No approved actual-cost ledger entries recorded.');
});

it('shows a recorded zero actual cost when an approved zero-value ledger entry exists', async () => {
  (prisma.project.findUnique as jest.Mock).mockResolvedValue({
    contractAmount: 1000, variationOrders: [], billings: [], expenses: [], subcontractBillings: [],
    projectCostLedgers: [{ netAmount: 0 }], materialRequests: [], workers: [], awardedBoqItems: [],
    startDate: null, originalCompletionDate: null, revisedCompletionDate: null,
  });
  (prisma.projectBOQVersion.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.projectSchedule.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.purchaseOrder.count as jest.Mock).mockResolvedValue(0);

  const html = renderToStaticMarkup((await ProjectSummaryTab({ projectId: 'project-1' }))!);
  const actualCost = html.slice(html.indexOf('Actual Cost to Date'), html.indexOf('Contract remaining after approved costs'));

  expect(actualCost).toContain('₱ 0.00');
  expect(html).toContain('1 approved actual-cost ledger entry included.');
  expect(actualCost).not.toContain('Not available');
});

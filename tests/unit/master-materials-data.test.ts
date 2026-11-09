jest.mock('@/lib/prisma', () => ({ prisma: { project: { findUnique: jest.fn() }, auditLog: { findFirst: jest.fn() }, consolidatedBOQItem: { findMany: jest.fn() }, procurementBenchmarkItem: { findMany: jest.fn().mockResolvedValue([]) }, user: { findUnique: jest.fn(), findMany: jest.fn() } } }));
jest.mock('@/lib/dal/auth', () => ({ verifySession: jest.fn().mockResolvedValue({ id: 'admin' }) }));
jest.mock('@/lib/boq/material-allowance-usage', () => ({ readMaterialAllowanceUsage: jest.fn().mockResolvedValue([]) }));
jest.mock('@/lib/procurement/load-material-tracking', () => ({ loadMaterialTracking: jest.fn().mockResolvedValue({}) }));
jest.mock('next/headers', () => ({ cookies: jest.fn().mockResolvedValue({ get: jest.fn() }) }));
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
jest.mock('../../src/app/projects/[id]/AutoConsolidateButton', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../src/app/projects/[id]/UploadMasterMaterialsButton', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../../src/app/projects/[id]/ConsolidatedBOQViewer', () => ({ __esModule: true, default: jest.fn() }));

import { prisma } from '@/lib/prisma';
import BOQConsolidationTab from '../../src/app/projects/[id]/BOQConsolidationTab';
import ConsolidatedBOQViewer from '../../src/app/projects/[id]/ConsolidatedBOQViewer';

it('keeps an approved material with a positive quantity and zero cost visible in the master list', async () => {
  const material = { id: 'free-material', quantity: 100, totalCost: 0, isVariationItem: false };
  (prisma.project.findUnique as jest.Mock).mockResolvedValue({ consolidatedBOQLocked: true });
  (prisma.auditLog.findFirst as jest.Mock).mockResolvedValue({ id: 'generated-review' });
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: 'SUPER_ADMIN', userRoles: [] });
  (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.consolidatedBOQItem.findMany as jest.Mock).mockImplementation(({ where }) => Promise.resolve(where.OR ? [] : [material]));
  const result = await BOQConsolidationTab({ projectId: 'project', isBenchmarkLocked: true });
  const viewer = (result.props.children as React.ReactElement<{ consolidatedItems: unknown[]; totalItems: number; totalAmount: number }>[]).find(child => child?.type === ConsolidatedBOQViewer)!;
  expect(viewer.props.consolidatedItems).toEqual([material]);
  expect(viewer.props.totalItems).toBe(1);
  expect(viewer.props.totalAmount).toBe(0);
});

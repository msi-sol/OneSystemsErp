jest.mock('@/lib/dal/auth', () => ({ verifySession: jest.fn() }));
jest.mock('@/lib/permissions', () => ({ getUserPermissions: jest.fn() }));
jest.mock('@/lib/prisma', () => ({ prisma: {
  worker: { deleteMany: jest.fn() },
  supplier: { deleteMany: jest.fn() },
  subcontractor: { deleteMany: jest.fn() },
  $transaction: jest.fn(),
} }));
jest.mock('../../prisma/seeders/seed-workers', () => ({ seedWorkers: jest.fn() }));
jest.mock('../../prisma/seeders/seed-suppliers', () => ({ seedSuppliers: jest.fn() }));
jest.mock('../../prisma/seeders/seed-subcontractors', () => ({ seedSubcontractors: jest.fn() }));

import { verifySession } from '@/lib/dal/auth';
import { getUserPermissions } from '@/lib/permissions';
import { prisma } from '@/lib/prisma';
import { seedWorkers } from '../../prisma/seeders/seed-workers';
import { seedSuppliers } from '../../prisma/seeders/seed-suppliers';
import { seedSubcontractors } from '../../prisma/seeders/seed-subcontractors';
import * as seedRoute from '@/app/api/admin/seed/route';
import { POST as clear } from '@/app/api/admin/clear-seed/route';

beforeEach(() => {
  jest.resetAllMocks();
  (verifySession as jest.Mock).mockResolvedValue({ id: 'admin', mustChangePassword: false });
  (getUserPermissions as jest.Mock).mockResolvedValue({ IS_ADMIN: true });
});

describe.each([['seed', seedRoute.POST], ['clear', clear]] as const)('%s seed data', (_name, handler) => {
  test.each([null, { id: 'admin', mustChangePassword: true }])('rejects an invalid session before any database mutation', async actor => {
    (verifySession as jest.Mock).mockResolvedValue(actor);
    expect((await handler()).status).toBe(401);
    expect(getUserPermissions).not.toHaveBeenCalled();
    expect(seedWorkers).not.toHaveBeenCalled();
    expect(prisma.worker.deleteMany).not.toHaveBeenCalled();
  });

  test('rejects a user without administrator permissions', async () => {
    (getUserPermissions as jest.Mock).mockResolvedValue({ IS_ADMIN: false });
    expect((await handler()).status).toBe(403);
    expect(seedWorkers).not.toHaveBeenCalled();
    expect(prisma.worker.deleteMany).not.toHaveBeenCalled();
  });
});

test('seeding accepts the POST method used by Database Tools', async () => {
  expect('GET' in seedRoute).toBe(false);
  expect((await seedRoute.POST()).status).toBe(200);
  expect(seedWorkers).toHaveBeenCalledTimes(1);
  expect(seedSuppliers).toHaveBeenCalledTimes(1);
  expect(seedSubcontractors).toHaveBeenCalledTimes(1);
});

test('cleanup includes only seed records in one transaction', async () => {
  const pending = ['workers', 'suppliers', 'subcontractors'].map(name => Promise.resolve({ name }));
  (prisma.worker.deleteMany as jest.Mock).mockReturnValue(pending[0]);
  (prisma.supplier.deleteMany as jest.Mock).mockReturnValue(pending[1]);
  (prisma.subcontractor.deleteMany as jest.Mock).mockReturnValue(pending[2]);
  expect((await clear()).status).toBe(200);
  for (const table of [prisma.worker, prisma.supplier, prisma.subcontractor]) {
    expect(table.deleteMany).toHaveBeenCalledWith({ where: { isSeedData: true } });
  }
  expect(prisma.$transaction).toHaveBeenCalledWith(pending);
});

test('a failed cleanup reports failure instead of success', async () => {
  (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('Foreign key constraint'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try { expect((await clear()).status).toBe(500); } finally { log.mockRestore(); }
});

jest.mock('@/lib/backend-fetch', () => ({ backendFetch: jest.fn() }));
jest.mock('@/lib/dal/auth', () => ({ verifySession: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

import { backendFetch } from '@/lib/backend-fetch';
import { verifySession } from '@/lib/dal/auth';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { computePayrollForPeriod, deletePayrollPeriod } from '@/app/actions/payrollEngine';

beforeEach(() => {
  jest.resetAllMocks();
  (verifySession as jest.Mock).mockResolvedValue({ id: 'actor' });
  (cookies as jest.Mock).mockResolvedValue({ get: () => undefined });
});

test('computes through the canonical permission-checked endpoint and returns the worker count', async () => {
  const result = { success: true, count: 3 };
  (backendFetch as jest.Mock).mockResolvedValue(Response.json(result));

  await expect(computePayrollForPeriod('period-1')).resolves.toEqual(result);

  expect(backendFetch).toHaveBeenCalledTimes(1);
  const [endpoint, options] = (backendFetch as jest.Mock).mock.calls[0];
  expect(endpoint).toBe('/api/payroll/engine/compute');
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toEqual({ payrollPeriodId: 'period-1' });
  expect(options.headers.get('Content-Type')).toBe('application/json');
  expect(revalidatePath).toHaveBeenCalledWith('/payroll/period-1');
});

test('deletes through the canonical endpoint with its permission and DRAFT safeguards', async () => {
  (backendFetch as jest.Mock).mockResolvedValue(Response.json({ success: true }));

  await expect(deletePayrollPeriod('period-1')).resolves.toEqual({ success: true });

  expect(backendFetch).toHaveBeenCalledTimes(1);
  const [endpoint, options] = (backendFetch as jest.Mock).mock.calls[0];
  expect(endpoint).toBe('/api/payroll/period/period-1');
  expect(options.method).toBe('DELETE');
  expect(options.body).toBeUndefined();
  expect(revalidatePath).toHaveBeenCalledWith('/payroll');
});

test.each([
  ['compute permission denial', computePayrollForPeriod, 403, 'Forbidden'],
  ['delete non-DRAFT rejection', deletePayrollPeriod, 500, 'Only DRAFT periods can be deleted'],
] as const)('propagates %s without refreshing the UI as a successful mutation', async (_name, action, status, error) => {
  (backendFetch as jest.Mock).mockResolvedValue(Response.json({ error }, { status }));

  await expect(action('period-1')).rejects.toThrow(error);
  expect(revalidatePath).not.toHaveBeenCalled();
});

test.each([computePayrollForPeriod, deletePayrollPeriod])('propagates signed backend transport failures', async (action) => {
  (backendFetch as jest.Mock).mockRejectedValue(new Error('An active session is required'));

  await expect(action('period-1')).rejects.toThrow('An active session is required');
  expect(revalidatePath).not.toHaveBeenCalled();
});

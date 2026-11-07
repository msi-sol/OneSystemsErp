jest.mock('../../apps/aws-backend/src/lib/prisma', () => ({ prisma: {} }));

import { createRequireAuth } from '../../apps/aws-backend/src/middleware/auth';
import { createBackendToken } from '../../src/lib/backend-token';

const ORIGINAL_SECRET = process.env.BACKEND_INTERNAL_SECRET;

const activeUser = {
  id: 'user-1', role: 'PROJECT_ENGINEER', status: 'ACTIVE', sessionVersion: 3,
  mustChangePassword: false, lockedUntil: null,
};

function run(body: any) {
  const store = { user: { findUnique: jest.fn().mockResolvedValue(activeUser) } };
  const middleware = createRequireAuth(store);
  const path = '/api/jobOrderActions/createJobOrder';
  const token = createBackendToken({ userId: activeUser.id, sessionVersion: activeUser.sessionVersion, method: 'POST', path });
  const req: any = { method: 'POST', originalUrl: path, url: path, headers: { authorization: `Bearer ${token}` }, body };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return middleware(req, res, next).then(() => ({ req, res, next }));
}

describe('backend auth middleware request-body context', () => {
  beforeAll(() => { process.env.BACKEND_INTERNAL_SECRET = 'x'.repeat(48); });
  afterAll(() => { process.env.BACKEND_INTERNAL_SECRET = ORIGINAL_SECRET; });

  it('exposes the verified user as req.body.sessionId, overriding client values', async () => {
    const { req, next } = await run({ name: 'Crane', sessionId: 'spoofed-user' });
    expect(next).toHaveBeenCalled();
    expect(req.body.sessionId).toBe('user-1');
    const { sessionId } = req.body;
    expect(sessionId).toBe('user-1');
  });

  it('keeps injected keys out of spreads and serialization so bodies can be passed to Prisma', async () => {
    const { req } = await run({ name: 'Crane', capacity: 5 });
    expect(Object.keys(req.body)).toEqual(['name', 'capacity']);
    expect({ ...req.body }).toEqual({ name: 'Crane', capacity: 5 });
    expect(JSON.parse(JSON.stringify(req.body))).toEqual({ name: 'Crane', capacity: 5 });
  });

  it('does not grant role simulation to roles that may not simulate', async () => {
    const { req } = await run({ simulatedRole: 'SUPER_ADMIN' });
    expect(req.body.simulatedRole).toBeUndefined();
  });
});

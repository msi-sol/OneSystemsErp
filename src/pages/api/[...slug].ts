import type { NextApiRequest, NextApiResponse } from 'next';
import app from '../../../apps/aws-backend/src/index';
import { auth } from '../../auth';
import { prismaBase as prisma } from '../../lib/prisma-base';
import { createBackendToken } from '../../lib/backend-token';

export const config = {
  api: {
    externalResolver: true,
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await auth(req, res);
    if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, status: true, sessionVersion: true, mustChangePassword: true, lockedUntil: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.sessionVersion !== session.user.sessionVersion ||
        (user.lockedUntil && user.lockedUntil > new Date())) {
      return res.status(401).json({ error: 'Session is no longer valid' });
    }
    if (user.mustChangePassword) return res.status(403).json({ error: 'PASSWORD_CHANGE_REQUIRED' });
    // Browser-supplied internal authorization/identity headers are never trusted.
    delete req.headers['x-user-session'];
    delete req.headers['x-active-project-id'];
    delete req.headers['x-simulated-role'];
    req.headers.authorization = `Bearer ${createBackendToken({
      userId: user.id,
      sessionVersion: user.sessionVersion,
      method: req.method || 'GET',
      path: (req.url || '').split('?')[0],
      activeProjectId: req.cookies.activeProjectId,
      simulatedRole: req.cookies.simulatedRole,
    })}`;
    return app(req, res);
  } catch (error) {
    console.error('Backend bridge authentication failed:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ error: 'Backend authentication unavailable' });
  }
}

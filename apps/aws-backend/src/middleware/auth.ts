import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { verifyBackendToken } from '../../../../src/lib/backend-token';

export interface AuthenticatedRequest extends Request {
  user?: any;
  pbacContext?: {
    activeProjectId?: string;
    simulatedRole?: string;
  };
}

type AuthUser = {
  id: string; role: string; status: string; sessionVersion: number;
  mustChangePassword: boolean; lockedUntil: Date | null;
};
type UserStore = { user: { findUnique: (args: any) => Promise<AuthUser | null> } };
const SIMULATION_ROLES = new Set(['SUPER_ADMIN', 'SYSTEM_ADMIN', 'ADMIN', 'PROJECT_DIRECTOR', 'DIRECTORS']);

function requiresSuperAdmin(path: string, method: string) {
  const normalized = decodeURIComponent(path).replace(/\/+$/, '').toLowerCase();
  if (/^\/api\/(systemresetactions|simulationclearactions|migration)(\/|$)/.test(normalized)) return true;
  // This endpoint returns complete user records, including password fields.
  if (/^\/api\/user-roles(\/|$)/.test(normalized)) return true;
  if (/^\/api\/user(\/|$)/.test(normalized)) return normalized !== '/api/user/getsystemroles';
  return /^\/api\/permissions(\/|$)/.test(normalized) && !['GET', 'HEAD', 'OPTIONS'].includes(method);
}

export function createRequireAuth(store: UserStore) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const authorization = req.headers.authorization;
      const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7) : '';
      const path = (req.originalUrl || req.url).split('?')[0];
      const claims = verifyBackendToken(token, req.method, path);
      if (!claims) return res.status(401).json({ error: 'Unauthorized: Invalid backend credential' });
      const user = await store.user.findUnique({
        where: { id: claims.userId },
        select: { id: true, role: true, status: true, sessionVersion: true, mustChangePassword: true, lockedUntil: true },
      });
      if (!user || user.status !== 'ACTIVE' || user.sessionVersion !== claims.sessionVersion ||
          (user.lockedUntil && user.lockedUntil > new Date())) {
        return res.status(401).json({ error: 'Unauthorized: Session is no longer valid' });
      }
      if (user.mustChangePassword) return res.status(403).json({ error: 'PASSWORD_CHANGE_REQUIRED' });
      if (requiresSuperAdmin(path, req.method) && user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Forbidden: SUPER_ADMIN required' });
      }
      const simulatedRole = SIMULATION_ROLES.has(user.role) ? claims.simulatedRole : undefined;
      // Legacy routers read these fields directly. Only signed, validated context may reach them.
      delete req.headers['x-user-session'];
      delete req.headers['x-active-project-id'];
      delete req.headers['x-simulated-role'];
      req.headers['x-user-session'] = user.id;
      if (claims.activeProjectId) req.headers['x-active-project-id'] = claims.activeProjectId;
      if (simulatedRole) req.headers['x-simulated-role'] = simulatedRole;
      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
        req.body.sessionId = user.id;
        req.body.simulatedRole = simulatedRole;
      }
      req.user = user;
      req.pbacContext = { activeProjectId: claims.activeProjectId, simulatedRole };
      next();
    } catch (error) {
      console.error('Backend authentication failed:', error instanceof Error ? error.message : 'Unknown error');
      return res.status(500).json({ error: 'Backend authentication unavailable' });
    }
  };
}

export const requireAuth = createRequireAuth(prisma);

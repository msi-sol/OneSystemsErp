import 'server-only';
import { cookies } from 'next/headers';
import { verifyOperationalSession } from '@/lib/dal/auth';
import { createBackendToken } from '@/lib/backend-token';

/** Authenticated, uncached server-to-server access to the private Express API. */
export async function backendFetch(input: string | URL, options: RequestInit = {}): Promise<Response> {
  const base = new URL(process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:4000');
  if (!['127.0.0.1', 'localhost'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol)) {
    throw new Error('The backend must use a loopback address.');
  }
  const url = new URL(input, base);
  if (url.origin !== base.origin || !url.pathname.startsWith('/api/')) {
    throw new Error('Invalid private backend endpoint.');
  }
  const actor = await verifyOperationalSession();
  if (!actor) throw new Error('An active session with a completed password change is required.');
  const cookieStore = await cookies();
  const activeProjectId = cookieStore.get('activeProjectId')?.value;
  const canSimulate = ['SUPER_ADMIN', 'SYSTEM_ADMIN', 'ADMIN', 'PROJECT_DIRECTOR', 'DIRECTORS'].includes(actor.role);
  const simulatedRole = canSimulate ? cookieStore.get('simulatedRole')?.value : undefined;
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${createBackendToken({
    userId: actor.userId, sessionVersion: actor.sessionVersion, method,
    path: url.pathname, activeProjectId, simulatedRole,
  })}`);
  headers.set('x-user-session', actor.userId);
  if (activeProjectId) headers.set('x-active-project-id', activeProjectId);
  else headers.delete('x-active-project-id');
  if (simulatedRole) headers.set('x-simulated-role', simulatedRole);
  else headers.delete('x-simulated-role');
  return fetch(url, { ...options, method, headers, cache: 'no-store', redirect: 'error' });
}

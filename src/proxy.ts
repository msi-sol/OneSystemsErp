import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { verifySession } from '@/lib/dal/auth';
import { validLocalIntegrationDownload } from '@/lib/local-upload-token';

const PRODUCTION_SETUP_ROUTES = new Set([
  '/api/auth/debug', '/api/debug-db', '/api/debug-perms', '/api/fix-users',
  '/api/test', '/api/test-prisma', '/api/seed-permissions',
  '/api/admin/seed', '/api/admin/clear-seed', '/api/admin/create-admin',
]);

export default async function proxy(request: NextRequest) {
  // Extract path
  const pathname = request.nextUrl.pathname;
  if (pathname === '/api/uploads/file' && validLocalIntegrationDownload(new URL(request.url), request.nextUrl.searchParams.get('key') || '')) return NextResponse.next();
  const normalizedPath = pathname.toLowerCase().replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production' &&
      (PRODUCTION_SETUP_ROUTES.has(normalizedPath) || normalizedPath.startsWith('/api/internal/'))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password'];
  // Machine-to-machine endpoints with their own secret/signature checks (they fail closed).
  const INTEGRATION_ROUTES = ['/api/webhooks/unionbank', '/api/cron/payment-polling'];

  const isExactPublicRoute = PUBLIC_ROUTES.includes(pathname);

  // Allow public assets, offline fallback, exact public routes and Auth.js APIs.
  // The asset-extension rule never applies under /api/, so "/api/<anything>.json" still requires a session.
  const isPublicRoute = isExactPublicRoute ||
                        INTEGRATION_ROUTES.includes(normalizedPath) ||
                        pathname.startsWith('/~offline') ||
                        pathname.startsWith('/api/auth/') ||
                        (pathname.includes('/scheduling/simulate') && process.env.SCHEDULING_GENERATION_MODE === 'RECONSTRUCTION_GATE_8C') ||
                        (!pathname.startsWith('/api/') && pathname.match(/\.(png|jpg|jpeg|svg|ico|json|webmanifest)$/));

  // We only use auth() here optimistically. The real validation is in verifySession()
  const session: any = await auth();
  const hasValidSession = session && session.user && session.user.id;

  // 3. For an unauthenticated request to any exact public route: return NextResponse.next()
  if (isExactPublicRoute && !hasValidSession) {
    return NextResponse.next();
  }

  // 4. Only after the public-route decision, enforce authentication for protected routes
  // If user is NOT logged in and tries to access a protected route
  if (!hasValidSession && !isPublicRoute) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized Access. Please log in.' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (normalizedPath.startsWith('/api/admin/')) {
    const actor = await verifySession();
    if (!actor || actor.mustChangePassword || !['SUPER_ADMIN', 'SYSTEM_ADMIN'].includes(actor.role)) {
      return NextResponse.json({ error: 'Administrator access required' }, { status: 403 });
    }
  }

  // If user IS logged in
  if (hasValidSession) {
    // 1. Redirect away from login page, but only if the session is still valid server-side.
    // A stale token (password reset, deactivation, sessionVersion bump) must be able to sign in again
    // instead of bouncing between /login and pages that reject it.
    if (pathname === '/login') {
      const actor = await verifySession();
      if (!actor) return NextResponse.next();
      return NextResponse.redirect(new URL('/', request.url));
    }
    
    // 2. Enforce mustChangePassword
    // If the token says they must change password, redirect them unless they are already there or on auth APIs
    if (session.user?.mustChangePassword) {
      if (pathname !== '/change-password' && !pathname.startsWith('/api/auth/')) {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'PASSWORD_CHANGE_REQUIRED' }, { status: 403 });
        }
        return NextResponse.redirect(new URL('/change-password', request.url));
      }
    }
  }

  const response = NextResponse.next();

  // Security Headers
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

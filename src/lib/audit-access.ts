import { verifySession } from '@/lib/dal/auth';
import { hasPermission } from '@/lib/permissions';

const AUDIT_VIEWER_ROLES = ['SUPER_ADMIN', 'SYSTEM_ADMIN', 'PROJECT_DIRECTOR', 'DIRECTORS'];

/**
 * System-wide audit data (all users' activity, emails, AI decisions) is for administrators,
 * directors, or roles explicitly granted SYSTEM_SETTINGS.canViewAuditLogs.
 * Returns the actor, or null when the caller may not view audit data.
 */
export async function getAuditViewer() {
  const actor = await verifySession();
  if (!actor) return null;
  if (AUDIT_VIEWER_ROLES.includes(actor.role)) return actor;
  return (await hasPermission(actor.id, 'SYSTEM_SETTINGS', 'canViewAuditLogs')) ? actor : null;
}

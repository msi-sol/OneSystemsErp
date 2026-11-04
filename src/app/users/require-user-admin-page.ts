import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal/auth';
import { canAdministerUsers } from '@/lib/user-credentials';

export async function requireUserAdminPage() {
  const actor = await verifySession();
  if (!actor) redirect('/login');
  if (actor.mustChangePassword) redirect('/change-password');
  if (!canAdministerUsers(actor.role)) redirect('/');
  return actor;
}

import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/dal/auth';
import PasswordChangeForm from './PasswordChangeForm';

export default async function ChangePasswordPage() {
  const session = await verifySession();
  if (!session) redirect('/login');
  return <PasswordChangeForm required={session.mustChangePassword} />;
}

'use client';

import { useActionState } from 'react';
import { changePassword } from './actions';
import { logout } from '@/app/actions/auth';
import styles from './password-change.module.css';

export default function PasswordChangeForm({ required }: { required: boolean }) {
  const [state, formAction, pending] = useActionState(changePassword, { error: '' });

  return (
    <main className={styles.screen}>
      <section className={styles.panel} aria-labelledby="change-password-title">
        <h1 id="change-password-title">Change your password</h1>
        <p className={styles.introduction}>
          {required ? 'Set a personal password before continuing to OneSystemsErp.' : 'Update the password for your account.'}
          {' '}You’ll sign in again after saving.
        </p>
        <form action={formAction} className={styles.form} aria-busy={pending}>
          <div>
            <label htmlFor="current-password">Current password</label>
            <input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required />
          </div>
          <div>
            <label htmlFor="new-password">New password</label>
            <input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} aria-describedby="password-help" required />
            <p id="password-help" className={styles.help}>Use at least 12 characters and choose a password you haven’t used for this account.</p>
          </div>
          <div>
            <label htmlFor="confirm-password">Confirm new password</label>
            <input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" minLength={12} maxLength={72} required />
          </div>
          <p className={styles.error} aria-live="polite" role={state.error ? 'alert' : undefined}>{state.error}</p>
          <button type="submit" disabled={pending} className={styles.save}>
            {pending ? 'Saving password…' : 'Save password and sign out'}
          </button>
        </form>
        <form action={logout} className={styles.signOut}>
          <button type="submit" disabled={pending}>Sign out without changing password</button>
        </form>
      </section>
    </main>
  );
}

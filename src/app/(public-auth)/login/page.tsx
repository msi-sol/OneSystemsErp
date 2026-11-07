import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

/**
 * Pre-fills the login form from LOCAL_DEMO_EMAIL / LOCAL_DEMO_PASSWORD so the demo account signs in with one click.
 * Always on for the local dev server. On any other server (e.g. production) only when LOGIN_PREFILL_ENABLED="true"
 * is set there: the values are then sent in the login page to every visitor, so turn it off once the demo is over.
 */
export default function LoginPage() {
  const development = process.env.NODE_ENV === 'development';
  const enabled = development || process.env.LOGIN_PREFILL_ENABLED === 'true';
  const prefill = enabled
    ? { defaultEmail: process.env.LOCAL_DEMO_EMAIL ?? '', defaultPassword: process.env.LOCAL_DEMO_PASSWORD ?? '' }
    : {};
  return <LoginForm {...prefill} />;
}

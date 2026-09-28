import Link from 'next/link';
import { FlaskConical, LogIn } from 'lucide-react';
import { safeNext } from '../lib/session';

export const metadata = { title: 'Sign in · SciML Workbench' };

const ERRORS: Record<string, string> = {
  invalid: 'That username or password is not right. Please try again.',
  setup: 'Sign-in is not set up on this server yet. Ask the person who runs this workspace to set a username and password.',
};

export default async function SignIn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const next = safeNext(typeof query.next === 'string' ? query.next : undefined);
  const error = typeof query.error === 'string' ? ERRORS[query.error] : undefined;
  return (
    <main className="auth-page">
      <div className="hero-glow" aria-hidden="true" />
      <div className="auth-card">
        <Link href="/" className="landing-brand" aria-label="SciML Workbench home">
          <span className="brand-mark" aria-hidden="true"><FlaskConical size={18} /></span>
          <span>SciML Workbench</span>
        </Link>
        <div className="stack stack--tight">
          <h1>Welcome back</h1>
          <p className="auth-lede">Sign in to your workspace to continue.</p>
        </div>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <form method="post" action="/auth/session" className="stack">
          <input type="hidden" name="next" value={next} />
          <div className="field">
            <label className="field-label" htmlFor="username">Username</label>
            <input className="input" id="username" name="username" autoComplete="username" required autoFocus />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button type="submit" className="button button--lg button--block"><LogIn size={16} aria-hidden="true" /> Sign in</button>
        </form>
        <p className="field-hint">Don’t have a login? Ask the person who set up this workspace.</p>
      </div>
    </main>
  );
}

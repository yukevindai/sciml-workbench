import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, FlaskConical } from 'lucide-react';
import { safeNext } from '../lib/session';
import { PixelScene } from '../components/pixel-scene';
import { ThemeToggle } from '../components/theme-toggle';

export const metadata = { title: 'Sign in · SciML Workbench' };
const ERRORS: Record<string, string> = {
  invalid: 'That username or password is not right. Please try again.',
  setup: 'Sign-in is not set up on this server yet. Ask the person who runs this workspace to set a username and password.',
};

export default async function SignIn({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const next = safeNext(typeof query.next === 'string' ? query.next : undefined);
  const error = typeof query.error === 'string' ? ERRORS[query.error] : undefined;
  return <div className="auth-page">
    <a className="skip-link" href="#sign-in-form">Skip to sign in</a>
    <header className="auth-nav"><Link href="/" className="landing-brand" aria-label="SciML Workbench home"><span className="brand-mark" aria-hidden="true"><FlaskConical size={20} /></span>SciML Workbench</Link><div className="auth-nav-actions"><ThemeToggle /></div></header>
    <main className="auth-layout">
      <section className="auth-story" aria-label="Your research workspace" data-pixel-interactive><Image className="hero-art" src="/images/lab-orbitals.png" alt="" fill sizes="(max-width: 900px) 100vw, 55vw" priority /><PixelScene className="hero-pixels" variant="helix" /><div className="hero-scrim" aria-hidden="true" /><div><h2>Your personal<br />AI lab group</h2><p>Your agents, your workflows,<br />and a fresh perspective on your research.</p></div></section>
      <section className="auth-form-side">
        <div className="auth-card" id="sign-in-form" tabIndex={-1}>
          <Link href="/" className="auth-back"><ArrowLeft size={15} aria-hidden="true" />Back to home</Link>
          <div className="stack stack--tight"><h1>Welcome back.</h1><p className="auth-lede">Sign in to pick up where you left off.</p></div>
          {error && <p className="auth-error" id="sign-in-error" role="alert">{error}</p>}
          <form method="post" action="/auth/session" className="stack">
            <input type="hidden" name="next" value={next} />
            <div className="field"><label className="field-label" htmlFor="username">Username</label><input className="input" id="username" name="username" autoComplete="username" required aria-describedby={error ? 'sign-in-error' : undefined} aria-invalid={query.error === 'invalid' || undefined} /></div>
            <div className="field"><label className="field-label" htmlFor="password">Password</label><input className="input" id="password" name="password" type="password" autoComplete="current-password" required aria-describedby={error ? 'sign-in-error' : undefined} aria-invalid={query.error === 'invalid' || undefined} /></div>
            <button type="submit" className="button button--lg button--block">Sign in<ArrowRight size={16} aria-hidden="true" /></button>
          </form>
          <p className="field-hint"><Link href="/demo" className="text-link">Try the interactive demo without signing in</Link></p>
          <p className="field-hint">Don’t have a login? Ask the person who set up this workspace. <Link href="/docs/getting-started" className="text-link">Read the getting started guide</Link></p>
        </div>
      </section>
    </main>
  </div>;
}

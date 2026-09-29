import Link from 'next/link';
import { ArrowUpRight, FlaskConical } from 'lucide-react';
import { PublicNav } from './public-nav';
import { MotionToggle } from './motion-preferences';

export function PublicFooter() {
  return <footer className="landing-foot"><div><Link href="/" className="landing-brand"><FlaskConical size={20} aria-hidden="true" />SciML Workbench</Link><p>From evidence to understanding.</p><MotionToggle /></div><nav aria-label="Footer"><Link href="/docs">Docs</Link><Link href="/blog">Blog</Link><Link href="/changelog">Changelog</Link><Link href="/sign-in">Sign in</Link><a href="https://github.com/yukevindai/sciml-workbench">GitHub<ArrowUpRight size={13} aria-hidden="true" /></a></nav></footer>;
}
export function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="landing"><a className="skip-link" href="#public-main">Skip to main content</a><PublicNav /><main id="public-main" className="public-main" tabIndex={-1}>{children}</main><PublicFooter /></div>;
}

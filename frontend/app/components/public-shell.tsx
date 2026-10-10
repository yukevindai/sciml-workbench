import { BrandMark, BrandWordmark } from './brand';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { PublicNav } from './public-nav';

export function PublicFooter() {
  return <footer className="landing-foot"><div className="footer-main"><div><Link href="/" className="landing-brand"><BrandMark /><BrandWordmark /></Link><p>Your personal AI lab group.</p></div><nav aria-label="Footer"><Link href="/docs">Docs</Link><Link href="/blog">Blog</Link><Link href="/changelog">Changelog</Link><Link href="/sign-in">Sign in</Link><a href="https://github.com/yukevindai/colattice">GitHub<ArrowUpRight size={13} aria-hidden="true" /></a></nav></div><div className="footer-credit"><p>© {new Date().getFullYear()} Feidy AI. All rights reserved.</p><p>Built by Kevin.</p></div></footer>;
}
export function PublicShell({ children }: { children: React.ReactNode }) {
  return <div className="landing"><a className="skip-link" href="#public-main">Skip to main content</a><PublicNav /><main id="public-main" className="public-main" tabIndex={-1}>{children}</main><PublicFooter /></div>;
}

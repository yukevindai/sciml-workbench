'use client';

import { BrandMark, BrandWordmark } from './brand';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { ThemeToggle } from './theme-toggle';
import { AdminLogin } from './admin-login';

const links = [['Demo', '/demo'], ['Docs', '/docs'], ['Blog', '/blog'], ['Changelog', '/changelog']];
export function PublicNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [floating, setFloating] = useState(false);
  const sentinel = useRef<HTMLSpanElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const marker = sentinel.current;
    if (!marker) return;
    const observer = new IntersectionObserver(([entry]) => setFloating(!entry.isIntersecting));
    observer.observe(marker);
    return () => observer.disconnect();
  }, []);
  return <><span ref={sentinel} className="nav-scroll-marker" aria-hidden="true" /><div className="public-nav-wrap"><header className="landing-nav" data-floating={floating} onKeyDown={event => { if (event.key === 'Escape' && open) { setOpen(false); toggle.current?.focus(); } }}>
    <Link href="/" className="landing-brand" aria-label="Colattice home"><BrandMark /><BrandWordmark /></Link>
    <nav className="landing-links" aria-label="Main navigation">{links.map(([label, href]) => <Link key={href} href={href} aria-current={pathname.startsWith(href) ? 'page' : undefined}>{label}</Link>)}</nav>
    <div className="landing-actions"><ThemeToggle /><AdminLogin /><Link href="/ask" className="button nav-start">Get started <ArrowUpRight size={15} aria-hidden="true" /></Link><button ref={toggle} className="mobile-menu-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="mobile-public-nav" onClick={() => setOpen(!open)}>{open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}</button></div>
    {open && <nav id="mobile-public-nav" className="mobile-public-nav" aria-label="Mobile navigation">{links.map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={pathname.startsWith(href) ? 'page' : undefined}>{label}<ArrowUpRight size={15} aria-hidden="true" /></Link>)}<Link href="/sign-in" onClick={() => setOpen(false)}>Sign in<ArrowUpRight size={15} aria-hidden="true" /></Link></nav>}
  </header></div></>;
}

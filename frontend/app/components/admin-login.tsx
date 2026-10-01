'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { ShieldCheck, X } from 'lucide-react';

function SubmitLogin() {
  const { pending } = useFormStatus();
  return <button type="submit" className="button button--block" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>;
}

/** The same server-side operator session used by the full sign-in page. */
export function AdminLogin() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const username = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    username.current?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  function close() { setOpen(false); trigger.current?.focus(); }

  return <div className="admin-login" ref={container} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); close(); }
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} type="button" className="admin-login-trigger" aria-label="Admin login" aria-expanded={open} aria-controls="admin-login-panel" onClick={() => setOpen(!open)}><ShieldCheck size={16} aria-hidden="true" /><span>Admin</span></button>
    {open && <section id="admin-login-panel" className="admin-login-panel" aria-labelledby="admin-login-title">
      <div className="admin-login-heading"><h2 id="admin-login-title">Admin login</h2><button type="button" className="admin-login-close" aria-label="Close admin login" onClick={close}><X size={18} aria-hidden="true" /></button></div>
      <p className="field-hint">Sign in to manage your research workspace.</p>
      <form method="post" action="/auth/session" className="stack">
        <input type="hidden" name="next" value="/ask" />
        <div className="field"><label className="field-label" htmlFor="admin-username">Username</label><input ref={username} className="input" id="admin-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required /></div>
        <div className="field"><label className="field-label" htmlFor="admin-password">Password</label><input className="input" id="admin-password" name="password" type="password" autoComplete="current-password" required /></div>
        <SubmitLogin />
      </form>
    </section>}
  </div>;
}

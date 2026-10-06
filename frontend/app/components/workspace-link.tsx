'use client';

import Link from 'next/link';
import { createContext, useContext, useRef, type ComponentProps } from 'react';
import { isView } from '../lib/pipeline';

export const DemoContext = createContext(false);
export const useDemo = () => useContext(DemoContext);

/** Keep all research/result navigation in the demo, including open-in-new-tab. */
export default function WorkspaceLink(props: ComponentProps<typeof Link>) {
  const demo = useContext(DemoContext);
  const dialog=useRef<HTMLDialogElement>(null), trigger=useRef<HTMLButtonElement>(null);
  const href = props.href;
  const path = typeof href === 'string' ? href.split(/[?#]/)[0] : href.pathname ?? '';
  if (path.startsWith('/api/')) {
    // Real file downloads must remain native anchors, not Next route transitions.
    if(!demo)return <a href={typeof href==='string'?href:path} className={props.className} target={props.target} download={props.download}>{props.children}</a>;
    return <><button ref={trigger} type="button" className={props.className} onClick={() => dialog.current?.showModal()}>{props.children}</button><dialog ref={dialog} className="support-dialog" aria-label="Demo download" onCancel={()=>trigger.current?.focus()}><div className="support-body stack"><h2>Sample results, real interface.</h2><p>This demo shows a prewritten archive summary. It does not generate or verify a downloadable research archive. Sign in to export your own project, inputs and evidence.</p><div className="demo-actions"><Link href="/sign-in" className="button">Sign in</Link><button className="button button--secondary" onClick={()=>{dialog.current?.close();trigger.current?.focus();}}>Keep exploring</button></div></div></dialog></>;
  }
  const scoped = demo && isView(path.slice(1));
  return <Link {...props} href={scoped ? typeof href === 'string' ? `/demo${href}` : { ...href, pathname: `/demo${path}` } : href} prefetch={demo ? false : props.prefetch} />;
}

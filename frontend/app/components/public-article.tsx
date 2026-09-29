import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import { guides, sectionId, type GuideSection } from '../lib/public-content';

export function ArticleBody({ sections }: { sections: GuideSection[] }) {
  return <div className="article-body">{sections.map(section => <section key={section.title} id={sectionId(section.title)}><h2>{section.title}</h2>{section.paragraphs.map(p => <p key={p}>{p}</p>)}{section.steps && <ol>{section.steps.map(step => <li key={step}>{step}</li>)}</ol>}{section.note && <aside className="article-note">{section.note}</aside>}</section>)}</div>;
}
export function GuideSidebar({ slug }: { slug: string }) {
  return <aside className="guide-sidebar"><Link className="text-link" href="/docs"><ArrowLeft size={15} aria-hidden="true" />All documentation</Link><nav aria-label="Documentation guides">{guides.map((guide, i) => <Link key={guide.slug} href={`/docs/${guide.slug}`} aria-current={guide.slug === slug ? 'page' : undefined}><span>0{i + 1}</span>{guide.title}</Link>)}</nav></aside>;
}
export function ArticleContents({ sections }: { sections: GuideSection[] }) {
  return <nav className="article-contents" aria-label="On this page"><p className="section-eyebrow">On this page</p>{sections.map(s => <a key={s.title} href={`#${sectionId(s.title)}`}>{s.title}</a>)}</nav>;
}
export function ArticleNext({ href, label, external = false }: { href: string; label: string; external?: boolean }) {
  return external ? <a className="article-next" href={href}>{label}<ArrowUpRight size={18} aria-hidden="true" /></a> : <Link className="article-next" href={href}>{label}<ArrowRight size={18} aria-hidden="true" /></Link>;
}

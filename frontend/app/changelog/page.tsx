import { PublicShell } from '../components/public-shell';
import { PixelScene } from '../components/pixel-scene';
import { Reveal } from '../components/reveal';

export const metadata = { title: 'Changelog · SciML Workbench', description: 'Product improvements, development history, and release information for SciML Workbench.' };
const updates = [
  { id: 'next', version: 'Unreleased', date: null, title: 'A workspace with more life.', groups: [
    { label: 'New', items: ['Dedicated Docs with six practical guides, a Blog, and this Changelog.', 'Original animated pixel scenes throughout the landing page, feature sections, and blog.', 'A persistent motion preference, alongside system reduced-motion support.'] },
    { label: 'Improved', items: ['The hero fills the first viewport, with the next section below the fold.', 'Responsive public navigation, scroll reveals, and a shared visual language from the landing page to sign-in.'] },
  ], commit: null },
  { id: '2026-09-29', version: 'Development update', date: '2026-09-29', title: 'Your personal AI lab group.', groups: [
    { label: 'Improved', items: ['A monochrome landing page, real workspace previews, and refreshed sign-in and workspace styling.', 'Shared light and dark themes across the public site and private workspace.'] },
    { label: 'Fixed', items: ['Browser test discovery no longer imports separate Node test suites.', 'Queue and autonomy test fixtures match the configured provider and response schema.'] },
  ], commit: '8732aad0f829965d4cd947b9cc18eca092ff39ef' },
  { id: '2026-09-28', version: 'Development update', date: '2026-09-28', title: 'Start with a question.', groups: [
    { label: 'New', items: ['A prompt-first Ask home and a form-based sign-in flow.', 'Budget-driven specialist delegation in checkpointed waves.'] },
    { label: 'Improved', items: ['Faster handling of simple answers and clearer research team activity.'] },
  ], commit: '9be9fe39892e9192c70f68aebe1a710003c99062' },
];
export default function Changelog() {
  return <PublicShell><div className="public-container"><header className="public-heading public-heading--art" data-pixel-interactive><div><p className="section-eyebrow">Changelog</p><h1>A better lab,<br /><span>one update at a time.</span></h1><p>What’s new, what’s improved, and what’s fixed.</p><p className="release-note">Current package version: <strong>0.1.0</strong>. Development updates below are source changes, not new numbered releases. <a href="https://github.com/yukevindai/sciml-workbench/releases">View GitHub releases</a>.</p></div><div className="heading-art"><PixelScene variant="network" /></div></header>
    <div className="release-list">{updates.map(update => <Reveal key={update.id}><article className="release-entry" id={update.id}><div className="release-meta"><span className="release-dot" aria-hidden="true" /><p>{update.version}</p>{update.date ? <time dateTime={update.date}>{new Date(update.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</time> : <span>In development</span>}</div><div className="release-body"><h2>{update.title}</h2>{update.groups.map(group => <section key={group.label}><h3>{group.label}</h3><ul>{group.items.map(item => <li key={item}>{item}</li>)}</ul></section>)}{update.commit && <a className="text-link" href={`https://github.com/yukevindai/sciml-workbench/commit/${update.commit}`}>View source update →</a>}</div></article></Reveal>)}</div>
  </div></PublicShell>;
}

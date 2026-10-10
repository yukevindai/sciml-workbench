import { PublicShell } from '../components/public-shell';
import { PixelScene } from '../components/pixel-scene';
import { Reveal } from '../components/reveal';

export const metadata = { title: 'Changelog · Colattice', description: 'Product improvements, development history, and release information for Colattice.' };
const updates = [
  { id: '0.2.2', version: '0.2.2', date: '2026-10-10', title: 'Meet Colattice.', groups: [
    { label: 'Improved', items: ['SciML Workbench is now Colattice, your personal AI lab group by Feidy AI.', 'A modular C logo, matching browser and home-screen icons, and a forest-green, lime and ivory palette across the landing page, sign-in, demo and workspace.', 'Coordinated buttons, selected states, focus indicators and pixel artwork in light and dark themes.'] },
  ], commit: null },
  { id: '0.2.1', version: '0.2.1', date: '2026-10-05', title: 'Try your lab before signing in.', groups: [
    { label: 'New', items: ['A public interactive demo using the real workspace screens, synthetic data and scripted responses. No account or model API calls required.', 'Explore sample results, edit agents and tools, design workflows and run a simulated scientific council. Reset the demo at any time.'] },
    { label: 'Improved', items: ['Visible elapsed time and recorded activity for research, support, workflows and stress tests.', 'Faster feature loading, a smaller support request path, and public previews captured from the real product.'] },
  ], commit: null },
  { id: '0.2.0', version: '0.2.0', date: '2026-10-04', title: 'Build your lab. Challenge your research.', groups: [
    { label: 'New', items: ['Custom agents, teams, and reusable research tools, with built-in originals preserved when customized.', 'A visual workflow designer with templates, agent assignments, parallel paths, and recurring research.', 'Curated specialist and independent council stress tests for ideas, papers, and scientific results.', 'Product Support inside the signed-in workspace, with AI answers and searchable guidance.'] },
    { label: 'Improved', items: ['Cancel a new workflow and drag empty canvas space to pan.', 'Consistent compact selectors and an agent-led workspace navigation.', 'Updated public product previews and guides. Motion follows your system preference automatically.'] },
  ], commit: null },
  { id: '0.1.3', version: '0.1.3', date: '2026-09-29', title: 'A clearer view of your lab.', groups: [
    { label: 'Improved', items: ['An open header at the top of the page that becomes a floating navigation bar as you scroll.', 'A quieter hero and footer, with Feidy AI attribution and a consistent product tagline.', 'Distinct pixel studies for data quality, model evaluation, evidence, experiment history, and every article.'] },
    { label: 'Fixed', items: ['Motion preference checks wait for navigation before testing reload persistence.'] },
  ], commit: null },
  { id: '0.1.2', version: '0.1.2', date: '2026-09-29', title: 'A workspace with more life.', groups: [
    { label: 'New', items: ['Dedicated Docs with six practical guides, a Blog, and this Changelog.', 'Original animated pixel scenes throughout the landing page, feature sections, and blog.', 'A persistent motion preference, alongside system reduced-motion support.'] },
    { label: 'Improved', items: ['The hero fills the first viewport, with the next section below the fold.', 'Responsive public navigation, scroll reveals, and a shared visual language from the landing page to sign-in.'] },
  ], commit: '184d0ef7642fd9687f0d5f78a3b943d4987afd06' },
  { id: '0.1.1', version: '0.1.1', date: '2026-09-29', title: 'Your personal AI lab group.', groups: [
    { label: 'Improved', items: ['A monochrome landing page, real workspace previews, and refreshed sign-in and workspace styling.', 'Shared light and dark themes across the public site and private workspace.'] },
    { label: 'Fixed', items: ['Browser test discovery no longer imports separate Node test suites.', 'Queue and autonomy test fixtures match the configured provider and response schema.'] },
  ], commit: '8732aad0f829965d4cd947b9cc18eca092ff39ef' },
  { id: '0.1.0', version: '0.1.0', date: '2026-09-28', title: 'Start with a question.', groups: [
    { label: 'New', items: ['A prompt-first Ask home and a form-based sign-in flow.', 'Budget-driven specialist delegation in checkpointed waves.'] },
    { label: 'Improved', items: ['Faster handling of simple answers and clearer research team activity.'] },
  ], commit: '9be9fe39892e9192c70f68aebe1a710003c99062' },
];
export default function Changelog() {
  return <PublicShell><div className="public-container"><header className="public-heading public-heading--art" data-pixel-interactive><div><p className="section-eyebrow">Changelog</p><h1>A better lab,<br /><span>one update at a time.</span></h1><p>What’s new, what’s improved, and what’s fixed.</p></div><div className="heading-art"><PixelScene variant="timeline" /></div></header>
    <div className="release-list">{updates.map(update => <Reveal key={update.id}><article className="release-entry" id={update.id}><div className="release-meta"><span className="release-dot" aria-hidden="true" /><p><a href={`#${update.id}`}>{update.version}</a>{update === updates[0] && <span className="release-latest">Latest</span>}</p><time dateTime={update.date}>{new Date(update.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</time></div><div className="release-body"><h2>{update.title}</h2>{update.groups.map(group => <section key={group.label}><h3>{group.label}</h3><ul>{group.items.map(item => <li key={item}>{item}</li>)}</ul></section>)}{update.commit && <a className="text-link" href={`https://github.com/yukevindai/colattice/commit/${update.commit}`}>View source update →</a>}</div></article></Reveal>)}</div>
  </div></PublicShell>;
}

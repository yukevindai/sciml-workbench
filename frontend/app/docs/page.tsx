import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { PublicShell } from '../components/public-shell';
import { PixelScene } from '../components/pixel-scene';
import { Reveal } from '../components/reveal';
import { guides } from '../lib/public-content';

export const metadata = { title: 'Docs · Colattice', description: 'Learn how to ask questions, manage research materials, review agents, evaluate models, and export evidence.' };
export default function Docs() {
  return <PublicShell><div className="public-container"><header className="public-heading public-heading--art" data-pixel-interactive><div><p className="section-eyebrow">Documentation</p><h1>From your first question<br /><span>to a result you understand.</span></h1><p>Learn the workspace, guide your AI lab group, and follow the evidence. Start here, then go deeper.</p><Link href="/docs/getting-started" className="text-link">Start your first investigation<ArrowRight size={17} aria-hidden="true" /></Link></div><div className="heading-art"><PixelScene variant="document" /></div></header>
    <Reveal><div className="guide-grid">{guides.map((guide, i) => <Link className="guide-card" key={guide.slug} href={`/docs/${guide.slug}`}><span className="guide-number">0{i + 1}</span><h2>{guide.title}</h2><p>{guide.description}</p><span className="text-link">Read guide<ArrowUpRight size={16} aria-hidden="true" /></span></Link>)}</div></Reveal>
    <section className="docs-quickstart"><div><p className="section-eyebrow">The short version</p><h2>A question. A file.<br />A place to begin.</h2><Link href="/ask" className="button">Open your workspace<ArrowRight size={16} aria-hidden="true" /></Link></div><ol><li>Sign in to your private workspace.</li><li>Attach a CSV dataset or PDF paper in Ask.</li><li>Describe one clear objective and choose whether to review the plan.</li><li>Follow the activity, inspect the result, and open its sources.</li><li>Continue the investigation in the same project.</li></ol></section>
  </div></PublicShell>;
}

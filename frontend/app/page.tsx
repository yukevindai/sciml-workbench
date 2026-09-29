import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ArrowUpRight, BookOpen, FileCheck2, FlaskConical, History, Layers3, ShieldCheck, SplitSquareHorizontal } from 'lucide-react';
import { PublicNav } from './components/public-nav';
import { PublicFooter } from './components/public-shell';
import { PixelScene, type PixelVariant } from './components/pixel-scene';
import { Reveal } from './components/reveal';
import { BlogCard } from './components/blog-card';
import { posts } from './lib/public-content';
import { ProductPreview } from './components/product-preview';

export const metadata = {
  title: 'SciML Workbench · Your personal AI lab group',
  description: 'Your personal AI lab group. Explore your data, evaluate models, and trace every result back to its evidence.',
};

const CAPABILITIES = [
  { icon: FileCheck2, title: 'Know your data before you trust it.', body: 'Find missing values, duplicates, and suspicious numbers before they shape your conclusions.', link: '/dataset-audit', label: 'Check data' },
  { icon: SplitSquareHorizontal, title: 'Give your models a fair test.', body: 'Design meaningful holdouts and compare simple baselines before chasing a better score.', link: '/split-designer', label: 'Explore evaluation' },
  { icon: BookOpen, title: 'Keep the evidence close.', body: 'Connect claims to passages in your papers. Follow each result back to the files and steps behind it.', link: '/evidence', label: 'Papers & sources' },
  { icon: History, title: 'Make every attempt count.', body: 'Record what didn’t work, preserve the context, and export a record your next experiment can build on.', link: '/failure-memory', label: 'Lessons learned' },
];

const FAQ = [
  { q: 'Do I need to know how to code?', a: 'No. Describe what you want in plain language. You can also open the advanced tools whenever you want to control individual steps.' },
  { q: 'Which files can I work with?', a: 'Add CSV datasets and PDF research papers. Your original files are preserved, and derived results remain connected to their sources.' },
  { q: 'Which AI does it use?', a: 'DeepSeek and Anthropic adapters are supported. Your workspace owner configures the provider, models, and agent availability.' },
  { q: 'Is my raw data sent to the AI?', a: 'By default, the assistant sees column names and summary statistics while analysis runs on the workspace server. Access to materials is governed by your workspace’s execution policy.' },
  { q: 'Can I review or stop the work?', a: 'Yes. Ask to review the plan first, inspect the results, and use the available pause or cancel controls as the work progresses.' },
];

export default function Landing() {
  return <div className="landing">
    <a className="skip-link" href="#landing-main">Skip to main content</a>
    <PublicNav />

    <main id="landing-main" tabIndex={-1}>
      <section className="hero" aria-labelledby="hero-title" data-pixel-interactive>
        <Image className="hero-art" src="/images/lab-orbitals.png" alt="" fill priority sizes="100vw" />
        <PixelScene className="hero-pixels" variant="orbit" /><div className="hero-scrim" aria-hidden="true" />
        <div className="hero-content">
          <h1 id="hero-title" className="hero-title">Your personal <br />AI lab group</h1>
          <p className="hero-lede">Explore your data. Follow the evidence. Move your research forward.</p>
          <div className="hero-cta"><Link href="/ask" className="button button--lg">Get started <ArrowRight size={17} aria-hidden="true" /></Link><a href="#how" className="button button--lg button--secondary">Explore the workspace</a></div>
        </div>
      </section>

      <div className="research-strip" aria-label="Research capabilities"><span>One workspace for the whole investigation</span><div><span>Data</span><span>Experiments</span><span>Evidence</span><span>Review</span></div></div>

      <section className="landing-section" id="how" aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">Good research takes a team.<br /><span>Meet yours.</span></h2>
        <p className="section-lede">From the first question to the final result, keep your files, analysis, and decisions in one place.</p>
        <Reveal className="preview-reveal"><ProductPreview /></Reveal>
      </section>

      <section className="landing-section capabilities-section" id="features" aria-labelledby="features-title">
        <h2 id="features-title" className="section-title">The careful parts of research.<br /><span>Connected.</span></h2>
        <Reveal><div className="capabilities">
          {CAPABILITIES.map(({ title, body, link, label }, index) => <article className="capability" key={title}>
            <div className="capability-art" data-pixel-interactive><PixelScene variant={(['audit', 'split', 'evidence', 'memory'] as PixelVariant[])[index]} /></div>
            <h3>{title}</h3><p>{body}</p><Link href={link} className="text-link">{label}<ArrowUpRight size={15} aria-hidden="true" /></Link>
          </article>)}
        </div></Reveal>
      </section>

      <section className="landing-section workflow-section" aria-labelledby="workflow-title">
        <div><p className="section-eyebrow">A more natural workflow</p><h2 id="workflow-title" className="section-title">Start with a question.<br /><span>Stay in control.</span></h2><p className="section-lede">Ask in plain language, or get hands-on with the detailed tools. Your work stays connected either way.</p><Link href="/ask" className="button button--lg">Get started<ArrowRight size={16} aria-hidden="true" /></Link></div>
        <Reveal><div className="workflow-art" data-pixel-interactive><PixelScene variant="network" /></div><ol className="workflow-list">
          <li><span className="workflow-number">01</span><div><h3>Bring your materials</h3><p>Add your datasets and papers. Keep the original files intact.</p></div></li>
          <li><span className="workflow-number">02</span><div><h3>Set the direction</h3><p>Describe your objective. Review the plan before it runs if you want.</p></div></li>
          <li><span className="workflow-number">03</span><div><h3>Inspect what comes back</h3><p>Review findings, follow their sources, and choose your next step.</p></div></li>
        </ol></Reveal>
      </section>

      <section className="landing-section principles" aria-label="Research principles">
        <div><ShieldCheck size={21} aria-hidden="true" /><h3>Your judgment comes first.</h3><p>Review the plan and guide the work. The assistant supports your decisions.</p></div>
        <div><Layers3 size={21} aria-hidden="true" /><h3>The context stays together.</h3><p>Files, results, and earlier attempts stay connected to the same project.</p></div>
      </section>

      <section className="landing-section notebook-section" aria-labelledby="notebook-title"><div className="section-heading-row"><h2 className="section-title" id="notebook-title">Notes from the lab.</h2><Link href="/blog" className="text-link">All posts<ArrowUpRight size={15} aria-hidden="true" /></Link></div><Reveal><div className="blog-grid">{posts.map(post => <BlogCard key={post.slug} post={post} />)}</div></Reveal></section>

      <section className="landing-section faq-section" id="faq" aria-labelledby="faq-title">
        <h2 id="faq-title" className="section-title">A few things<br /><span>worth knowing.</span></h2>
        <div className="faq">{FAQ.map(({ q, a }) => <details key={q} className="faq-item"><summary>{q}<span className="faq-plus" aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div>
      </section>

      <section className="landing-cta" aria-labelledby="cta-title" data-pixel-interactive><PixelScene className="cta-pixels" variant="ripple" /><FlaskConical size={32} strokeWidth={1.3} aria-hidden="true" /><h2 id="cta-title">Your next question<br />starts here.</h2><p>Your data. Your direction. Your personal AI lab group.</p><Link href="/ask" className="button button--lg">Get started<ArrowRight size={17} aria-hidden="true" /></Link></section>
    </main>
    <PublicFooter />
  </div>;
}

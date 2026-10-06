import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ArrowUpRight, FlaskConical, Layers3, Play, ShieldCheck } from 'lucide-react';
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
  { title: 'Build the lab group you need.', body: 'Start with integrated agents, customize a copy, or create your own specialists. Give small teams a shared task and a lead.', link: '/demo/agent-market', label: 'Meet your agents' },
  { title: 'Connect a research process.', body: 'Turn a good investigation into a repeatable workflow. Connect agents, reusable tools, review steps and decisions on a visual canvas.', link: '/demo/workflows', label: 'Design a workflow' },
  { title: 'Challenge what you believe.', body: 'Stress-test an idea, paper or result with a curated specialist or council. Inspect the evidence, uncertainty and suggested tests.', link: '/demo/stress-test', label: 'Explore stress testing' },
  { title: 'Make your methods reusable.', body: 'Create named research tools with clear instructions and permitted capabilities. Give them to your agents or use them in a workflow.', link: '/demo/tools', label: 'Explore research tools' },
];

const FAQ = [
  { q: 'Can I try it without signing in?', a: 'Yes. The interactive demo uses the real workspace screens with synthetic sample data and scripted responses. Explore agents, workflows, stress tests and results without an account or any AI API calls. Demo edits reset when you refresh; uploads and live research require sign-in.' },
  { q: 'Do I need to know how to code?', a: 'No. Describe what you want in plain language. Customize your agents and connect research steps in a visual workflow when you want a repeatable process.' },
  { q: 'Which files can I work with?', a: 'Add CSV datasets and PDF research papers. Your original files are preserved, and derived results remain connected to their sources.' },
  { q: 'What if I need help with a control?', a: 'Product Support is always available inside the signed-in workspace. Ask how a button works, explore the workflow guides, or get help choosing your next step.' },
  { q: 'Does a council guarantee a sound result?', a: 'No. Curated reviewers apply distinct methods, statistics and evidence lenses. They use the configured provider and can share blind spots. Their critiques support scientific judgment and do not replace independent validation or peer review.' },
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
          <p className="hero-lede">Build your team. Follow the evidence. Put your ideas to the test.</p>
          <div className="hero-cta"><Link href="/demo" className="button button--lg"><Play size={16} fill="currentColor" aria-hidden="true" />Try the demo</Link><Link href="/ask" className="button button--lg button--secondary">Get started <ArrowRight size={17} aria-hidden="true" /></Link></div>
        </div>
      </section>

      <div className="research-strip" aria-label="Research capabilities"><span>One workspace for the whole investigation</span><div><span>Data</span><span>Experiments</span><span>Evidence</span><span>Review</span></div></div>

      <section className="landing-section" id="how" aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">Good research takes a team.<br /><span>Meet yours.</span></h2>
        <p className="section-lede">Explore agents, workflows, and scientific reviews in a ready-to-use demo. No account needed.</p>
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
        <div><p className="section-eyebrow">A more natural workflow</p><h2 id="workflow-title" className="section-title">Start with a question.<br /><span>Stay in control.</span></h2><p className="section-lede">Describe the goal and choose your agents. Build a workflow when the process is worth repeating, then challenge the result before moving forward.</p><Link href="/ask" className="button button--lg">Get started<ArrowRight size={16} aria-hidden="true" /></Link></div>
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

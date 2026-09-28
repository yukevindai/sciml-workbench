import Link from 'next/link';
import {
  ArrowRight, ArrowUp, BookOpen, CheckCircle2, FileSpreadsheet, FlaskConical, History, Lightbulb,
  MessageSquareText, Paperclip, PauseCircle, ShieldCheck, Sparkles, SplitSquareHorizontal, Upload,
} from 'lucide-react';
import { ThemeToggle } from './components/theme-toggle';

export const metadata = {
  title: 'SciML Workbench · Ask your data questions in plain words',
  description: 'Upload a spreadsheet or a paper, ask a question in everyday language, and an AI assistant does the checking, testing and write-up for you, keeping a record of every step.',
};

const STEPS = [
  { icon: Upload, title: 'Add your files', body: 'Drop in a spreadsheet (CSV) or a research paper (PDF). Your original files are kept exactly as they are.' },
  { icon: MessageSquareText, title: 'Ask in plain words', body: '“Check this data for mistakes” or “Which columns predict yield?” No code, no settings to learn.' },
  { icon: CheckCircle2, title: 'Get clear results', body: 'The assistant plans the work, runs each step and shows you what it found, with links to every result.' },
];

const FEATURES = [
  { icon: ShieldCheck, title: 'Finds problems in your data', body: 'Spots missing values, duplicate rows and odd numbers before they mislead you.', wide: true },
  { icon: SplitSquareHorizontal, title: 'Tests fairly', body: 'Keeps some data aside so results reflect new cases, not memorised ones.' },
  { icon: FlaskConical, title: 'Tries simple models', body: 'Builds and compares basic prediction models so you have a baseline to beat.' },
  { icon: BookOpen, title: 'Reads your papers', body: 'Pulls out the passages that matter and links each claim to its exact page.', wide: true },
  { icon: Lightbulb, title: 'Remembers what didn’t work', body: 'Notes failed attempts and why, so nobody repeats the same mistake.' },
  { icon: History, title: 'Keeps a full record', body: 'Every step is saved. Export one file that lets anyone check or repeat your work.', wide: true },
];

const FAQ = [
  { q: 'Do I need to know how to code?', a: 'No. You type what you want in normal sentences. People who prefer to work by hand can still open the advanced tools at any time.' },
  { q: 'Which AI does it use?', a: 'The assistant runs on DeepSeek. Your workspace owner sets it up once; you never need an API key yourself.' },
  { q: 'Is my raw data sent to the AI?', a: 'By default, no. The assistant sees column names and summary numbers, while the actual analysis runs on the workspace server.' },
  { q: 'Can I stop it?', a: 'Yes. You can pause, stop or change your request at any time, and it asks you when it needs information only you know.' },
  { q: 'How do I know the results are right?', a: 'Every result links back to the exact files and steps that produced it, and a full record can be exported and re-checked.' },
];

export default function Landing() {
  return (
    <div className="landing">
      <a className="skip-link" href="#landing-main">Skip to main content</a>
      <header className="landing-nav">
        <Link href="/" className="landing-brand" aria-label="SciML Workbench home">
          <span className="brand-mark" aria-hidden="true"><FlaskConical size={18} /></span>
          <span>SciML Workbench</span>
        </Link>
        <nav className="landing-links" aria-label="Page sections">
          <a href="#how">How it works</a>
          <a href="#features">What it does</a>
          <a href="#faq">Questions</a>
        </nav>
        <div className="landing-actions">
          <ThemeToggle />
          <Link href="/sign-in" className="button button--ghost">Sign in</Link>
          <Link href="/ask" className="button">Get started</Link>
        </div>
      </header>

      <main id="landing-main">
        <section className="hero">
          <div className="hero-glow" aria-hidden="true" />
          <div className="hero-grid" aria-hidden="true" />
          <p className="hero-pill"><Sparkles size={14} aria-hidden="true" /> New: an AI research assistant that does the busywork</p>
          <h1 className="hero-title">Ask questions about your data.<br /><span className="hero-accent">Get answers you can check.</span></h1>
          <p className="hero-lede">
            Upload a spreadsheet or a paper and say what you want to know in everyday words.
            The assistant checks your data, tests simple models and explains what it found, saving every step along the way.
          </p>
          <div className="hero-cta">
            <Link href="/ask" className="button button--lg">Start asking <ArrowRight size={16} aria-hidden="true" /></Link>
            <a href="#how" className="button button--lg button--secondary">See how it works</a>
          </div>

          <div className="hero-demo" aria-label="Example of asking a question">
            <div className="demo-prompt">
              <p className="demo-text">Check my data for mistakes, then tell me which columns best predict yield.</p>
              <div className="demo-bar">
                <span className="chip"><Paperclip size={13} aria-hidden="true" /> reactions.csv</span>
                <span className="demo-send" aria-hidden="true"><ArrowUp size={16} /></span>
              </div>
            </div>
            <ol className="demo-steps">
              <li><CheckCircle2 size={15} aria-hidden="true" /> Checked 1,240 rows and found 3 duplicates</li>
              <li><CheckCircle2 size={15} aria-hidden="true" /> Set aside 20% of the data for a fair test</li>
              <li><CheckCircle2 size={15} aria-hidden="true" /> Compared two simple models and wrote a summary</li>
            </ol>
          </div>
        </section>

        <section className="landing-section" id="how" aria-labelledby="how-title">
          <p className="section-eyebrow">How it works</p>
          <h2 id="how-title" className="section-title">Three steps. No setup.</h2>
          <ol className="steps">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li key={title} className="step-card">
                <span className="step-number" aria-hidden="true">{index + 1}</span>
                <Icon size={22} className="step-icon" aria-hidden="true" />
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" id="features" aria-labelledby="features-title">
          <p className="section-eyebrow">What it does</p>
          <h2 id="features-title" className="section-title">The careful parts of research, handled for you</h2>
          <ul className="bento">
            {FEATURES.map(({ icon: Icon, title, body, wide }) => (
              <li key={title} className={`bento-card${wide ? ' bento-card--wide' : ''}`}>
                <span className="bento-icon" aria-hidden="true"><Icon size={20} /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-section" aria-labelledby="audience-title">
          <p className="section-eyebrow">Made for everyone</p>
          <h2 id="audience-title" className="section-title">Simple when you want it. Detailed when you need it.</h2>
          <div className="audience">
            <div className="audience-card">
              <FileSpreadsheet size={22} aria-hidden="true" />
              <h3>New to data analysis?</h3>
              <p>Just ask. The assistant picks sensible steps, explains results in plain language and asks before guessing anything important.</p>
            </div>
            <div className="audience-card">
              <PauseCircle size={22} aria-hidden="true" />
              <h3>Experienced researcher?</h3>
              <p>Review the plan before it runs, inspect every table and split, or switch to the manual tools. Nothing is hidden.</p>
            </div>
          </div>
        </section>

        <section className="landing-section" id="faq" aria-labelledby="faq-title">
          <p className="section-eyebrow">Questions</p>
          <h2 id="faq-title" className="section-title">Good to know</h2>
          <div className="faq">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="faq-item">
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="landing-cta" aria-labelledby="cta-title">
          <h2 id="cta-title">Ready to ask your first question?</h2>
          <p>Sign in, add a file and type what you want to know.</p>
          <Link href="/ask" className="button button--lg">Open the workspace <ArrowRight size={16} aria-hidden="true" /></Link>
        </section>
      </main>

      <footer className="landing-foot">
        <span>SciML Workbench</span>
        <span>Your files stay yours. Every result can be traced and repeated.</span>
      </footer>
    </div>
  );
}

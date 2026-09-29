import { PublicShell } from '../components/public-shell';
import { BlogCard } from '../components/blog-card';
import { Reveal } from '../components/reveal';
import { posts } from '../lib/public-content';

export const metadata = { title: 'Blog · SciML Workbench', description: 'Practical notes on AI-assisted research, honest evaluation, and keeping evidence close to the answer.' };
export default function Blog() {
  return <PublicShell><div className="public-container"><header className="public-heading"><p className="section-eyebrow">The lab notebook</p><h1>Better questions.<br /><span>More useful answers.</span></h1><p>Guides and notes on doing careful research with your personal AI lab group.</p></header><Reveal><div className="blog-grid">{posts.map(post => <BlogCard key={post.slug} post={post} />)}</div></Reveal></div></PublicShell>;
}

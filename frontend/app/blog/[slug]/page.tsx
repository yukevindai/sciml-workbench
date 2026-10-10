import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PublicShell } from '../../components/public-shell';
import { ArticleBody, ArticleNext } from '../../components/public-article';
import { PixelScene } from '../../components/pixel-scene';
import { posts, readingMinutes } from '../../lib/public-content';

export function generateStaticParams() { return posts.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = posts.find(p => p.slug === slug);
  return { title: `${post?.title ?? 'Post not found'} · Colattice Blog`, description: post?.description };
}
export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = posts.find(p => p.slug === slug);
  if (!post) notFound();
  return <PublicShell><article className="post-article"><Link className="text-link" href="/blog"><ArrowLeft size={15} aria-hidden="true" />All posts</Link><header className="article-heading"><p className="section-eyebrow">{post.category} · {readingMinutes(post.sections)} min read</p><h1>{post.title}</h1><p>{post.description}</p><div className="post-byline"><span>Colattice</span><time dateTime="2026-09-29">September 29, 2026</time></div></header><div className="post-cover" data-pixel-interactive><PixelScene variant={post.cover} /></div><ArticleBody sections={post.sections} /><ArticleNext href={`/docs/${post.guide}`} label="Continue with the step-by-step guide" /><ArticleNext href="/blog" label="More from the lab notebook" /></article></PublicShell>;
}

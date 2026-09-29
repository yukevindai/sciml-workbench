import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { type Post, readingMinutes } from '../lib/public-content';
import { PixelScene } from './pixel-scene';

export function BlogCard({ post }: { post: Post }) {
  return <Link className="blog-card" href={`/blog/${post.slug}`} data-pixel-interactive>
    <div className="blog-art"><PixelScene variant={post.art} /><ArrowUpRight className="blog-card-arrow" size={20} aria-hidden="true" /></div>
    <div className="blog-card-body"><p className="post-meta"><span>{post.category}</span><span>{readingMinutes(post.sections)} min read</span></p><h2>{post.title}</h2><p className="blog-excerpt">{post.description}</p><p className="post-byline"><span>SciML Workbench</span><time dateTime="2026-09-29">Sep 29, 2026</time></p></div>
  </Link>;
}

import { notFound } from 'next/navigation';
import { PublicShell } from '../../components/public-shell';
import { ArticleBody, ArticleContents, ArticleNext, GuideSidebar } from '../../components/public-article';
import { guides, readingMinutes } from '../../lib/public-content';

export function generateStaticParams() { return guides.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = guides.find(g => g.slug === slug);
  return { title: `${item?.title ?? 'Guide not found'} · Colattice Docs`, description: item?.description };
}
export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const index = guides.findIndex(g => g.slug === slug);
  if (index < 0) notFound();
  const guide = guides[index];
  const next = guides[index + 1];
  return <PublicShell><div className="guide-layout public-container"><GuideSidebar slug={slug} /><article className="guide-article"><header className="article-heading"><p className="section-eyebrow">Guide 0{index + 1} · {readingMinutes(guide.sections)} min read</p><h1>{guide.title}</h1><p>{guide.description}</p></header><ArticleContents sections={guide.sections} /><ArticleBody sections={guide.sections} /><div className="article-links"><ArticleNext href={guide.tool[1]} label={guide.tool[0]} /><ArticleNext external href={`https://github.com/yukevindai/sciml-workbench/blob/main/${guide.source}`} label="Technical reference on GitHub" />{next && <ArticleNext href={`/docs/${next.slug}`} label={`Next: ${next.title}`} />}</div></article></div></PublicShell>;
}

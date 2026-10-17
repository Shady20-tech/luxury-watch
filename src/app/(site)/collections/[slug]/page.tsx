import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PlannedPage } from '@/components/chrome/planned-page';
import { buildMetadata } from '@/lib/seo/metadata';
import { fetchActiveCollectionSummary } from '@/server/repositories/catalogue-repository';

/**
 * Collection route placeholder.
 *
 * The homepage's "view all" links point at `/collections/featured` and
 * `/collections/new-arrivals`. An unknown collection slug is a `404`; a real one
 * gets a page that names it and says the listing is built in the catalogue
 * phase. `noindex` in both cases.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const collection = await fetchActiveCollectionSummary(slug).catch(() => null);

  return buildMetadata({
    title: collection ? collection.title : 'Collection not found',
    path: `/collections/${slug}`,
    robots: { index: false, follow: true },
  });
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const collection = await fetchActiveCollectionSummary(slug).catch(() => null);

  if (!collection) notFound();

  return (
    <PlannedPage
      eyebrow="Shop"
      title={collection.title}
      intro="The full collection listing, with filtering, sorting and pagination, is built in the catalogue phase."
      phase="the catalogue and discovery phase (Phase 5)"
    />
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PlannedPage } from '@/components/chrome/planned-page';
import { buildMetadata } from '@/lib/seo/metadata';
import { fetchActiveBrandSummary } from '@/server/repositories/catalogue-repository';

/**
 * Brand route placeholder.
 *
 * Same two honest states as the product route: an unknown or inactive brand
 * slug is a `404`, and a real one gets a page that names it and says the brand
 * index is built in the catalogue phase. `noindex` in both cases.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const brand = await fetchActiveBrandSummary(slug).catch(() => null);

  return buildMetadata({
    title: brand ? brand.name : 'Brand not found',
    description: brand
      ? `Watches by ${brand.name}. Browse the pieces we currently hold.`
      : undefined,
    path: `/brands/${slug}`,
    robots: { index: false, follow: true },
  });
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const brand = await fetchActiveBrandSummary(slug).catch(() => null);

  if (!brand) notFound();

  return (
    <PlannedPage
      eyebrow="Shop"
      title={brand.name}
      intro={`The ${brand.name} index, with its model families and the pieces we hold, is built in the catalogue phase.`}
      phase="the catalogue and discovery phase (Phase 5)"
    />
  );
}

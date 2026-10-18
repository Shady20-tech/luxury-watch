import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PlannedPage } from '@/components/chrome/planned-page';
import { buildMetadata } from '@/lib/seo/metadata';
import { fetchPublishedProductIdentity } from '@/server/repositories/catalogue-repository';

/**
 * Product route placeholder.
 *
 * The homepage links every card to its product page, and that page is built in
 * the catalogue phase. Two honest states are possible here:
 *
 *  - The slug does not correspond to a published product → `notFound()`. A
 *    storefront must not answer 200 for a watch that does not exist, and an
 *    unknown slug must not be indexable.
 *  - The slug is a real published product → a page that says the full product
 *    template is coming, and names the watch so the visitor knows the link was
 *    not broken.
 *
 * The metadata is `noindex` in both cases: neither state has content worth
 * indexing, and letting a thin placeholder into the index would compete with
 * the real template later.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await fetchPublishedProductIdentity(slug).catch(() => null);

  if (!product) {
    return buildMetadata({
      title: 'Watch not found',
      path: `/products/${slug}`,
      robots: { index: false, follow: true },
    });
  }

  return buildMetadata({
    title: product.title,
    description: `${product.title}${product.brandName ? ` by ${product.brandName}` : ''}. Full details, condition report and pricing on request.`,
    path: `/products/${slug}`,
    robots: { index: false, follow: true },
  });
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await fetchPublishedProductIdentity(slug).catch(() => null);

  if (!product) notFound();

  return (
    <PlannedPage
      eyebrow={product.brandName ?? 'Catalogue'}
      title={product.title}
      intro="The full product page — photography, condition report, specification and the enquiry flow — is built in the catalogue phase."
      phase="the catalogue and discovery phase (Phase 5)"
    />
  );
}

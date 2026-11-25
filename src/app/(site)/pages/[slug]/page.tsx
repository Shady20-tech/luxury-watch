import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageBlocks } from '@/components/content/page-blocks';
import { PageHero } from '@/components/layout/page-hero';
import { SITE_PHOTOGRAPHY } from '@/lib/images/site-photography';
import { ErrorState } from '@/components/ui/states';
import { buildMetadata, noIndexMetadata } from '@/lib/seo/metadata';
import { fetchPublishedPageSlugs } from '@/server/repositories/content-repository';
import { getPageBySlug } from '@/server/services/content-service';

/**
 * A CMS page, rendered from the `pages` table.
 *
 * -----------------------------------------------------------------------------
 * THE CONTENT IS IN THE DATABASE, NOT IN THIS FILE
 * -----------------------------------------------------------------------------
 *
 * Nothing here hardcodes a policy or an about page. The row supplies the title
 * and the structured blocks; this route decides how each block renders. A slug
 * that has no published row 404s — RLS restricts `pages` to `published`, so a
 * draft is indistinguishable from a slug that was never written.
 *
 * -----------------------------------------------------------------------------
 * WHY THE STATIC ROUTES STILL EXIST
 * -----------------------------------------------------------------------------
 *
 * `/pages/about`, `/pages/faq` and the four policy routes are their own static
 * segments. Next.js matches a static segment before this dynamic one, so they
 * keep their own metadata and, for the FAQ, their own database-backed listing.
 * This route is for everything else the owner publishes from the admin.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS PAGE IS DYNAMIC
 * -----------------------------------------------------------------------------
 *
 * The repository reads through the cookie-aware server client, so the route is
 * dynamic. `generateStaticParams` is kept as the extension point for a future ISR
 * decision, but it must not be the only signal — the product page's production
 * 500 came from exactly that combination.
 */
export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  // Best-effort. The page is dynamic regardless, so a database that is
  // unreachable at build time must not fail the build.
  try {
    const slugs = await fetchPublishedPageSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const result = await getPageBySlug(slug);
    if (result.status !== 'ok') return noIndexMetadata('Page not found');

    const page = result.page;

    return buildMetadata({
      title: page.seoTitle ?? page.title,
      description: page.seoDescription ?? page.excerpt ?? undefined,
      path: `/pages/${page.slug}`,
    });
  } catch {
    return noIndexMetadata('Page not found');
  }
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await getPageBySlug(slug);

  if (result.status === 'unavailable') {
    // Not a 404. The page may well exist; we could not reach the database to
    // find out, and a 404 would state otherwise to the visitor and to a crawler.
    return (
      <div className="container-page py-16 lg:py-24">
        <ErrorState
          title="This page is temporarily unavailable"
          description="We could not reach our content just now. This is a problem at our end, not a missing page — please try again shortly."
        />
      </div>
    );
  }

  if (result.status === 'missing') notFound();

  const page = result.page;

  return (
    <div>
      <PageHero
        title={page.title}
        intro={page.excerpt}
        photograph={SITE_PHOTOGRAPHY.watchmakerBench}
        eyebrowTone="emerald"
      />

      <div className="container-page max-w-3xl py-10 lg:py-14">
        {page.blocks.length > 0 ? (
          <PageBlocks blocks={page.blocks} />
        ) : (
          <p className="text-foreground-muted text-base">This page has no content yet.</p>
        )}
      </div>
    </div>
  );
}

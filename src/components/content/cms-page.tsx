import { notFound } from 'next/navigation';

import { PageBlocks } from '@/components/content/page-blocks';
import { PageHero, type PageHeroTone } from '@/components/layout/page-hero';
import { PlannedPage } from '@/components/chrome/planned-page';
import { ErrorState } from '@/components/ui/states';
import type { SitePhotograph } from '@/lib/images/site-photography';
import { getPageBySlug } from '@/server/services/content-service';

/**
 * A CMS page, rendered from `pages`.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS SHARED BETWEEN THE STATIC ROUTES AND THE DYNAMIC ONE
 * -----------------------------------------------------------------------------
 *
 * `/pages/about`, `/pages/privacy` and the rest are their own static segments, so
 * they match before `/pages/[slug]` and can carry their own metadata. Each one
 * renders through this component, so all of them read the same table and render
 * through the same block renderer — there is no second path that could drift.
 *
 * -----------------------------------------------------------------------------
 * WHY A MISSING ROW CAN STILL RENDER
 * -----------------------------------------------------------------------------
 *
 * A policy route that is linked from the footer must not 404 just because the
 * owner has not written that page yet: a dead footer link is worse than an honest
 * "not written yet" note. `fallback` lets the six known routes show the planned
 * message, while the dynamic route 404s an unknown slug.
 *
 * -----------------------------------------------------------------------------
 * A MISSING ROW AND AN UNREACHABLE DATABASE ARE DIFFERENT ANSWERS
 * -----------------------------------------------------------------------------
 *
 * The service returns `missing` when the row genuinely is not published and
 * `unavailable` when the database could not be reached. Only the first becomes a
 * placeholder or a 404; the second renders an explanation, because claiming a
 * page does not exist when the truth is that we could not look would be wrong —
 * and a crawler would record it as fact. Without this the whole `/pages/*` tree
 * 500s during a database outage, which is exactly what `next start` showed.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS DYNAMIC
 * -----------------------------------------------------------------------------
 *
 * It reads through the cookie-aware server client, so every page that uses it is
 * dynamic. The route files state `export const dynamic = 'force-dynamic'`
 * explicitly, because inferring "static" for a cookie-reading route is the exact
 * failure the product page hit in Phase 6.
 */
export async function CmsPage({
  slug,
  fallback,
  children,
  photograph,
  eyebrowTone = 'emerald',
}: {
  slug: string;
  /** Shown when the page has no published row. Omit to 404 instead. */
  fallback?: { eyebrow: string; title: string; intro: string };
  children?: React.ReactNode;
  /**
   * The band's photography. The policy and story pages share one template, so
   * the image is passed in by whichever route is rendering rather than looked up
   * from the slug: a route knows what kind of page it is, and a lookup would
   * couple this component to the content table's taxonomy.
   */
  photograph?: SitePhotograph;
  /** The section's accent, so the journal reads differently from the catalogue. */
  eyebrowTone?: PageHeroTone;
}) {
  const result = await getPageBySlug(slug);

  if (result.status === 'unavailable') {
    return (
      <div className="container-page py-16 lg:py-24">
        <ErrorState
          title="This page is temporarily unavailable"
          description="We could not reach our content just now. This is a problem at our end, not a missing page — please try again shortly."
        />
      </div>
    );
  }

  if (result.status === 'missing') {
    if (!fallback) notFound();
    return (
      <PlannedPage
        eyebrow={fallback.eyebrow}
        title={fallback.title}
        intro={fallback.intro}
        phase="the content phase (Phase 11)"
      />
    );
  }

  const page = result.page;

  return (
    <div>
      <PageHero
        eyebrow="The journal"
        title={page.title}
        intro={page.excerpt}
        photograph={photograph}
        eyebrowTone={eyebrowTone}
      />

      <div className="container-page max-w-3xl py-10 lg:py-14">
        {page.blocks.length > 0 ? (
          <PageBlocks blocks={page.blocks} />
        ) : children ? null : (
          <p className="text-foreground-muted text-base">This page has no content yet.</p>
        )}
        {children}
      </div>
    </div>
  );
}

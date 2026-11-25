import type { Metadata } from 'next';

import { CmsPage } from '@/components/content/cms-page';
import { SITE_PHOTOGRAPHY } from '@/lib/images/site-photography';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * The Shipping page.
 *
 * The content is read from the `pages` table, so the owner edits it in the admin
 * rather than in this file. Until that row is published the page shows an honest
 * "not written yet" note instead of 404ing, because this route is linked from the
 * footer and a dead link is worse than an empty page.
 *
 * Dynamic: the repository reads through the cookie-aware server client. The
 * export is stated rather than inferred, because a cookie-reading route that
 * Next.js classifies as static fails at request time in a production build.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Shipping',
  description: 'How we deliver, insure and track a timepiece, and what to expect when it arrives.',
  path: '/pages/shipping',
});

export default function Page() {
  return (
    <CmsPage
      slug="shipping"
      fallback={{
        eyebrow: 'Policies',
        title: 'Shipping',
        intro: 'How we deliver, insure and track a timepiece.',
      }}
      photograph={SITE_PHOTOGRAPHY.rolexOysterPerpetual}
      eyebrowTone="sapphire"
    />
  );
}

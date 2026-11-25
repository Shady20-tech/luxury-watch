import type { Metadata } from 'next';

import { CmsPage } from '@/components/content/cms-page';
import { SITE_PHOTOGRAPHY } from '@/lib/images/site-photography';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * The Terms of Use page.
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
  title: 'Terms of Use',
  description: 'The terms on which this site and our sales operate.',
  path: '/pages/terms',
});

export default function Page() {
  return (
    <CmsPage
      slug="terms"
      fallback={{
        eyebrow: 'Policies',
        title: 'Terms of Use',
        intro: 'The terms on which this site and our sales operate.',
      }}
      photograph={SITE_PHOTOGRAPHY.burenMovement}
      eyebrowTone="emerald"
    />
  );
}

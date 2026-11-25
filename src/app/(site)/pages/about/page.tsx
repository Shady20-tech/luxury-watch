import type { Metadata } from 'next';

import { CmsPage } from '@/components/content/cms-page';
import { SITE_PHOTOGRAPHY } from '@/lib/images/site-photography';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * The About Us page.
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
  title: 'About Us',
  description: 'Who we are and how we work, and what we look for in a watch.',
  path: '/pages/about',
});

export default function Page() {
  return (
    <CmsPage
      slug="about"
      fallback={{
        eyebrow: 'The Boutique',
        title: 'About Us',
        intro: 'Who we are and how we work.',
      }}
      photograph={SITE_PHOTOGRAPHY.patekDisplay}
      eyebrowTone="burgundy"
    />
  );
}

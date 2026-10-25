import type { Metadata } from 'next';

import { CmsPage } from '@/components/content/cms-page';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * The Returns & Warranty page.
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
  title: 'Returns & Warranty',
  description: 'Our returns window and what our warranty covers.',
  path: '/pages/warranty',
});

export default function Page() {
  return (
    <CmsPage
      slug="warranty"
      fallback={{
        eyebrow: 'Policies',
        title: 'Returns & Warranty',
        intro: 'Our returns window and what our warranty covers.',
      }}
    />
  );
}

import type { Metadata } from 'next';

import { CmsPage } from '@/components/content/cms-page';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * The Privacy Policy page.
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
  title: 'Privacy Policy',
  description: 'What personal data we hold, why we hold it and how you can ask us to remove it.',
  path: '/pages/privacy',
});

export default function Page() {
  return (
    <CmsPage
      slug="privacy"
      fallback={{
        eyebrow: 'Policies',
        title: 'Privacy Policy',
        intro: 'What personal data we hold and how we handle it.',
      }}
    />
  );
}

import type { Metadata } from 'next';

import { HomepageEditor } from '@/components/admin/homepage-editor';
import { AdminPageHeader } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAdminHomepageSections } from '@/server/repositories/admin-content-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Homepage · Content · Administration');

export default async function AdminHomepagePage() {
  await requirePermission('content.read');
  const sections = await fetchAdminHomepageSections();

  return (
    <div>
      <AdminPageHeader
        title="Homepage"
        description="What each section says. The sections themselves are fixed by the page layout; this edits their copy, links and visibility."
      />
      <HomepageEditor sections={sections} />
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

import { PageList } from '@/components/admin/page-editor';
import { AdminPageHeader } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAdminPages } from '@/server/repositories/admin-content-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Pages · Content · Administration');

export default async function AdminPagesPage() {
  await requirePermission('content.read');
  const pages = await fetchAdminPages();

  return (
    <div>
      <AdminPageHeader
        title="Pages"
        description="Editorial pages served at /pages/<address>. A page that is not published is not served and is not in the sitemap."
        actions={
          <Link
            href="/admin/settings/pages/new"
            className="bg-ink-900 hover:bg-ink-800 rounded-sm px-4 py-2 text-sm font-medium text-white"
          >
            New page
          </Link>
        }
      />
      <PageList pages={pages} />
    </div>
  );
}

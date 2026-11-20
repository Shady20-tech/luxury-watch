import type { Metadata } from 'next';

import { NavigationEditor } from '@/components/admin/content-editors';
import { AdminPageHeader } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAdminNavigation } from '@/server/repositories/admin-content-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Navigation · Content · Administration');

export default async function AdminNavigationPage() {
  await requirePermission('content.read');
  const items = await fetchAdminNavigation();

  return (
    <div>
      <AdminPageHeader
        title="Navigation"
        description="Header, top-bar and footer links. Saving refreshes the public chrome immediately."
      />
      <NavigationEditor items={items} />
    </div>
  );
}

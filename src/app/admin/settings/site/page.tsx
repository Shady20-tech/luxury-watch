import type { Metadata } from 'next';

import { SiteSettingsEditor } from '@/components/admin/settings-editors';
import { AdminPageHeader } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAdminSiteSettings } from '@/server/repositories/admin-content-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Site settings · Administration');

export default async function AdminSiteSettingsPage() {
  await requirePermission('settings.write');
  const settings = await fetchAdminSiteSettings();

  return (
    <div>
      <AdminPageHeader
        title="Site settings"
        description="The business details every page shows, plus the age gate and the note after an order request."
      />
      <SiteSettingsEditor settings={settings} />
    </div>
  );
}

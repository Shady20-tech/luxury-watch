import type { Metadata } from 'next';

import { AnnouncementEditor } from '@/components/admin/content-editors';
import { AdminPageHeader } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAdminAnnouncements } from '@/server/repositories/admin-content-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Announcements · Content · Administration');

export default async function AdminAnnouncementsPage() {
  await requirePermission('content.read');
  const announcements = await fetchAdminAnnouncements();

  return (
    <div>
      <AdminPageHeader
        title="Announcements"
        description="The message bar, optionally limited to a date window."
      />
      <AnnouncementEditor announcements={announcements} />
    </div>
  );
}

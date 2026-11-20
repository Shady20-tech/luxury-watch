import type { Metadata } from 'next';

import { MediaLibrary } from '@/components/admin/media-library';
import { AdminPageHeader } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { deleteMediaAction } from '@/server/actions/content-actions';
import { fetchAdminMedia } from '@/server/repositories/admin-content-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Media library · Content · Administration');

/**
 * The media library.
 *
 * Uploads go to `/api/admin/media/upload`; deletes go through the server action so
 * the reference check runs before anything is removed. The two paths differ
 * because an upload is a batch of files and a delete is one row with a rule
 * attached.
 */
export default async function AdminMediaPage() {
  await requirePermission('content.read');
  const media = await fetchAdminMedia({ limit: 60 });

  return (
    <div>
      <AdminPageHeader
        title="Media library"
        description="Images used across the site. An image still referenced by a page, product or the logo cannot be deleted."
      />
      <MediaLibrary media={media} deleteAction={deleteMediaAction} />
    </div>
  );
}

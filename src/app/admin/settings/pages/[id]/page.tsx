import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PageForm } from '@/components/admin/page-editor';
import { AdminPageHeader } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { savePageAction } from '@/server/actions/content-actions';
import { fetchAdminPage } from '@/server/repositories/admin-content-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Edit page · Content · Administration');

export default async function EditPagePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('content.write');
  const { id } = await params;
  const page = await fetchAdminPage(id);

  if (!page) notFound();

  return (
    <div>
      <AdminPageHeader
        title={page.title}
        description={
          page.isSystem
            ? 'This page backs a fixed route. Only an administrator can unpublish it.'
            : undefined
        }
      />
      <PageForm action={savePageAction} page={page} bodyExample="[]" />
    </div>
  );
}

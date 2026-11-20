import type { Metadata } from 'next';

import { PageForm } from '@/components/admin/page-editor';
import { AdminPageHeader } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { savePageAction } from '@/server/actions/content-actions';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('New page · Content · Administration');

const BODY_EXAMPLE = JSON.stringify(
  [
    { type: 'heading', text: 'A heading', level: 2 },
    { type: 'paragraph', text: 'A paragraph of text.' },
  ],
  null,
  2,
);

export default async function NewPagePage() {
  await requirePermission('content.write');

  return (
    <div>
      <AdminPageHeader
        title="New page"
        description="It starts as a draft, so nothing is public until you publish it."
      />
      <PageForm action={savePageAction} bodyExample={BODY_EXAMPLE} />
    </div>
  );
}

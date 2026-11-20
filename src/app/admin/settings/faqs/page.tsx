import type { Metadata } from 'next';

import { FaqEditor } from '@/components/admin/content-editors';
import { AdminPageHeader } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAdminFaqs } from '@/server/repositories/admin-content-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Questions · Content · Administration');

export default async function AdminFaqsPage() {
  await requirePermission('content.read');
  const faqs = await fetchAdminFaqs();

  return (
    <div>
      <AdminPageHeader
        title="Questions"
        description="Shown on the FAQ page, grouped by topic. An unpublished question is kept but not displayed."
      />
      <FaqEditor faqs={faqs} />
    </div>
  );
}

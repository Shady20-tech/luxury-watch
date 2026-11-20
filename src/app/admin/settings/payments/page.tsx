import type { Metadata } from 'next';

import { PaymentMethodEditor } from '@/components/admin/settings-editors';
import { AdminPageHeader } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAdminPaymentMethods } from '@/server/repositories/admin-content-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Payment methods · Administration');

export default async function AdminPaymentsPage() {
  await requirePermission('settings.write');
  const methods = await fetchAdminPaymentMethods();

  return (
    <div>
      <AdminPageHeader
        title="Payment methods"
        description="The offline methods a customer may choose. There is no online payment; an administrator settles each order."
      />
      <PaymentMethodEditor methods={methods} />
    </div>
  );
}

import type { Metadata } from 'next';

import { DeliveryOptionEditor } from '@/components/admin/settings-editors';
import { AdminPageHeader } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAdminDeliveryOptions } from '@/server/repositories/admin-content-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Delivery options · Administration');

export default async function AdminDeliveryPage() {
  await requirePermission('settings.write');
  const options = await fetchAdminDeliveryOptions();

  return (
    <div>
      <AdminPageHeader
        title="Delivery options"
        description="How an order reaches the customer, and what each option costs."
      />
      <DeliveryOptionEditor options={options} />
    </div>
  );
}

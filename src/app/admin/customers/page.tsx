import type { Metadata } from 'next';

import { AdminPageHeader, AdminTable, AdminTd, AdminTh, EmptyState } from '@/components/admin/ui';
import { formatAdminDate } from '@/lib/admin/format';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { listCustomers } from '@/server/repositories/admin-service-repository';
import { requirePermission } from '@/server/services/admin-authorization';

/**
 * Customer accounts.
 *
 * Read-only. Editing a customer's details from here would mean staff acting as the
 * customer, which is a support workflow this phase does not build and which the
 * schema deliberately does not make easy: `profiles` is self-editable, and there
 * is no staff write policy that would let this page change one without bypassing
 * the rules that protect it.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Customers · Administration');

export default async function AdminCustomersPage() {
  await requirePermission('customers.read');
  const customers = await listCustomers();

  return (
    <div>
      <AdminPageHeader
        title="Customers"
        description="Registered accounts, newest first. Guest orders are not accounts and appear only under order requests."
      />

      {customers.length === 0 ? (
        <EmptyState title="No registered customers yet">
          <p>Customers who check out as a guest are recorded against their order, not here.</p>
        </EmptyState>
      ) : (
        <AdminTable caption="Customers">
          <thead>
            <tr>
              <AdminTh>Name</AdminTh>
              <AdminTh>Email</AdminTh>
              <AdminTh>Joined</AdminTh>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => (
              <tr key={customer.id}>
                <AdminTd className="font-medium">{customer.fullName ?? '—'}</AdminTd>
                <AdminTd className="break-all">{customer.email ?? '—'}</AdminTd>
                <AdminTd className="text-foreground-muted text-xs whitespace-nowrap tabular-nums">
                  {formatAdminDate(customer.createdAt)}
                </AdminTd>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </div>
  );
}

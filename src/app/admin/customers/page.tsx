import type { Metadata } from 'next';

import { AdminCard, AdminPageHeader, AdminTd, AdminTh, EmptyState } from '@/components/admin/ui';
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
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Customers"
        title="Registered accounts"
        description="Registered accounts, newest first. Guest orders are not accounts and appear only under order requests."
        actions={
          <span className="text-ink-500 text-sm tabular-nums">
            {customers.length} {customers.length === 1 ? 'account' : 'accounts'}
          </span>
        }
      />

      <AdminCard title="All customers" description="Newest first" flush>
        {customers.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState title="No registered customers yet">
              <p>Customers who check out as a guest are recorded against their order, not here.</p>
            </EmptyState>
          </div>
        ) : (
          <div className="border-line-200 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <caption className="sr-only">Customers</caption>
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
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}

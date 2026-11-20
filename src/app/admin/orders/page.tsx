import type { Metadata } from 'next';
import Link from 'next/link';

import {
  AdminPageHeader,
  AdminPagination,
  AdminTable,
  AdminTd,
  AdminTh,
  EmptyState,
  StatusPill,
} from '@/components/admin/ui';
import { formatAdminDateTime } from '@/lib/admin/format';
import { buildOrderHref, parseOrderParams } from '@/lib/admin/params';
import { ORDER_STATUSES } from '@/lib/admin/validation';
import { formatMoney } from '@/lib/orders/checkout-options';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchOrderStatusCounts, listOrders } from '@/server/repositories/admin-order-repository';
import { getAdminIdentity, requirePermission } from '@/server/services/admin-authorization';

/**
 * Order requests.
 *
 * Status filters are cumulative (`?status=submitted,under_review`) so the
 * dashboard can link to "everything waiting on you" in one URL. Counts come from
 * a single grouped read rather than eight separate count queries.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Order requests · Administration');

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await getAdminIdentity();
  if (!identity) return null;

  await requirePermission('orders.read');

  const params = parseOrderParams(await searchParams);
  const [result, counts] = await Promise.all([
    listOrders({
      statuses: params.status,
      query: params.q,
      page: params.page,
      pageSize: params.pageSize,
    }),
    fetchOrderStatusCounts(),
  ]);

  const totalAll = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <div>
      <AdminPageHeader
        title="Order requests"
        description="Customers submit a request; payment is settled offline and recorded here. No card is ever handled by this site."
      />

      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href={buildOrderHref(params, { status: [], page: 1 })}
          aria-current={params.status.length === 0 ? 'true' : undefined}
          className={
            params.status.length === 0
              ? 'bg-ink-900 text-surface-0 rounded-full px-3 py-1 text-xs font-medium'
              : 'border-line-300 hover:border-line-400 text-ink-700 rounded-full border px-3 py-1 text-xs font-medium'
          }
        >
          All <span className="tabular-nums">({totalAll})</span>
        </Link>
        {ORDER_STATUSES.map((status) => {
          const active = params.status.includes(status);
          const count = counts[status] ?? 0;
          return (
            <Link
              key={status}
              href={buildOrderHref(params, {
                status: active
                  ? params.status.filter((s) => s !== status)
                  : [...params.status, status],
                page: 1,
              })}
              aria-current={active ? 'true' : undefined}
              className={
                active
                  ? 'bg-ink-900 text-surface-0 rounded-full px-3 py-1 text-xs font-medium'
                  : 'border-line-300 hover:border-line-400 text-ink-700 rounded-full border px-3 py-1 text-xs font-medium'
              }
            >
              {status.replace(/_/g, ' ')} <span className="tabular-nums">({count})</span>
            </Link>
          );
        })}
      </nav>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        {params.status.length > 0 ? (
          <input type="hidden" name="status" value={params.status.join(',')} />
        ) : null}
        <div className="min-w-0 flex-1">
          <label htmlFor="order-search" className="text-ink-500 mb-1 block text-xs font-medium">
            Search
          </label>
          <input
            id="order-search"
            name="q"
            type="search"
            defaultValue={params.q ?? ''}
            placeholder="Reference, name or email"
            className="border-line-300 focus-visible:outline-gold-700 w-full rounded-sm border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1"
          />
        </div>
        <button
          type="submit"
          className="border-line-300 hover:border-line-400 focus-visible:outline-gold-700 rounded-sm border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Search
        </button>
        {params.q ? (
          <Link
            href={buildOrderHref(params, { q: undefined, page: 1 })}
            className="text-foreground-muted hover:text-ink-900 px-2 py-2 text-sm underline-offset-4 hover:underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <p className="text-foreground-muted mb-3 text-sm tabular-nums" role="status">
        {result.total} {result.total === 1 ? 'order' : 'orders'}
        {params.q ? ` matching “${params.q}”` : ''}
      </p>

      {result.rows.length === 0 ? (
        <EmptyState title="No orders match these filters">
          {params.q || params.status.length > 0 ? (
            <p>
              Try{' '}
              <Link href="/admin/orders" className="underline underline-offset-4">
                clearing the filters
              </Link>
              .
            </p>
          ) : (
            <p>No order requests have been submitted yet.</p>
          )}
        </EmptyState>
      ) : (
        <>
          <AdminTable caption="Order requests">
            <thead>
              <tr>
                <AdminTh>Reference</AdminTh>
                <AdminTh>Customer</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh className="text-right">Total</AdminTh>
                <AdminTh>Received</AdminTh>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id}>
                  <AdminTd>
                    <Link
                      href={`/admin/orders/${row.id}`}
                      className="text-ink-900 font-medium underline-offset-4 hover:underline"
                    >
                      {row.reference}
                    </Link>
                    <span className="text-foreground-muted block text-xs">
                      {row.itemCount} {row.itemCount === 1 ? 'item' : 'items'} ·{' '}
                      {row.fulfilmentType}
                    </span>
                  </AdminTd>
                  <AdminTd>
                    <span className="block">{row.customerName}</span>
                    <span className="text-foreground-muted block text-xs">{row.customerEmail}</span>
                  </AdminTd>
                  <AdminTd>
                    <StatusPill status={row.status} />
                  </AdminTd>
                  <AdminTd className="text-right tabular-nums">
                    {formatMoney(row.totalCents, row.currency)}
                  </AdminTd>
                  <AdminTd className="text-foreground-muted text-xs whitespace-nowrap tabular-nums">
                    {formatAdminDateTime(row.createdAt)}
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>

          <AdminPagination
            page={result.page}
            pageCount={result.pageCount}
            buildHref={(page) => buildOrderHref(params, { page })}
          />
        </>
      )}
    </div>
  );
}

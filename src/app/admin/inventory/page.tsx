import type { Metadata } from 'next';
import Link from 'next/link';

import {
  AdminPageHeader,
  AdminPagination,
  AdminTable,
  AdminTd,
  AdminTh,
  EmptyState,
} from '@/components/admin/ui';
import { StockAdjustForm } from '@/components/admin/stock-adjust-form';
import { formatAdminDateTime } from '@/lib/admin/format';
import { buildInventoryHref, parseInventoryParams } from '@/lib/admin/params';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { adjustStockAction } from '@/server/actions/admin-actions';
import { listInventory } from '@/server/repositories/admin-inventory-repository';
import { getAdminIdentity, requirePermission } from '@/server/services/admin-authorization';

/**
 * Inventory.
 *
 * `quantity` is the physical balance and `reserved` is what open orders have
 * claimed; the two are shown separately because the number that matters to a
 * customer is the difference. A product with three in stock and three reserved is
 * sold out, and showing "3" alone would mislead the person answering the phone.
 *
 * There is no "set quantity" control anywhere on this page. Stock changes only
 * through `admin_adjust_stock`, which writes a ledger row in the same
 * transaction. An editable total would let the balance and the history disagree,
 * and the history is the only record of why the balance is what it is.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Inventory · Administration');

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await getAdminIdentity();
  if (!identity) return null;

  await requirePermission('inventory.read');
  const mayWrite = identity.permissions.has('inventory.write');

  const params = parseInventoryParams(await searchParams);
  const result = await listInventory({
    query: params.q,
    lowStockOnly: params.filter === 'low',
    page: params.page,
    pageSize: params.pageSize,
  });

  return (
    <div>
      <AdminPageHeader
        title="Inventory"
        description="Physical stock and reservations. Adjustments are recorded in a ledger; the balance is never edited directly."
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="inventory-search" className="text-ink-500 mb-1 block text-xs font-medium">
            Search
          </label>
          <input
            id="inventory-search"
            name="q"
            type="search"
            defaultValue={params.q ?? ''}
            placeholder="Title or reference"
            className="border-line-300 focus-visible:outline-gold-700 w-full rounded-sm border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1"
          />
        </div>
        <div>
          <label htmlFor="inventory-filter" className="text-ink-500 mb-1 block text-xs font-medium">
            Show
          </label>
          <select
            id="inventory-filter"
            name="filter"
            defaultValue={params.filter ?? ''}
            className="border-line-300 focus-visible:outline-gold-700 rounded-sm border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1"
          >
            <option value="">All stock</option>
            <option value="low">Low stock only</option>
          </select>
        </div>
        <button
          type="submit"
          className="border-line-300 hover:border-line-400 focus-visible:outline-gold-700 rounded-sm border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Apply
        </button>
        {params.q || params.filter ? (
          <Link
            href="/admin/inventory"
            className="text-foreground-muted hover:text-ink-900 px-2 py-2 text-sm underline-offset-4 hover:underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <p className="text-foreground-muted mb-3 text-sm tabular-nums" role="status">
        {result.total} {result.total === 1 ? 'product' : 'products'} tracked
      </p>

      {result.rows.length === 0 ? (
        <EmptyState title="No inventory matches these filters">
          {params.q || params.filter ? (
            <p>
              Try{' '}
              <Link href="/admin/inventory" className="underline underline-offset-4">
                clearing the filters
              </Link>
              .
            </p>
          ) : (
            <p>No products have an inventory record yet.</p>
          )}
        </EmptyState>
      ) : (
        <>
          <AdminTable caption="Inventory">
            <thead>
              <tr>
                <AdminTh>Product</AdminTh>
                <AdminTh className="text-right">On hand</AdminTh>
                <AdminTh className="text-right">Reserved</AdminTh>
                <AdminTh className="text-right">Available</AdminTh>
                <AdminTh>Updated</AdminTh>
                {mayWrite ? <AdminTh>Adjust</AdminTh> : null}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.productId}>
                  <AdminTd>
                    <div className="flex flex-col">
                      <Link
                        href={`/admin/products/${row.productId}`}
                        className="text-ink-900 font-medium underline-offset-4 hover:underline"
                      >
                        {row.product.title}
                      </Link>
                      <span className="text-foreground-muted text-xs">
                        {row.product.brandName ? `${row.product.brandName} · ` : ''}
                        {row.product.referenceNumber ?? 'No reference'}
                        {row.product.status !== 'published' ? ` · ${row.product.status}` : ''}
                      </span>
                    </div>
                  </AdminTd>
                  <AdminTd className="text-right tabular-nums">
                    <span className={row.isLowStock ? 'text-danger-600 font-semibold' : undefined}>
                      {row.quantity}
                      {row.isLowStock ? <span className="sr-only"> (low stock)</span> : null}
                    </span>
                  </AdminTd>
                  <AdminTd className="text-right tabular-nums">{row.reservedQuantity}</AdminTd>
                  <AdminTd className="text-right font-medium tabular-nums">{row.available}</AdminTd>
                  <AdminTd className="text-foreground-muted text-xs whitespace-nowrap tabular-nums">
                    {formatAdminDateTime(row.updatedAt)}
                  </AdminTd>
                  {mayWrite ? (
                    <AdminTd>
                      <StockAdjustForm
                        action={adjustStockAction}
                        productId={row.productId}
                        productTitle={row.product.title}
                      />
                    </AdminTd>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </AdminTable>

          <AdminPagination
            page={result.page}
            pageCount={result.pageCount}
            buildHref={(page) => buildInventoryHref(params, { page })}
          />
        </>
      )}
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';

import {
  AdminPageHeader,
  AdminPagination,
  AdminTable,
  AdminTd,
  AdminTh,
  EmptyState,
  StatusPill,
} from '@/components/admin/ui';
import { formatAdminDate } from '@/lib/admin/format';
import { buildProductHref, parseProductParams } from '@/lib/admin/params';
import { formatMoney } from '@/lib/orders/checkout-options';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { listProducts } from '@/server/repositories/admin-product-repository';
import { getAdminIdentity, requirePermission } from '@/server/services/admin-authorization';

/**
 * The product list.
 *
 * Filters live in the URL, so a filtered view can be shared, bookmarked and
 * survives a reload — the same rule the storefront catalogue follows, and for the
 * same reason: state held only in a component cannot be linked to.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Products · Administration');

const STATUSES = ['all', 'published', 'draft', 'archived'] as const;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await getAdminIdentity();
  if (!identity) return null;

  // Reading the catalogue needs `catalog.read`; editing needs `catalog.write`.
  // The list is readable by any role that may see the catalogue, and the edit
  // controls are rendered only for those who may use them.
  await requirePermission('catalog.read');
  const mayWrite = identity.permissions.has('catalog.write');

  const params = parseProductParams(await searchParams);
  const result = await listProducts({
    status: params.status,
    query: params.q,
    brandId: params.brand,
    lowStockOnly: params.stock === 'low',
    page: params.page,
    pageSize: params.pageSize,
  });

  return (
    <div>
      <AdminPageHeader
        title="Products"
        description="Every watch in the catalogue, including drafts and archived pieces. Only published products appear in the storefront."
        actions={
          mayWrite ? (
            <Link
              href="/admin/products/new"
              className="bg-ink-900 text-surface-0 focus-visible:outline-gold-700 inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              New product
            </Link>
          ) : null
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="product-search" className="text-ink-500 mb-1 block text-xs font-medium">
            Search
          </label>
          <input
            id="product-search"
            name="q"
            type="search"
            defaultValue={params.q ?? ''}
            placeholder="Title, reference or slug"
            className="border-line-300 focus-visible:outline-gold-700 w-full rounded-sm border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1"
          />
        </div>

        <div>
          <label htmlFor="product-status" className="text-ink-500 mb-1 block text-xs font-medium">
            Status
          </label>
          <select
            id="product-status"
            name="status"
            defaultValue={params.status}
            className="border-line-300 focus-visible:outline-gold-700 rounded-sm border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1"
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status === 'all' ? 'All statuses' : status}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="product-stock" className="text-ink-500 mb-1 block text-xs font-medium">
            Stock
          </label>
          <select
            id="product-stock"
            name="stock"
            defaultValue={params.stock ?? ''}
            className="border-line-300 focus-visible:outline-gold-700 rounded-sm border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1"
          >
            <option value="">Any stock</option>
            <option value="low">Low stock only</option>
          </select>
        </div>

        <button
          type="submit"
          className="border-line-300 hover:border-line-400 focus-visible:outline-gold-700 rounded-sm border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Apply
        </button>

        {params.q || params.status !== 'all' || params.stock ? (
          <Link
            href="/admin/products"
            className="text-foreground-muted hover:text-ink-900 px-2 py-2 text-sm underline-offset-4 hover:underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <p className="text-foreground-muted mb-3 text-sm tabular-nums" role="status">
        {result.total} {result.total === 1 ? 'product' : 'products'}
        {params.q ? ` matching “${params.q}”` : ''}
      </p>

      {result.rows.length === 0 ? (
        <EmptyState title="No products match these filters">
          {params.q || params.status !== 'all' || params.stock ? (
            <p>
              Try{' '}
              <Link href="/admin/products" className="underline underline-offset-4">
                clearing the filters
              </Link>
              .
            </p>
          ) : (
            <p>Nothing has been added to the catalogue yet.</p>
          )}
        </EmptyState>
      ) : (
        <>
          <AdminTable caption="Products">
            <thead>
              <tr>
                <AdminTh>Product</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh className="text-right">Price</AdminTh>
                <AdminTh className="text-right">Stock</AdminTh>
                <AdminTh>Updated</AdminTh>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const lowStock =
                  row.quantity !== null &&
                  row.lowStockThreshold !== null &&
                  row.quantity <= row.lowStockThreshold;

                return (
                  <tr key={row.id}>
                    <AdminTd>
                      <div className="flex flex-col">
                        <Link
                          href={`/admin/products/${row.id}`}
                          className="text-ink-900 font-medium underline-offset-4 hover:underline"
                        >
                          {row.title}
                        </Link>
                        <span className="text-foreground-muted text-xs">
                          {row.brandName ? `${row.brandName} · ` : ''}
                          {row.referenceNumber ?? 'No reference'}
                        </span>
                      </div>
                    </AdminTd>
                    <AdminTd>
                      <StatusPill status={row.status} />
                      {row.isFeatured ? (
                        <span className="text-gold-900 ml-2 text-xs font-medium">Featured</span>
                      ) : null}
                    </AdminTd>
                    <AdminTd className="text-right tabular-nums">
                      {row.priceOnRequest ? (
                        <span className="text-foreground-muted">Enquiry</span>
                      ) : row.priceCents !== null ? (
                        formatMoney(row.priceCents, row.currency)
                      ) : (
                        <span className="text-foreground-muted">—</span>
                      )}
                    </AdminTd>
                    <AdminTd className="text-right tabular-nums">
                      {row.quantity === null ? (
                        <span className="text-foreground-muted">—</span>
                      ) : (
                        <span className={lowStock ? 'text-danger-600 font-semibold' : undefined}>
                          {row.quantity}
                          {lowStock ? <span className="sr-only"> (low stock)</span> : null}
                        </span>
                      )}
                    </AdminTd>
                    <AdminTd className="text-foreground-muted text-xs whitespace-nowrap tabular-nums">
                      {formatAdminDate(row.updatedAt)}
                    </AdminTd>
                  </tr>
                );
              })}
            </tbody>
          </AdminTable>

          <AdminPagination
            page={result.page}
            pageCount={result.pageCount}
            buildHref={(page) => buildProductHref(params, { page })}
          />
        </>
      )}
    </div>
  );
}

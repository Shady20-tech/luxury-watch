import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';

import { AdminPageHeader, StatusPill } from '@/components/admin/ui';
import { ProductForm } from '@/components/admin/product-form';
import { RemoveProductPanel } from '@/components/admin/remove-product-panel';
import { formatAdminDateTime } from '@/lib/admin/format';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { updateProductAction } from '@/server/actions/admin-actions';
import { getProduct, listBrandsAndModels } from '@/server/repositories/admin-product-repository';
import { requirePermission } from '@/server/services/admin-authorization';

/**
 * The product editor.
 *
 * `notFound()` for an unknown id, so a stale link produces a proper 404 rather
 * than an empty editor that would fail on submit.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Edit product · Administration');

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePermission('catalog.read');
  const { id } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [product, taxonomy] = await Promise.all([getProduct(id), listBrandsAndModels()]);
  if (!product) notFound();

  return (
    <div>
      <AdminPageHeader
        title={product.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={product.status} />
            <span>Last updated {formatAdminDateTime(product.updatedAt)}</span>
            {product.status === 'published' ? (
              <Link
                href={`/products/${product.slug}`}
                className="text-accent-text inline-flex items-center gap-1 underline-offset-4 hover:underline"
              >
                View in store
                <ExternalLink aria-hidden="true" className="h-3 w-3" />
              </Link>
            ) : null}
          </span>
        }
        actions={
          <Link
            href="/admin/products"
            className="text-ink-700 hover:text-ink-900 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to products
          </Link>
        }
      />

      {identity.permissions.has('catalog.write') ? (
        <div className="mb-6">
          <RemoveProductPanel
            productId={product.id}
            productTitle={product.title}
            status={product.status}
          />
        </div>
      ) : null}

      <ProductForm
        action={updateProductAction}
        product={product}
        brands={taxonomy.brands}
        models={taxonomy.models}
      />
    </div>
  );
}

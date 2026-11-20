import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { AdminPageHeader } from '@/components/admin/ui';
import { ProductForm } from '@/components/admin/product-form';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { createProductAction } from '@/server/actions/admin-actions';
import { listBrandsAndModels } from '@/server/repositories/admin-product-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('New product · Administration');

export default async function NewProductPage() {
  await requirePermission('catalog.write');
  const { brands, models } = await listBrandsAndModels();

  return (
    <div>
      <AdminPageHeader
        title="New product"
        description="Created as a draft. Publishing is a separate step, because the database stamps the first publication date."
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
      <ProductForm action={createProductAction} brands={brands} models={models} />
    </div>
  );
}

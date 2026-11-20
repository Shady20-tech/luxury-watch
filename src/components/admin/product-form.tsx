'use client';

import { useActionState } from 'react';

import type { AdminFormState } from '@/lib/admin/validation';
import { IDLE_ADMIN_STATE } from '@/lib/admin/validation';
import type { AdminProductDetail } from '@/server/repositories/admin-product-repository';

/**
 * The product editor.
 *
 * A Client Component only because it needs `useActionState` to show a pending
 * state and the returned errors without a full reload. It renders no data the
 * server has not already authorised: the page that mounts it has checked
 * `catalog.write`, and the action checks again.
 *
 * -----------------------------------------------------------------------------
 * TWO FIELDSETS, ONE FORM
 * -----------------------------------------------------------------------------
 *
 * The form is one `<form>` so that a single submit saves everything, but the
 * fields are grouped into fieldsets with legends. A long unbroken column of
 * inputs is hard to scan, and a screen reader announces the legend when entering
 * each group — which is what makes a forty-field editor navigable at all.
 */

type Props = {
  action: (state: AdminFormState, formData: FormData) => Promise<AdminFormState>;
  product?: AdminProductDetail;
  brands: { id: string; name: string }[];
  models: { id: string; name: string; brandId: string }[];
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-danger-600 mt-1 text-xs" id={`${message}-error`}>
      {message}
    </p>
  );
}

const inputClass =
  'border-line-300 focus-visible:outline-gold-700 w-full rounded-sm border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1';
const labelClass = 'text-ink-700 mb-1 block text-xs font-medium';

export function ProductForm({ action, product, brands, models }: Props) {
  const [state, formAction, pending] = useActionState(action, IDLE_ADMIN_STATE);
  const errors = state.fieldErrors ?? {};

  const money = (cents: number | null | undefined) =>
    cents === null || cents === undefined ? '' : String(cents);

  return (
    <form action={formAction} className="space-y-8">
      {product ? <input type="hidden" name="id" value={product.id} /> : null}

      {state.status === 'error' && state.message ? (
        <p
          role="alert"
          className="border-danger-600/30 bg-danger-600/10 text-danger-600 rounded-sm border px-3 py-2 text-sm"
        >
          {state.message}
        </p>
      ) : null}
      {state.status === 'success' && state.message ? (
        <p
          role="status"
          className="border-success-600/30 bg-success-600/10 text-success-600 rounded-sm border px-3 py-2 text-sm"
        >
          {state.message}
        </p>
      ) : null}

      <fieldset className="border-line-300 rounded-md border p-4">
        <legend className="px-1 text-sm font-semibold">Identity</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="title" className={labelClass}>
              Title
            </label>
            <input
              id="title"
              name="title"
              required
              defaultValue={product?.title ?? ''}
              className={inputClass}
              aria-invalid={Boolean(errors.title)}
            />
            <FieldError message={errors.title} />
          </div>

          <div>
            <label htmlFor="slug" className={labelClass}>
              Slug
            </label>
            <input
              id="slug"
              name="slug"
              required
              defaultValue={product?.slug ?? ''}
              className={inputClass}
              aria-invalid={Boolean(errors.slug)}
            />
            <FieldError message={errors.slug} />
          </div>

          <div>
            <label htmlFor="sku" className={labelClass}>
              SKU
            </label>
            <input
              id="sku"
              name="sku"
              required
              defaultValue={product?.sku ?? ''}
              className={inputClass}
              aria-invalid={Boolean(errors.sku)}
            />
            <FieldError message={errors.sku} />
          </div>

          <div>
            <label htmlFor="referenceNumber" className={labelClass}>
              Reference number
            </label>
            <input
              id="referenceNumber"
              name="referenceNumber"
              defaultValue={product?.referenceNumber ?? ''}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="brandId" className={labelClass}>
              Brand
            </label>
            <select
              id="brandId"
              name="brandId"
              defaultValue={product?.brandId ?? ''}
              className={inputClass}
            >
              <option value="">No brand</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="modelId" className={labelClass}>
              Model
            </label>
            <select
              id="modelId"
              name="modelId"
              defaultValue={product?.modelId ?? ''}
              className={inputClass}
            >
              <option value="">No model</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="border-line-300 rounded-md border p-4">
        <legend className="px-1 text-sm font-semibold">Pricing</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="priceCents" className={labelClass}>
              Price (minor units, e.g. cents)
            </label>
            <input
              id="priceCents"
              name="priceCents"
              inputMode="numeric"
              defaultValue={money(product?.priceCents)}
              className={inputClass}
              aria-invalid={Boolean(errors.priceCents)}
              aria-describedby="price-help"
            />
            <p id="price-help" className="text-foreground-muted mt-1 text-xs">
              Leave blank and tick “sold by enquiry” for a price-on-request piece.
            </p>
            <FieldError message={errors.priceCents} />
          </div>

          <div>
            <label htmlFor="compareAtCents" className={labelClass}>
              Compare-at price (minor units)
            </label>
            <input
              id="compareAtCents"
              name="compareAtCents"
              inputMode="numeric"
              defaultValue={money(product?.compareAtCents)}
              className={inputClass}
            />
            <FieldError message={errors.compareAtCents} />
          </div>

          <div>
            <label htmlFor="costCents" className={labelClass}>
              Cost (minor units, internal only)
            </label>
            <input
              id="costCents"
              name="costCents"
              inputMode="numeric"
              defaultValue={money(product?.costCents)}
              className={inputClass}
            />
            <p className="text-foreground-muted mt-1 text-xs">
              Never shown to customers. Withheld from the public API by a column grant.
            </p>
          </div>

          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="priceOnRequest"
                defaultChecked={product?.priceOnRequest ?? false}
              />
              Sold by enquiry (no public price)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isFeatured"
                defaultChecked={product?.isFeatured ?? false}
              />
              Featured
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset className="border-line-300 rounded-md border p-4">
        <legend className="px-1 text-sm font-semibold">Specification</legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="condition" className={labelClass}>
              Condition
            </label>
            <select
              id="condition"
              name="condition"
              defaultValue={product?.condition ?? ''}
              className={inputClass}
            >
              <option value="">Not recorded</option>
              <option value="new">New</option>
              <option value="unworn">Unworn</option>
              <option value="pre_owned">Pre-owned</option>
              <option value="vintage">Vintage</option>
            </select>
          </div>

          <div>
            <label htmlFor="productionYear" className={labelClass}>
              Production year
            </label>
            <input
              id="productionYear"
              name="productionYear"
              inputMode="numeric"
              defaultValue={product?.productionYear ?? ''}
              className={inputClass}
            />
            <FieldError message={errors.productionYear} />
          </div>

          <div>
            <label htmlFor="caseSizeMm" className={labelClass}>
              Case size (mm)
            </label>
            <input
              id="caseSizeMm"
              name="caseSizeMm"
              inputMode="numeric"
              defaultValue={product?.caseSizeMm ?? ''}
              className={inputClass}
            />
            <FieldError message={errors.caseSizeMm} />
          </div>

          <div>
            <label htmlFor="caseMaterial" className={labelClass}>
              Case material
            </label>
            <input
              id="caseMaterial"
              name="caseMaterial"
              defaultValue={product?.caseMaterial ?? ''}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="dialColor" className={labelClass}>
              Dial colour
            </label>
            <input
              id="dialColor"
              name="dialColor"
              defaultValue={product?.dialColor ?? ''}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="braceletMaterial" className={labelClass}>
              Bracelet / strap
            </label>
            <input
              id="braceletMaterial"
              name="braceletMaterial"
              defaultValue={product?.braceletMaterial ?? ''}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="movement" className={labelClass}>
              Movement
            </label>
            <input
              id="movement"
              name="movement"
              defaultValue={product?.movement ?? ''}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="bezel" className={labelClass}>
              Bezel
            </label>
            <input
              id="bezel"
              name="bezel"
              defaultValue={product?.bezel ?? ''}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="waterResistanceM" className={labelClass}>
              Water resistance (m)
            </label>
            <input
              id="waterResistanceM"
              name="waterResistanceM"
              inputMode="numeric"
              defaultValue={product?.waterResistanceM ?? ''}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="gender" className={labelClass}>
              Category / gender
            </label>
            <input
              id="gender"
              name="gender"
              defaultValue={product?.gender ?? ''}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="boxAndPapers" className={labelClass}>
              Box and papers
            </label>
            <select
              id="boxAndPapers"
              name="boxAndPapers"
              defaultValue={
                product?.boxAndPapers === true
                  ? 'yes'
                  : product?.boxAndPapers === false
                    ? 'no'
                    : 'unknown'
              }
              className={inputClass}
            >
              <option value="unknown">Not recorded</option>
              <option value="yes">Included</option>
              <option value="no">Not included</option>
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="border-line-300 rounded-md border p-4">
        <legend className="px-1 text-sm font-semibold">Copy and search</legend>
        <div className="space-y-4">
          <div>
            <label htmlFor="shortDescription" className={labelClass}>
              Short summary
            </label>
            <textarea
              id="shortDescription"
              name="shortDescription"
              rows={2}
              defaultValue={product?.shortDescription ?? ''}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="description" className={labelClass}>
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={6}
              defaultValue={product?.description ?? ''}
              className={inputClass}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="seoTitle" className={labelClass}>
                SEO title
              </label>
              <input
                id="seoTitle"
                name="seoTitle"
                defaultValue={product?.seoTitle ?? ''}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="ogImageUrl" className={labelClass}>
                Social image URL
              </label>
              <input
                id="ogImageUrl"
                name="ogImageUrl"
                type="url"
                defaultValue={product?.ogImageUrl ?? ''}
                className={inputClass}
              />
              <FieldError message={errors.ogImageUrl} />
            </div>
          </div>
          <div>
            <label htmlFor="seoDescription" className={labelClass}>
              SEO description
            </label>
            <textarea
              id="seoDescription"
              name="seoDescription"
              rows={2}
              defaultValue={product?.seoDescription ?? ''}
              className={inputClass}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="border-line-300 rounded-md border p-4">
        <legend className="px-1 text-sm font-semibold">Publication</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="status" className={labelClass}>
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={product?.status ?? 'draft'}
              className={inputClass}
            >
              <option value="draft">Draft — not visible to customers</option>
              <option value="published">Published — visible in the storefront</option>
              <option value="archived">Archived — hidden, kept for reference</option>
            </select>
            <p className="text-foreground-muted mt-1 text-xs">
              First publication is timestamped by the database; a product cannot be created already
              published.
            </p>
          </div>

          <div>
            <label htmlFor="sortOrder" className={labelClass}>
              Sort order (lower first)
            </label>
            <input
              id="sortOrder"
              name="sortOrder"
              inputMode="numeric"
              defaultValue={product?.sortOrder ?? 0}
              className={inputClass}
            />
            <FieldError message={errors.sortOrder} />
          </div>
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-ink-900 text-surface-0 focus-visible:outline-gold-700 rounded-sm px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        >
          {pending ? 'Saving…' : product ? 'Save changes' : 'Create product'}
        </button>
      </div>
    </form>
  );
}

// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PriceBlock, priceBlockRows } from '@/components/product/price-block';
import { SpecTable } from '@/components/product/spec-table';
import type { ProductDetail, SpecRow } from '@/lib/product/types';

/**
 * The product page must state each fact once.
 *
 * `PriceBlock` prints the reference, condition and year beside the price, and
 * `SpecTable` prints the complete specification a few centimetres below. Both
 * derive their rows from the same view model, so both legitimately contained
 * Reference/Condition/Year — and the page showed `Reference: 116400` twice, once
 * in each block. Every existing test was green: `buildSpecs` deduplicates
 * correctly, and it has no way to know what a *different component* prints.
 *
 * The defect can only be caught by looking at the page as a whole, which is what
 * these tests do — they render both blocks together and count the labels.
 */

afterEach(cleanup);

const product: ProductDetail = {
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'test-watch',
  title: 'Test Watch',
  brandName: 'Test Brand',
  brandSlug: 'test-brand',
  modelName: null,
  modelSlug: null,
  reference: '116400',
  condition: 'pre_owned',
  conditionLabel: 'Pre-owned',
  year: 2024,
  price: null,
  currency: 'USD',
  priceMinor: null,
  availability: 'available',
  shortDescription: null,
  description: null,
  specs: [],
  images: [],
  collections: [],
  policies: [],
  dialColor: null,
  caseMaterial: null,
  seoTitle: null,
  seoDescription: null,
  ogImageUrl: null,
  publishedAt: null,
  updatedAt: null,
} as unknown as ProductDetail;

/** The rows `SpecTable` would receive for this product. */
const specs: SpecRow[] = [
  { label: 'Reference', value: '116400' },
  { label: 'Condition', value: 'Pre-owned' },
  { label: 'Year', value: '2024' },
  { label: 'Case size', value: '40 mm' },
];

function renderPage(specRows: SpecRow[]) {
  return render(
    <>
      <PriceBlock product={product} />
      <SpecTable specs={specRows} omit={priceBlockRows(product).map((row) => row.label)} />
    </>,
  );
}

describe('product page duplicate specification rows', () => {
  it('renders each identifying fact exactly once across both blocks', () => {
    renderPage(specs);

    for (const label of ['Reference', 'Condition', 'Year']) {
      expect(screen.getAllByText(label), `${label} must appear once`).toHaveLength(1);
    }
  });

  it('keeps a specification row the price block does not state', () => {
    renderPage(specs);

    expect(screen.getByText('Case size')).toBeDefined();
    expect(screen.getByText('40 mm')).toBeDefined();
  });

  it('omits only what the price block actually renders', () => {
    // A product with no year: the block prints no Year row, so the table must
    // keep its own rather than hiding a fact the page would then never show.
    const noYear = { ...product, year: null } as ProductDetail;
    const blockLabels = priceBlockRows(noYear).map((row) => row.label);

    expect(blockLabels).not.toContain('Year');
    expect(blockLabels).toEqual(['Reference', 'Condition']);
  });

  it('states nothing twice when the price block renders no rows at all', () => {
    // Price-on-request with no reference, condition or year recorded: the block
    // shows the enquiry copy and no facts, so the table must show all of them.
    const sparse = {
      ...product,
      reference: null,
      condition: null,
      conditionLabel: null,
      year: null,
    } as ProductDetail;

    expect(priceBlockRows(sparse)).toEqual([]);
  });
});

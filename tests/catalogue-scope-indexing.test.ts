import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetPublicEnvCache } from '@/lib/env';

/**
 * What a scoped listing tells a crawler.
 *
 * Two separate facts decide it, and conflating them is easy:
 *
 *   * a filtered permutation (`?brand=rolex`, `?sort=price_asc`, `?page=2`) is
 *     the same products under a different URL, so it must not rank;
 *   * a brand or collection holding nothing published is a page whose only
 *     content is "we hold none of these right now", so it must not rank either.
 *
 * The second rule is the one this file exists for. Before it, an empty brand
 * page answered `index, follow` and the sitemap advertised it: a crawler was
 * invited to a thin page, and the sitemap agreed. The rule now reads the same
 * `published_product_counts` / `published_collection_counts` aggregate the
 * sitemap reads, so the two cannot drift — which is what these tests pin.
 *
 * `generateMetadata` is exercised directly rather than through a rendered page,
 * because the robots directive never reaches the DOM.
 */

const fetchActiveBrandSummary = vi.fn();
const fetchActiveCollectionSummary = vi.fn();
const fetchActiveModelSummary = vi.fn();

vi.mock('server-only', () => ({}));

vi.mock('@/server/repositories/catalogue-repository', () => ({
  fetchActiveBrandSummary: (...args: unknown[]) => fetchActiveBrandSummary(...args),
  fetchActiveCollectionSummary: (...args: unknown[]) => fetchActiveCollectionSummary(...args),
  fetchActiveModelSummary: (...args: unknown[]) => fetchActiveModelSummary(...args),
}));

const { generateMetadata: brandMetadata } = await import('@/app/(site)/brands/[slug]/page');
const { generateMetadata: collectionMetadata } = await import(
  '@/app/(site)/collections/[slug]/page'
);
const { generateMetadata: modelMetadata } = await import(
  '@/app/(site)/brands/[slug]/models/[model]/page'
);

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
  resetPublicEnvCache();
  fetchActiveBrandSummary.mockReset();
  fetchActiveCollectionSummary.mockReset();
  fetchActiveModelSummary.mockReset();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  resetPublicEnvCache();
});

function robotsOf(metadata: { robots?: unknown }): { index?: boolean; follow?: boolean } {
  const { robots } = metadata;
  if (!robots || typeof robots !== 'object') throw new Error('metadata has no robots directive');
  return robots as { index?: boolean; follow?: boolean };
}

describe('brand page indexing', () => {
  it('indexes a brand that holds published pieces', async () => {
    fetchActiveBrandSummary.mockResolvedValue({
      id: 'b1',
      name: 'Rolex',
      description: null,
      productCount: 4,
    });

    const metadata = await brandMetadata({
      params: Promise.resolve({ slug: 'rolex' }),
      searchParams: Promise.resolve({}),
    });

    expect(robotsOf(metadata).index).toBe(true);
    expect(metadata.alternates?.canonical).toBe('https://example.com/brands/rolex');
  });

  it('does not index a brand with nothing published', async () => {
    fetchActiveBrandSummary.mockResolvedValue({
      id: 'b2',
      name: 'Richard Mille',
      description: null,
      productCount: 0,
    });

    const metadata = await brandMetadata({
      params: Promise.resolve({ slug: 'richard-mille' }),
      searchParams: Promise.resolve({}),
    });

    expect(robotsOf(metadata).index).toBe(false);
    // `follow` stays on: the page is still a useful hop to the rest of the
    // catalogue, even though the page itself should not rank.
    expect(robotsOf(metadata).follow).toBe(true);
  });

  it('does not index a filtered brand listing even when the brand has stock', async () => {
    fetchActiveBrandSummary.mockResolvedValue({
      id: 'b1',
      name: 'Rolex',
      description: null,
      productCount: 4,
    });

    const metadata = await brandMetadata({
      params: Promise.resolve({ slug: 'rolex' }),
      searchParams: Promise.resolve({ model: 'milgauss' }),
    });

    expect(robotsOf(metadata).index).toBe(false);
    expect(metadata.alternates?.canonical).toBe('https://example.com/brands/rolex');
  });

  it('does not index an unknown brand', async () => {
    fetchActiveBrandSummary.mockResolvedValue(null);

    const metadata = await brandMetadata({
      params: Promise.resolve({ slug: 'not-a-brand' }),
      searchParams: Promise.resolve({}),
    });

    expect(robotsOf(metadata).index).toBe(false);
  });
});

describe('collection page indexing', () => {
  it('indexes a populated collection', async () => {
    fetchActiveCollectionSummary.mockResolvedValue({
      id: 'c1',
      title: 'Featured',
      description: null,
      productCount: 6,
    });

    const metadata = await collectionMetadata({
      params: Promise.resolve({ slug: 'featured' }),
      searchParams: Promise.resolve({}),
    });

    expect(robotsOf(metadata).index).toBe(true);
    expect(metadata.alternates?.canonical).toBe('https://example.com/collections/featured');
  });

  it('does not index an empty collection', async () => {
    fetchActiveCollectionSummary.mockResolvedValue({
      id: 'c2',
      title: 'Empty Vault',
      description: null,
      productCount: 0,
    });

    const metadata = await collectionMetadata({
      params: Promise.resolve({ slug: 'empty-vault' }),
      searchParams: Promise.resolve({}),
    });

    expect(robotsOf(metadata).index).toBe(false);
  });
});

/**
 * Editorial metadata overrides.
 *
 * `brands`, `collections` and `models` all carry `seo_title` and
 * `seo_description`. Those columns were readable through PostgREST the whole
 * time and no public route selected them, so an administrator could write a
 * search title and watch the page serve a computed one instead. Nothing failed —
 * the override simply never reached the `<head>` — which is the kind of silent
 * fault a schema-aware test catches and a rendering test does not.
 *
 * These pin the precedence rule: the editor's copy wins when set, and the
 * computed default is what a null falls back to.
 */
describe('editorial metadata overrides', () => {
  it('prefers a brand SEO title and description over the computed pair', async () => {
    fetchActiveBrandSummary.mockResolvedValue({
      id: 'b1',
      name: 'Rolex',
      description: 'Our Rolex blurb.',
      seoTitle: 'Rolex watches at Carbon',
      seoDescription: 'The Rolex pieces we hold.',
      productCount: 4,
    });

    const metadata = await brandMetadata({
      params: Promise.resolve({ slug: 'rolex' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Rolex watches at Carbon');
    expect(metadata.description).toBe('The Rolex pieces we hold.');
  });

  it('falls back to the computed brand title and the brand blurb when no override is set', async () => {
    fetchActiveBrandSummary.mockResolvedValue({
      id: 'b1',
      name: 'Rolex',
      description: 'Our Rolex blurb.',
      seoTitle: null,
      seoDescription: null,
      productCount: 4,
    });

    const metadata = await brandMetadata({
      params: Promise.resolve({ slug: 'rolex' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Rolex watches');
    expect(metadata.description).toBe('Our Rolex blurb.');
  });

  it('prefers a collection SEO title and description over the collection copy', async () => {
    fetchActiveCollectionSummary.mockResolvedValue({
      id: 'c1',
      title: 'Featured',
      description: 'Hand-picked pieces.',
      seoTitle: 'Featured watches',
      seoDescription: 'A curated selection.',
      productCount: 6,
    });

    const metadata = await collectionMetadata({
      params: Promise.resolve({ slug: 'featured' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Featured watches');
    expect(metadata.description).toBe('A curated selection.');
  });

  it('falls back to the collection title when no override is set', async () => {
    fetchActiveCollectionSummary.mockResolvedValue({
      id: 'c1',
      title: 'Featured',
      description: null,
      seoTitle: null,
      seoDescription: null,
      productCount: 6,
    });

    const metadata = await collectionMetadata({
      params: Promise.resolve({ slug: 'featured' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Featured');
    expect(metadata.description).toContain('curated selection');
  });

  it('prefers a model SEO title and description over the computed pair', async () => {
    fetchActiveModelSummary.mockResolvedValue({
      id: 'm1',
      name: 'Milgauss',
      description: 'Our Milgauss blurb.',
      brandName: 'Rolex',
      brandSlug: 'rolex',
      seoTitle: 'Rolex Milgauss at Carbon',
      seoDescription: 'The Milgauss pieces we hold.',
      productCount: 2,
    });

    const metadata = await modelMetadata({
      params: Promise.resolve({ slug: 'rolex', model: 'milgauss' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Rolex Milgauss at Carbon');
    expect(metadata.description).toBe('The Milgauss pieces we hold.');
  });

  it('falls back to the computed model title when no override is set', async () => {
    fetchActiveModelSummary.mockResolvedValue({
      id: 'm1',
      name: 'Milgauss',
      description: null,
      brandName: 'Rolex',
      brandSlug: 'rolex',
      seoTitle: null,
      seoDescription: null,
      productCount: 2,
    });

    const metadata = await modelMetadata({
      params: Promise.resolve({ slug: 'rolex', model: 'milgauss' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Rolex Milgauss');
    expect(metadata.description).toContain('Milgauss');
  });
});

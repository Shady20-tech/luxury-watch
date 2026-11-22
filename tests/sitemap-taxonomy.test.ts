import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as envModule from '@/lib/env';

import { resetPublicEnvCache } from '@/lib/env';

/**
 * The sitemap's membership rule, and the page rule it has to agree with.
 *
 * Two mechanisms decide whether a brand or collection URL belongs in the index:
 * the page's `robots` metadata and the sitemap. If they disagree, one of them
 * is lying — a page that says `noindex` while the sitemap advertises it, or a
 * page that invites a crawler while the sitemap hides it. Neither fails on its
 * own, which is why the agreement is asserted here rather than reviewed.
 *
 * The rule has two halves, and the second was missing until this test existed:
 *
 *   1. A filtered or searched permutation is `noindex` and absent from the
 *      sitemap. That is the crawl-trap half, and it was already handled.
 *   2. A brand or collection with **no published pieces** is thin content and is
 *      `noindex`, so it must also be absent from the sitemap. Before the fix the
 *      sitemap listed every active row regardless of stock, which advertised
 *      pages that could only say "we hold none of these".
 */

const fetchBrandSitemapRows = vi.fn();
const fetchCollectionSitemapRows = vi.fn();
const fetchModelSitemapRows = vi.fn();
const fetchPageSitemapRows = vi.fn();
const fetchProductSitemapRows = vi.fn();

vi.mock('server-only', () => ({}));

vi.mock('@/server/repositories/sitemap-repository', () => ({
  fetchBrandSitemapRows: (...args: unknown[]) => fetchBrandSitemapRows(...args),
  fetchCollectionSitemapRows: (...args: unknown[]) => fetchCollectionSitemapRows(...args),
  fetchModelSitemapRows: (...args: unknown[]) => fetchModelSitemapRows(...args),
  fetchPageSitemapRows: (...args: unknown[]) => fetchPageSitemapRows(...args),
  fetchProductSitemapRows: (...args: unknown[]) => fetchProductSitemapRows(...args),
}));

vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof envModule>();
  return { ...actual, isSupabaseConfigured: () => true };
});

const { default: sitemap } = await import('@/app/sitemap');

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
  resetPublicEnvCache();
  fetchBrandSitemapRows.mockReset();
  fetchCollectionSitemapRows.mockReset();
  // Default to no models so the brand/collection cases below are unaffected by
  // the model branch added with the model page.
  fetchModelSitemapRows.mockReset();
  fetchModelSitemapRows.mockResolvedValue([]);
  fetchProductSitemapRows.mockReset();
  fetchProductSitemapRows.mockResolvedValue([]);
  // Default to no extra CMS pages; the informational routes are listed from a
  // static list, and the page-specific cases below opt in.
  fetchPageSitemapRows.mockReset();
  fetchPageSitemapRows.mockResolvedValue([]);
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  resetPublicEnvCache();
});

async function urls(): Promise<string[]> {
  return (await sitemap()).map((entry) => entry.url);
}

describe('sitemap taxonomy membership', () => {
  it('lists a brand that has published pieces', async () => {
    fetchBrandSitemapRows.mockResolvedValue([
      { slug: 'rolex', updated_at: '2026-10-01T00:00:00.000Z', product_count: 4 },
    ]);
    fetchCollectionSitemapRows.mockResolvedValue([]);

    expect(await urls()).toContain('https://example.com/brands/rolex');
  });

  it('omits a brand with no published pieces, because its page is noindex', async () => {
    fetchBrandSitemapRows.mockResolvedValue([
      { slug: 'richard-mille', updated_at: null, product_count: 0 },
    ]);
    fetchCollectionSitemapRows.mockResolvedValue([]);

    expect(await urls()).not.toContain('https://example.com/brands/richard-mille');
  });

  it('omits an empty collection and lists a populated one', async () => {
    fetchBrandSitemapRows.mockResolvedValue([]);
    fetchCollectionSitemapRows.mockResolvedValue([
      { slug: 'featured', updated_at: null, product_count: 6 },
      { slug: 'empty-vault', updated_at: null, product_count: 0 },
    ]);

    const result = await urls();
    expect(result).toContain('https://example.com/collections/featured');
    expect(result).not.toContain('https://example.com/collections/empty-vault');
  });

  it('never lists a filtered or sorted permutation', async () => {
    fetchBrandSitemapRows.mockResolvedValue([
      { slug: 'rolex', updated_at: null, product_count: 4 },
    ]);
    fetchCollectionSitemapRows.mockResolvedValue([]);

    for (const url of await urls()) {
      expect(url).not.toMatch(/\?/);
    }
  });

  it('lists a model under its brand and omits an empty one', async () => {
    fetchBrandSitemapRows.mockResolvedValue([]);
    fetchCollectionSitemapRows.mockResolvedValue([]);
    fetchModelSitemapRows.mockResolvedValue([
      { scopeSlug: 'rolex/milgauss', updated_at: null, product_count: 4 },
      { scopeSlug: 'rolex/other', updated_at: null, product_count: 0 },
    ]);

    const result = await urls();
    // The URL is nested, because the model slug alone is not unique across
    // brands — the same rule the route applies.
    expect(result).toContain('https://example.com/brands/rolex/models/milgauss');
    expect(result).not.toContain('https://example.com/brands/rolex/models/other');
    // A bare `/models/...` path must never appear; it would not resolve.
    expect(result.some((url) => /\/models\//.test(url) && !/\/brands\//.test(url))).toBe(false);
  });

  it('keeps the four static listings regardless of the database', async () => {
    fetchBrandSitemapRows.mockResolvedValue([]);
    fetchCollectionSitemapRows.mockResolvedValue([]);

    const result = await urls();
    for (const path of ['/', '/shop', '/brands', '/collections']) {
      expect(result).toContain(`https://example.com${path}`);
    }
  });

  it('still serves the static routes when the taxonomy query fails', async () => {
    fetchBrandSitemapRows.mockRejectedValue(new Error('database is down'));
    fetchCollectionSitemapRows.mockResolvedValue([]);

    // A sitemap that throws is a 500 for every crawler, so a failure degrades to
    // the static entries rather than propagating.
    expect(await urls()).toContain('https://example.com/shop');
  });

  it('carries the row timestamp as lastmod, not a build time', async () => {
    fetchBrandSitemapRows.mockResolvedValue([
      { slug: 'rolex', updated_at: '2026-10-01T12:00:00.000Z', product_count: 4 },
    ]);
    fetchCollectionSitemapRows.mockResolvedValue([]);

    const entry = (await sitemap()).find(
      (candidate) => candidate.url === 'https://example.com/brands/rolex',
    );
    expect(new Date(entry?.lastModified ?? 0).toISOString()).toBe('2026-10-01T12:00:00.000Z');
  });
});

describe('sitemap product membership', () => {
  it('lists a published product with its real lastmod', async () => {
    fetchBrandSitemapRows.mockResolvedValue([]);
    fetchCollectionSitemapRows.mockResolvedValue([]);
    fetchProductSitemapRows.mockResolvedValue([
      { slug: 'rolex-milgauss-116400gv', updated_at: '2026-09-02T08:00:00.000Z' },
    ]);

    const entry = (await sitemap()).find(
      (candidate) => candidate.url === 'https://example.com/products/rolex-milgauss-116400gv',
    );
    expect(entry).toBeDefined();
    expect(new Date(entry?.lastModified ?? 0).toISOString()).toBe('2026-09-02T08:00:00.000Z');
  });

  it('lists only the rows the public query returned, so an archived piece is absent', async () => {
    // RLS is what excludes a draft or archived row; the sitemap must not add a
    // second, weaker filter of its own and must not re-add anything it is given.
    fetchBrandSitemapRows.mockResolvedValue([]);
    fetchCollectionSitemapRows.mockResolvedValue([]);
    fetchProductSitemapRows.mockResolvedValue([{ slug: 'published-piece', updated_at: null }]);

    const result = await urls();
    expect(result).toContain('https://example.com/products/published-piece');
    expect(result.some((url) => url.includes('/products/archived-piece'))).toBe(false);
  });
});

/**
 * A sitemap entry has to be reachable by following a link.
 *
 * `/collections` was in the sitemap from the moment the index existed, but no
 * navigation row pointed at it — the only way in was to know the address or read
 * the sitemap. That is a page a crawler can find and a visitor cannot, and it
 * weakens the signal the sitemap is meant to send. The seed is the source of the
 * navigation, so the check reads it rather than a rendered page: it can run
 * without a server, and it fails on the same commit that removes the link.
 */
describe('sitemap reachability', () => {
  const seed = readFileSync(join(process.cwd(), 'supabase/seed/02_content.sql'), 'utf8');

  it.each(['/brands', '/collections'])('seeds a navigation link to %s', (path) => {
    expect(seed).toContain(`'${path}'`);
  });
});

/**
 * The informational routes, and the two ways this list can go wrong.
 *
 * Before Phase 14 the sitemap listed only the catalogue. About, FAQ, the four
 * policy pages, contact, appointments and the three service pages were all
 * indexable — none carried `noindex`, which was checked against a production
 * build — but none was listed, so a crawler could only find them by following
 * navigation. Listing them is the fix; listing a `noindex` page or the same URL
 * twice would be a new defect, so both are asserted.
 */
describe('informational routes in the sitemap', () => {
  it.each([
    '/pages/about',
    '/pages/faq',
    '/pages/privacy',
    '/pages/terms',
    '/pages/shipping',
    '/pages/warranty',
    '/contact',
    '/appointments',
    '/services/sourcing',
    '/services/sell-trade',
    '/services/repair-restoration',
  ])('lists %s', async (path) => {
    expect(await urls()).toContain(`https://example.com${path}`);
  });

  it('never lists the design-system page, which is noindex', async () => {
    // A sitemap entry for a `noindex` page is a contradiction: the sitemap says
    // "index this" and the page says "do not". The page must stay out.
    expect(await urls()).not.toContain('https://example.com/design-system');
  });

  it('emits no duplicate URLs when a CMS page shadows a static route', async () => {
    // The seed has a published `about` row, and `/pages/about` is also a static
    // segment listed from the fixed list. Without the de-duplication the same
    // canonical appears twice, which is a crawl signal that says nothing.
    fetchPageSitemapRows.mockResolvedValue([
      { slug: 'about', updated_at: '2026-10-01T00:00:00.000Z' },
      { slug: 'gift-guide', updated_at: '2026-10-02T00:00:00.000Z' },
    ]);

    const result = await urls();
    const aboutEntries = result.filter((url) => url === 'https://example.com/pages/about');

    expect(aboutEntries).toHaveLength(1);
    // A page with no static route of its own is still listed from the table.
    expect(result).toContain('https://example.com/pages/gift-guide');
  });
});

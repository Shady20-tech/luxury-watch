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

vi.mock('server-only', () => ({}));

vi.mock('@/server/repositories/sitemap-repository', () => ({
  fetchBrandSitemapRows: (...args: unknown[]) => fetchBrandSitemapRows(...args),
  fetchCollectionSitemapRows: (...args: unknown[]) => fetchCollectionSitemapRows(...args),
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

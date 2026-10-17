import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetPublicEnvCache } from '@/lib/env';
import {
  buildSitemapEntry,
  latestLastModified,
  productRevalidationTags,
  toLastModified,
} from '@/lib/seo/sitemap';

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
  resetPublicEnvCache();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  resetPublicEnvCache();
});

/**
 * `lastmod` honesty. A sitemap that claims every page changed today trains
 * crawlers to distrust the signal, so these tests pin the rule that a timestamp
 * is emitted only when a real one exists.
 */
describe('toLastModified', () => {
  it('parses an ISO timestamp', () => {
    expect(toLastModified('2026-03-04T10:20:30.000Z')?.toISOString()).toBe(
      '2026-03-04T10:20:30.000Z',
    );
  });

  it('passes a Date through', () => {
    const date = new Date('2026-01-02T00:00:00.000Z');
    expect(toLastModified(date)).toEqual(date);
  });

  it('returns undefined for null, undefined and empty string', () => {
    expect(toLastModified(null)).toBeUndefined();
    expect(toLastModified(undefined)).toBeUndefined();
    expect(toLastModified('')).toBeUndefined();
  });

  it('returns undefined for an unparseable value rather than inventing a date', () => {
    expect(toLastModified('not-a-date')).toBeUndefined();
    expect(toLastModified('0000-99-99')).toBeUndefined();
  });
});

describe('buildSitemapEntry', () => {
  it('makes the URL absolute', () => {
    expect(buildSitemapEntry({ path: '/products/x' }).url).toBe('https://example.com/products/x');
  });

  it('omits lastModified entirely when no real timestamp is available', () => {
    const entry = buildSitemapEntry({ path: '/', lastModified: null });
    expect(entry).not.toHaveProperty('lastModified');
  });

  it('omits lastModified for an invalid timestamp instead of substituting now', () => {
    const entry = buildSitemapEntry({ path: '/', lastModified: 'garbage' });
    expect(entry).not.toHaveProperty('lastModified');
  });

  it('carries a valid lastModified through', () => {
    const entry = buildSitemapEntry({
      path: '/products/x',
      lastModified: '2026-02-01T00:00:00.000Z',
    });
    expect(entry.lastModified?.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('includes priority only when it is a number', () => {
    expect(buildSitemapEntry({ path: '/', priority: 1 }).priority).toBe(1);
    expect(buildSitemapEntry({ path: '/' })).not.toHaveProperty('priority');
  });

  it('omits alternates when no languages are supplied', () => {
    expect(buildSitemapEntry({ path: '/' })).not.toHaveProperty('alternates');
  });

  it('absolutises alternate language paths', () => {
    const entry = buildSitemapEntry({ path: '/', languages: { en: '/', fr: '/fr' } });
    expect(entry.alternates?.languages).toEqual({
      en: 'https://example.com/',
      fr: 'https://example.com/fr',
    });
  });
});

describe('latestLastModified', () => {
  it('returns the most recent timestamp across entries', () => {
    const result = latestLastModified([
      buildSitemapEntry({ path: '/a', lastModified: '2026-01-01T00:00:00.000Z' }),
      buildSitemapEntry({ path: '/b', lastModified: '2026-06-01T00:00:00.000Z' }),
      buildSitemapEntry({ path: '/c', lastModified: '2026-03-01T00:00:00.000Z' }),
    ]);

    expect(result?.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('ignores entries without a timestamp', () => {
    const result = latestLastModified([
      buildSitemapEntry({ path: '/a' }),
      buildSitemapEntry({ path: '/b', lastModified: '2026-02-02T00:00:00.000Z' }),
    ]);

    expect(result?.toISOString()).toBe('2026-02-02T00:00:00.000Z');
  });

  it('returns undefined when no entry has a timestamp, rather than using today', () => {
    expect(latestLastModified([buildSitemapEntry({ path: '/a' })])).toBeUndefined();
    expect(latestLastModified([])).toBeUndefined();
  });
});

describe('productRevalidationTags', () => {
  it('invalidates the sitemap, the product listings and the product itself', () => {
    // Any product change — publish, edit, unpublish, archive or delete — must
    // refresh all three, otherwise lastmod goes stale.
    expect(productRevalidationTags('example-diver')).toEqual([
      'sitemap',
      'products',
      'product:example-diver',
    ]);
  });
});

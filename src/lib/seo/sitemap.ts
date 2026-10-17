import { absoluteUrl } from '@/lib/env';

/**
 * Sitemap entry construction, including honest `<lastmod>` handling.
 *
 * `lastmod` must reflect the entity's real publish or update timestamp. It is a
 * crawl *hint*: it tells a search engine that a page changed, and it cannot
 * force a recrawl. Claiming a fresher timestamp than reality is both dishonest
 * and ineffective, so timestamps are only emitted when a genuine value exists.
 */

export type ChangeFrequency =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never';

export type SitemapEntry = {
  url: string;
  lastModified?: Date;
  changeFrequency?: ChangeFrequency;
  priority?: number;
  alternates?: { languages?: Record<string, string> };
};

/** Normalise a timestamp, discarding unparseable values rather than guessing. */
export function toLastModified(value: string | Date | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Build a sitemap entry. The URL is made absolute and `lastModified` is dropped
 * entirely when no real timestamp is available.
 */
export function buildSitemapEntry(input: {
  path: string;
  lastModified?: string | Date | null;
  changeFrequency?: ChangeFrequency;
  priority?: number;
  languages?: Record<string, string>;
}): SitemapEntry {
  const entry: SitemapEntry = { url: absoluteUrl(input.path) };

  const lastModified = toLastModified(input.lastModified);
  if (lastModified) entry.lastModified = lastModified;
  if (input.changeFrequency) entry.changeFrequency = input.changeFrequency;
  if (typeof input.priority === 'number') entry.priority = input.priority;

  if (input.languages && Object.keys(input.languages).length > 0) {
    entry.alternates = {
      languages: Object.fromEntries(
        Object.entries(input.languages).map(([locale, path]) => [locale, absoluteUrl(path)]),
      ),
    };
  }

  return entry;
}

/**
 * The single most recent `lastModified` across a set of entries. Used to stamp
 * an index entry with a value that is actually true for the pages beneath it.
 */
export function latestLastModified(entries: SitemapEntry[]): Date | undefined {
  return entries.reduce<Date | undefined>((latest, entry) => {
    if (!entry.lastModified) return latest;
    if (!latest) return entry.lastModified;
    return entry.lastModified > latest ? entry.lastModified : latest;
  }, undefined);
}

/**
 * Cache tags that a sitemap depends on. Admin mutations revalidate these, which
 * is what keeps `lastmod` values from going stale after a product changes.
 */
export const SITEMAP_CACHE_TAG = 'sitemap';
export const PRODUCTS_CACHE_TAG = 'products';
export const COLLECTIONS_CACHE_TAG = 'collections';
export const PAGES_CACHE_TAG = 'pages';

export function productCacheTag(slug: string): string {
  return `product:${slug}`;
}

export function collectionCacheTag(slug: string): string {
  return `collection:${slug}`;
}

/**
 * Every cache tag that must be invalidated when a product changes, whatever the
 * change was. Publishing, editing, unpublishing, archiving and deleting all
 * affect the sitemap and the catalogue listings.
 */
export function productRevalidationTags(slug: string): string[] {
  return [SITEMAP_CACHE_TAG, PRODUCTS_CACHE_TAG, productCacheTag(slug)];
}

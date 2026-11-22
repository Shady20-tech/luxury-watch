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
 * The sitemap route's path.
 *
 * Revalidation is by path rather than by cache tag because that is what
 * `src/app/sitemap.ts` honours: it reads straight through the repository, so
 * there is no tagged data cache to flush and the route's own `revalidate` window
 * is the only cache in play. `revalidatePath` is the only lever that clears it.
 *
 * Verified end to end against a production build in Phase 14, not assumed:
 * publishing a draft left it absent from `/sitemap.xml` until this path was
 * revalidated. `tests/sitemap-revalidation.test.ts` pins that.
 */
export const SITEMAP_PATH = '/sitemap.xml';

/**
 * Every path that must be invalidated when a product changes, whatever the
 * change was. Publishing, editing, unpublishing, archiving and deleting all
 * change both the sitemap and the catalogue listings.
 *
 * The sitemap is included rather than left to its hourly `revalidate` window: a
 * window means a piece published now is absent from the sitemap for up to an
 * hour, and an archived piece stays advertised for the same hour.
 */
export function productRevalidationPaths(slug?: string): string[] {
  const paths = ['/', '/shop', '/collections', '/brands', SITEMAP_PATH];
  if (slug) paths.push(`/products/${slug}`);
  return paths;
}

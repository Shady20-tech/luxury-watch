import 'server-only';

import { createSupabasePublicClient } from '@/lib/supabase/public';

/**
 * The rows the sitemap needs, read without a session.
 *
 * Deliberately separate from `catalogue-repository.ts`, which uses the
 * cookie-aware client. A sitemap is the same document for every visitor, so it
 * must not become dynamic by reading a cookie it does not use. See
 * `lib/supabase/public.ts`.
 *
 * Each query returns only the columns the sitemap emits: the path, the real
 * `updated_at`, and the published count that decides whether the page has
 * anything on it. RLS already restricts these to active rows, so no `is_active`
 * filter is repeated here — but the caller must not assume the query is
 * privileged, which is why the visibility rules are still asserted in
 * `19_catalogue_search.sql` at the database level rather than here.
 *
 * -----------------------------------------------------------------------------
 * WHY A COUNT IS PART OF A SITEMAP QUERY
 * -----------------------------------------------------------------------------
 *
 * A sitemap is a list of pages worth crawling. A brand or collection with no
 * published pieces is a real page with an honest empty state, but it is thin:
 * it says "we hold none of these right now" and nothing else. Listing it asks a
 * crawler to spend budget on a page that cannot rank, and it contradicts the
 * page's own `noindex`. So the count decides membership, and the page uses the
 * same count to reach the same decision — the two cannot drift because they read
 * the same aggregate.
 */

export type SitemapRow = {
  slug: string;
  updated_at: string | null;
  product_count: number;
};

export async function fetchBrandSitemapRows(): Promise<SitemapRow[]> {
  const supabase = createSupabasePublicClient();

  const [brandsResult, countsResult] = await Promise.all([
    supabase.from('brands').select('id, slug, updated_at').order('slug'),
    supabase.rpc('published_product_counts'),
  ]);

  if (brandsResult.error) throw brandsResult.error;
  if (countsResult.error) throw countsResult.error;

  const countByBrand = new Map<string, number>();
  for (const row of countsResult.data ?? []) {
    if (row.brand_id) countByBrand.set(row.brand_id, Number(row.product_count));
  }

  return (brandsResult.data ?? []).map((brand) => ({
    slug: brand.slug,
    updated_at: brand.updated_at,
    product_count: countByBrand.get(brand.id) ?? 0,
  }));
}

export async function fetchCollectionSitemapRows(): Promise<SitemapRow[]> {
  const supabase = createSupabasePublicClient();

  const [collectionsResult, countsResult] = await Promise.all([
    supabase.from('collections').select('id, slug, updated_at').order('slug'),
    supabase.rpc('published_collection_counts'),
  ]);

  if (collectionsResult.error) throw collectionsResult.error;
  if (countsResult.error) throw countsResult.error;

  const countByCollection = new Map<string, number>();
  for (const row of countsResult.data ?? []) {
    if (row.collection_id) {
      countByCollection.set(row.collection_id, Number(row.product_count));
    }
  }

  return (collectionsResult.data ?? []).map((collection) => ({
    slug: collection.slug,
    updated_at: collection.updated_at,
    product_count: countByCollection.get(collection.id) ?? 0,
  }));
}

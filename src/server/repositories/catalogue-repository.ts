import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  toFacetSet,
  totalFromRows,
  type CatalogueFacetsPayload,
  type CatalogueSearchRow,
} from '@/lib/catalogue/assemble';
import { FACET_KEYS, type CatalogueParams } from '@/lib/catalogue/params';
import type { FacetSet } from '@/lib/catalogue/types';

/**
 * Read-only catalogue queries.
 *
 * The request-scoped client is used, not the service-role client. The catalogue
 * functions are `security definer` and re-apply the publication gate
 * themselves, so a privileged key would add risk without adding a row. See
 * ARCHITECTURE.md §6.
 *
 * -----------------------------------------------------------------------------
 * WHY BOTH RPC ARGUMENT SETS ARE BUILT FROM ONE TABLE
 * -----------------------------------------------------------------------------
 *
 * The argument names on `catalogue_search` and `catalogue_facets` are identical
 * by design, and `FACET_KEYS` maps each URL key to its argument name. Building
 * both argument objects from that one table is what stops the grid and the
 * sidebar from ever being filtered by different things — a mismatch there would
 * show a count the grid cannot deliver.
 */

/** One row of the `catalogue_suggest` result. */
export type SuggestRow = {
  kind: string;
  label: string;
  detail: string | null;
  href: string;
};

/**
 * Build the shared RPC arguments from validated params.
 *
 * An absent facet is passed as `null`, not as an empty array: the database
 * functions skip a null filter entirely, whereas an empty array would match
 * nothing and silently empty the catalogue.
 */
function buildFilterArgs(params: CatalogueParams): Record<string, unknown> {
  const args: Record<string, unknown> = {
    p_scope: params.scope,
    p_scope_slug: params.scopeSlug,
    p_query: params.query === '' ? null : params.query,
    p_price_mode: params.priceMode,
    p_price_min: params.priceMin,
    p_price_max: params.priceMax,
    p_year_min: params.yearMin,
    p_year_max: params.yearMax,
    p_case_min: params.caseMin,
    p_case_max: params.caseMax,
    p_box_and_papers: params.boxAndPapers,
    p_availability: params.availability,
  };

  for (const facet of FACET_KEYS) {
    const values = params.facets[facet.key];
    args[facet.field] = values.length > 0 ? values : null;
  }

  return args;
}

/**
 * One page of results, with the total match count.
 *
 * The function reports the total on every row, so the page and its count come
 * back in a single round trip rather than two.
 */
export async function fetchCataloguePage(
  params: CatalogueParams,
): Promise<{ rows: CatalogueSearchRow[]; total: number }> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('catalogue_search', {
    ...buildFilterArgs(params),
    p_sort: params.sort,
    p_limit: params.pageSize,
    p_offset: (params.page - 1) * params.pageSize,
  });

  if (error) throw error;

  const rows = (data ?? []) as unknown as CatalogueSearchRow[];
  return { rows, total: totalFromRows(rows) };
}

/** The facet payload for the current filters. */
export async function fetchCatalogueFacets(params: CatalogueParams): Promise<FacetSet> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('catalogue_facets', buildFilterArgs(params));

  if (error) throw error;
  return toFacetSet((data ?? null) as unknown as CatalogueFacetsPayload | null);
}

/**
 * Typeahead suggestions.
 *
 * Returns an empty list for a blank query rather than throwing, so a caller
 * never has to special-case the empty search box.
 */
export async function fetchSuggestions(query: string, limit = 8): Promise<SuggestRow[]> {
  if (query.trim() === '') return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('catalogue_suggest', {
    p_query: query,
    p_limit: limit,
  });

  if (error) throw error;
  return (data ?? []) as unknown as SuggestRow[];
}

/**
 * An active brand's identity, or `null` when the slug is not active.
 *
 * `productCount` is the published total, read from the same
 * `published_product_counts` aggregate the brand index and the sitemap use. The
 * page needs it because a brand with nothing published is thin content: it
 * still renders, but it marks itself `noindex` and the sitemap omits it. Reading
 * the count from a different query than those two would let the three surfaces
 * disagree about the same brand.
 */
export async function fetchActiveBrandSummary(
  slug: string,
): Promise<{ id: string; name: string; description: string | null; productCount: number } | null> {
  const supabase = await createSupabaseServerClient();

  // RLS already restricts this to active rows, so an inactive slug returns no
  // row and the caller 404s.
  const [brandResult, countsResult] = await Promise.all([
    supabase.from('brands').select('id, name, description').eq('slug', slug).maybeSingle(),
    supabase.rpc('published_product_counts'),
  ]);

  if (brandResult.error) throw brandResult.error;
  if (countsResult.error) throw countsResult.error;

  const brand = brandResult.data;
  if (!brand) return null;

  const row = (countsResult.data ?? []).find((entry) => entry.brand_id === brand.id);
  return { ...brand, productCount: row ? Number(row.product_count) : 0 };
}

/** An active collection's identity, or `null` when the slug is not active. */
export async function fetchActiveCollectionSummary(slug: string): Promise<{
  id: string;
  title: string;
  description: string | null;
  productCount: number;
} | null> {
  const supabase = await createSupabaseServerClient();

  const [collectionResult, countsResult] = await Promise.all([
    supabase.from('collections').select('id, title, description').eq('slug', slug).maybeSingle(),
    supabase.rpc('published_collection_counts'),
  ]);

  if (collectionResult.error) throw collectionResult.error;
  if (countsResult.error) throw countsResult.error;

  const collection = collectionResult.data;
  if (!collection) return null;

  const row = (countsResult.data ?? []).find((entry) => entry.collection_id === collection.id);
  return { ...collection, productCount: row ? Number(row.product_count) : 0 };
}

/**
 * Active brands, for the brand index and for a listing's brand filter.
 *
 * Ordered by `sort_order`, which is the editor's ordering, rather than
 * alphabetically — the same choice the navigation makes.
 */
export async function fetchActiveBrands(): Promise<
  { id: string; name: string; slug: string; description: string | null }[]
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, slug, description')
    .order('sort_order')
    .order('name');

  if (error) throw error;
  return data ?? [];
}

/**
 * One brand with the model families beneath it, for the brand index.
 *
 * A brand tile that lists its families is the brand → model hierarchy the
 * catalogue actually has; a tile that showed only a name would be a link with no
 * information. The count of published pieces comes from the same
 * `published_product_counts` aggregate the homepage uses, so the two surfaces
 * cannot report different numbers for the same brand.
 *
 * Both queries are aggregates over indexed columns, not a read of the
 * catalogue — see the note on `fetchCataloguePage`.
 */
export async function fetchBrandDirectory(): Promise<
  {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    country: string | null;
    foundedYear: number | null;
    productCount: number;
    models: { name: string; slug: string }[];
  }[]
> {
  const supabase = await createSupabaseServerClient();

  const [brandsResult, modelsResult, countsResult] = await Promise.all([
    supabase
      .from('brands')
      .select('id, name, slug, description, country, founded_year')
      .order('sort_order')
      .order('name'),
    supabase.from('models').select('brand_id, name, slug').order('sort_order').order('name'),
    supabase.rpc('published_product_counts'),
  ]);

  if (brandsResult.error) throw brandsResult.error;
  if (modelsResult.error) throw modelsResult.error;
  if (countsResult.error) throw countsResult.error;

  const countByBrand = new Map<string, number>();
  for (const row of countsResult.data ?? []) {
    if (row.brand_id) countByBrand.set(row.brand_id, Number(row.product_count));
  }

  const modelsByBrand = new Map<string, { name: string; slug: string }[]>();
  for (const row of modelsResult.data ?? []) {
    const list = modelsByBrand.get(row.brand_id) ?? [];
    list.push({ name: row.name, slug: row.slug });
    modelsByBrand.set(row.brand_id, list);
  }

  return (brandsResult.data ?? []).map((brand) => ({
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    description: brand.description,
    country: brand.country,
    foundedYear: brand.founded_year,
    productCount: countByBrand.get(brand.id) ?? 0,
    models: modelsByBrand.get(brand.id) ?? [],
  }));
}

/**
 * Active collections, for the collections index and the search landing panel.
 *
 * `productCount` is the number of *published* pieces in the collection, read
 * from `published_collection_counts` rather than by counting the join table
 * client-side. Counting the join rows here would mean reading
 * `collection_products` in full to render a handful of badges, and it would
 * overstate a collection that holds a draft or archived piece — the same class
 * of mistake as showing an unpublished product.
 */
export async function fetchCollectionDirectory(): Promise<
  {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    kind: string;
    productCount: number;
  }[]
> {
  const supabase = await createSupabaseServerClient();

  const [collectionsResult, countsResult] = await Promise.all([
    supabase
      .from('collections')
      .select('id, title, slug, description, kind')
      .order('sort_order')
      .order('title'),
    supabase.rpc('published_collection_counts'),
  ]);

  if (collectionsResult.error) throw collectionsResult.error;
  if (countsResult.error) throw countsResult.error;

  const countByCollection = new Map<string, number>();
  for (const row of countsResult.data ?? []) {
    if (row.collection_id) countByCollection.set(row.collection_id, Number(row.product_count));
  }

  return (collectionsResult.data ?? []).map((collection) => ({
    id: collection.id,
    title: collection.title,
    slug: collection.slug,
    description: collection.description,
    kind: collection.kind,
    productCount: countByCollection.get(collection.id) ?? 0,
  }));
}

/** Active collections, for the collections index. */
export async function fetchActiveCollections(): Promise<
  { id: string; title: string; slug: string; description: string | null; kind: string }[]
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('collections')
    .select('id, title, slug, description, kind')
    .order('sort_order')
    .order('title');

  if (error) throw error;
  return data ?? [];
}

/**
 * A product's identity for a catalogue-scoped lookup.
 *
 * Used by the product route in this phase to tell a real published slug from an
 * invented one. The full product template is Phase 6; this keeps the link
 * honest until then.
 */
export async function fetchPublishedProductIdentity(
  slug: string,
): Promise<{ id: string; title: string; brandName: string | null } | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('products')
    .select('id, title, brands ( name )')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    title: data.title,
    brandName: (data.brands as { name: string } | null)?.name ?? null,
  };
}

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
 *
 * `models` carries each family with its own published count. The brand page
 * renders them as ordinary links, which is what makes a model page reachable by
 * a crawler: the mega-menu that also links them mounts only on interaction, so
 * it contributes no anchors to the served HTML. A model with no published pieces
 * is omitted, matching the rule its own page and the sitemap apply.
 */
export async function fetchActiveBrandSummary(slug: string): Promise<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Editorial hero image for this brand's page, or `null` when none is set. */
  heroImageUrl: string | null;
  /** An editor's metadata overrides. `null` means "use the computed default". */
  seoTitle: string | null;
  seoDescription: string | null;
  productCount: number;
  models: { name: string; slug: string; productCount: number }[];
} | null> {
  const supabase = await createSupabaseServerClient();

  // RLS already restricts this to active rows, so an inactive slug returns no
  // row and the caller 404s.
  const [brandResult, countsResult, modelsResult, modelCountsResult] = await Promise.all([
    supabase
      .from('brands')
      .select('id, name, slug, description, hero_image_url, seo_title, seo_description')
      .eq('slug', slug)
      .maybeSingle(),
    supabase.rpc('published_product_counts'),
    supabase.from('models').select('id, brand_id, name, slug').order('sort_order').order('name'),
    supabase.rpc('published_model_counts'),
  ]);

  if (brandResult.error) throw brandResult.error;
  if (countsResult.error) throw countsResult.error;
  if (modelsResult.error) throw modelsResult.error;
  if (modelCountsResult.error) throw modelCountsResult.error;

  const brand = brandResult.data;
  if (!brand) return null;

  const row = (countsResult.data ?? []).find((entry) => entry.brand_id === brand.id);

  const countByModel = new Map<string, number>();
  for (const entry of modelCountsResult.data ?? []) {
    countByModel.set(entry.model_id, Number(entry.product_count));
  }

  const models = (modelsResult.data ?? [])
    .filter((model) => model.brand_id === brand.id)
    .map((model) => ({
      name: model.name,
      slug: model.slug,
      productCount: countByModel.get(model.id) ?? 0,
    }))
    .filter((model) => model.productCount > 0);

  const { hero_image_url: heroImageUrl, seo_title, seo_description, ...identity } = brand;
  return {
    ...identity,
    heroImageUrl,
    seoTitle: seo_title,
    seoDescription: seo_description,
    productCount: row ? Number(row.product_count) : 0,
    models,
  };
}

/** An active collection's identity, or `null` when the slug is not active. */
export async function fetchActiveCollectionSummary(slug: string): Promise<{
  id: string;
  title: string;
  description: string | null;
  /** Editorial hero image for this collection's page, or `null` when none is set. */
  heroImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  productCount: number;
} | null> {
  const supabase = await createSupabaseServerClient();

  const [collectionResult, countsResult] = await Promise.all([
    supabase
      .from('collections')
      .select('id, title, description, hero_image_url, seo_title, seo_description')
      .eq('slug', slug)
      .maybeSingle(),
    supabase.rpc('published_collection_counts'),
  ]);

  if (collectionResult.error) throw collectionResult.error;
  if (countsResult.error) throw countsResult.error;

  const collection = collectionResult.data;
  if (!collection) return null;

  const row = (countsResult.data ?? []).find((entry) => entry.collection_id === collection.id);
  const { hero_image_url: heroImageUrl, seo_title, seo_description, ...identity } = collection;
  return {
    ...identity,
    heroImageUrl,
    seoTitle: seo_title,
    seoDescription: seo_description,
    productCount: row ? Number(row.product_count) : 0,
  };
}

/**
 * An active model's identity within an active brand, or `null`.
 *
 * Both halves are required because `models` is unique on `(brand_id, slug)` and
 * several brands share a model slug. RLS already restricts `models` and `brands`
 * to active rows, so an inactive pair returns no row and the caller 404s — the
 * same rule the brand and collection routes apply.
 *
 * The published count is the model's own, not the brand's: the page must state
 * how many pieces it will actually show, and `published_product_counts` is keyed
 * by brand, so it cannot answer this. `published_model_counts` is the model-keyed
 * aggregate, and the sitemap reads the same one, so the two cannot disagree.
 */
export async function fetchActiveModelSummary(
  brandSlug: string,
  modelSlug: string,
): Promise<{
  id: string;
  name: string;
  description: string | null;
  brandName: string;
  brandSlug: string;
  /** Editorial hero image for this model's page, or `null` when none is set. */
  heroImageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  productCount: number;
} | null> {
  const supabase = await createSupabaseServerClient();

  const brandResult = await supabase
    .from('brands')
    .select('id, name, slug, hero_image_url')
    .eq('slug', brandSlug)
    .maybeSingle();

  if (brandResult.error) throw brandResult.error;
  if (!brandResult.data) return null;

  const brand = brandResult.data;

  const modelResult = await supabase
    .from('models')
    .select('id, name, description, hero_image_url, seo_title, seo_description')
    .eq('brand_id', brand.id)
    .eq('slug', modelSlug)
    .maybeSingle();

  if (modelResult.error) throw modelResult.error;

  const model = modelResult.data;
  if (!model) return null;

  // The count comes from `published_model_counts`, the same aggregate the
  // sitemap reads, so the page's "N pieces" and the sitemap's inclusion rule can
  // never disagree. It is one aggregate call, not a scan of the products table.
  const countsResult = await supabase.rpc('published_model_counts');

  if (countsResult.error) throw countsResult.error;

  const row = (countsResult.data ?? []).find((entry) => entry.model_id === model.id);

  const { hero_image_url: heroImageUrl, seo_title, seo_description, ...identity } = model;
  return {
    ...identity,
    // A model has no picture of its own in the seed, so it borrows the brand's.
    // The model's own column wins when an administrator sets one, which keeps
    // the hierarchy honest: the more specific page is the one that can differ.
    heroImageUrl: heroImageUrl ?? brand.hero_image_url,
    seoTitle: seo_title,
    seoDescription: seo_description,
    brandName: brand.name,
    brandSlug: brand.slug,
    productCount: row ? Number(row.product_count) : 0,
  };
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
    models: { name: string; slug: string; productCount: number }[];
  }[]
> {
  const supabase = await createSupabaseServerClient();

  const [brandsResult, modelsResult, countsResult, modelCountsResult] = await Promise.all([
    supabase
      .from('brands')
      .select('id, name, slug, description, country, founded_year')
      .order('sort_order')
      .order('name'),
    supabase.from('models').select('id, brand_id, name, slug').order('sort_order').order('name'),
    supabase.rpc('published_product_counts'),
    supabase.rpc('published_model_counts'),
  ]);

  if (brandsResult.error) throw brandsResult.error;
  if (modelsResult.error) throw modelsResult.error;
  if (countsResult.error) throw countsResult.error;
  if (modelCountsResult.error) throw modelCountsResult.error;

  const countByBrand = new Map<string, number>();
  for (const row of countsResult.data ?? []) {
    if (row.brand_id) countByBrand.set(row.brand_id, Number(row.product_count));
  }

  const countByModel = new Map<string, number>();
  for (const row of modelCountsResult.data ?? []) {
    countByModel.set(row.model_id, Number(row.product_count));
  }

  // Only a family with published stock is linked. A model page with nothing to
  // show is `noindex` and absent from the sitemap, so offering it here would
  // hand the crawler a page that cannot rank — the same rule the brand page and
  // the sitemap apply.
  const modelsByBrand = new Map<string, { name: string; slug: string; productCount: number }[]>();
  for (const row of modelsResult.data ?? []) {
    const productCount = countByModel.get(row.id) ?? 0;
    if (productCount === 0) continue;
    const list = modelsByBrand.get(row.brand_id) ?? [];
    list.push({ name: row.name, slug: row.slug, productCount });
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

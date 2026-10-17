import 'server-only';

import { resolveImageUrl } from '@/lib/media';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MAX_RAIL_PRODUCTS } from '@/lib/homepage/assemble';
import type {
  BrandRow,
  HomepageSectionRow,
  ModelRow,
  ProductRow,
  TestimonialRow,
} from '@/lib/homepage/assemble';

/**
 * Read-only homepage queries.
 *
 * The request-scoped client is used, not the service-role client: RLS already
 * restricts these rows to what an anonymous visitor may see (active sections,
 * published products, published testimonials), so a privileged key would add
 * risk without adding a single row. See ARCHITECTURE.md §6.
 *
 * Every function returns plain rows in the shape `lib/homepage/assemble.ts`
 * expects, so the composition logic is testable without a database.
 *
 * -----------------------------------------------------------------------------
 * WHY EVERY QUERY IS BOUNDED
 * -----------------------------------------------------------------------------
 *
 * The catalogue holds over four thousand products. A homepage that selected
 * them all and let the renderer slice would pull megabytes over the wire on
 * every cache miss. Each rail therefore issues a `limit`, and the limit comes
 * from the section's own `settings.limit` clamped to `MAX_RAIL_PRODUCTS`. The
 * bound is applied here, in the query, not only in the assembly.
 */

/** A `homepage_sections` row as the database returns it. */
type RawSection = {
  id: string;
  section_key: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  cta_label: string | null;
  cta_href: string | null;
  image_url: string | null;
  settings: unknown;
  sort_order: number;
};

/** Active homepage sections, in display order. RLS already filters `is_active`. */
export async function fetchHomepageSections(): Promise<HomepageSectionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('homepage_sections')
    .select(
      'id, section_key, title, subtitle, body, cta_label, cta_href, image_url, settings, sort_order',
    )
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw error;
  return (data ?? []) as RawSection[];
}

/** Read a numeric `settings.limit` from a raw row, clamped. */
function sectionLimit(settings: unknown): number {
  if (typeof settings !== 'object' || settings === null) return 4;
  const raw = (settings as Record<string, unknown>).limit;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 4;
  return Math.min(Math.max(Math.trunc(raw), 1), MAX_RAIL_PRODUCTS);
}

/** Read a string `settings.<key>` from a raw row, or `null`. */
function sectionSetting(settings: unknown, key: string): string | null {
  if (typeof settings !== 'object' || settings === null) return null;
  const raw = (settings as Record<string, unknown>)[key];
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null;
}

/** The shape returned by the product select, including the brand join. */
type RawProduct = {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  price_cents: number | null;
  currency: string;
  price_on_request: boolean;
  condition: ProductRow['condition'];
  reference_number: string | null;
  production_year: number | null;
  case_size_mm: number | null;
  movement: string | null;
  dial_color: string | null;
  published_at: string | null;
  brands: { name: string } | null;
  product_images: {
    storage_path: string | null;
    external_url: string | null;
    alt_text: string;
    is_primary: boolean;
    sort_order: number;
  }[];
};

const PRODUCT_SELECT = `
  id, slug, title, short_description, price_cents, currency, price_on_request,
  condition, reference_number, production_year, case_size_mm, movement,
  dial_color, published_at,
  brands ( name ),
  product_images ( storage_path, external_url, alt_text, is_primary, sort_order )
`;

/**
 * Map a raw product row to the assembly shape.
 *
 * The primary image is chosen here rather than in the query: PostgREST returns
 * embedded rows but cannot order an embedded collection for us, and selecting
 * only `is_primary` would drop products whose image is merely ordered first.
 * The array is already bounded by the product limit, so sorting it is cheap.
 */
function toProductRow(raw: RawProduct, available: boolean | null): ProductRow {
  const images = [...(raw.product_images ?? [])].sort((a, b) => {
    // A primary image always wins; otherwise the first by sort_order, which the
    // API returns in its natural order.
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return 0;
  });
  const primary = images[0];

  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    short_description: raw.short_description,
    price_cents: raw.price_cents,
    currency: raw.currency,
    price_on_request: raw.price_on_request,
    condition: raw.condition,
    reference_number: raw.reference_number,
    production_year: raw.production_year,
    case_size_mm: raw.case_size_mm,
    movement: raw.movement,
    dial_color: raw.dial_color,
    published_at: raw.published_at,
    brand_name: raw.brands?.name ?? null,
    image_url: primary ? resolveImageUrl(primary.storage_path, primary.external_url) : null,
    image_alt: primary?.alt_text ?? null,
    available,
  };
}

/**
 * Fetch the products for one collection-backed rail, with availability.
 *
 * Two round trips at most: one for the products, one for availability of the
 * ids just returned. Availability is a separate call because it comes from a
 * database function rather than a column, and the ids are not known until the
 * first query returns.
 */
export async function fetchCollectionProducts(
  collectionSlug: string,
  limit: number,
): Promise<ProductRow[]> {
  const supabase = await createSupabaseServerClient();

  // Resolve the collection by slug first. `collection_products` is a join
  // table, and an inner join through it cannot be expressed in a single
  // PostgREST select without reading the collection row.
  const { data: collection, error: collectionError } = await supabase
    .from('collections')
    .select('id')
    .eq('slug', collectionSlug)
    .maybeSingle();

  if (collectionError) throw collectionError;
  if (!collection) return [];

  const bounded = Math.min(Math.max(Math.trunc(limit), 1), MAX_RAIL_PRODUCTS);

  const { data: links, error: linkError } = await supabase
    .from('collection_products')
    .select(`sort_order, products ( ${PRODUCT_SELECT} )`)
    .eq('collection_id', collection.id)
    .order('sort_order')
    // Bound the join itself, so a large collection does not return everything
    // before the outer limit is applied.
    .limit(bounded);

  if (linkError) throw linkError;

  const raws = (links ?? [])
    .map((link) => link.products as unknown as RawProduct | null)
    // RLS already hides unpublished products from the join, but a null is
    // still possible if a row was removed between the two statements.
    .filter((product): product is RawProduct => product !== null)
    .slice(0, bounded);

  if (raws.length === 0) return [];

  const { data: availability, error: availabilityError } = await supabase.rpc(
    'product_availability',
    { p_product_ids: raws.map((product) => product.id) },
  );

  if (availabilityError) throw availabilityError;

  const availableById = new Map(
    (availability ?? []).map((row) => [row.product_id, row.is_available]),
  );

  return raws.map((raw) => toProductRow(raw, availableById.get(raw.id) ?? false));
}

/**
 * Active brands with the count of published products each.
 *
 * The count comes from a database aggregate, so the storefront never reads the
 * catalogue to display a number.
 */
export async function fetchBrandsWithCounts(): Promise<{
  brands: BrandRow[];
  publishedCountByBrand: Record<string, number>;
}> {
  const supabase = await createSupabaseServerClient();

  const [brandsResult, countsResult] = await Promise.all([
    supabase.from('brands').select('id, name, slug').order('sort_order'),
    supabase.rpc('published_product_counts'),
  ]);

  if (brandsResult.error) throw brandsResult.error;
  if (countsResult.error) throw countsResult.error;

  const publishedCountByBrand: Record<string, number> = {};
  for (const row of countsResult.data ?? []) {
    if (row.brand_id) publishedCountByBrand[row.brand_id] = Number(row.product_count);
  }

  return { brands: (brandsResult.data ?? []) as BrandRow[], publishedCountByBrand };
}

/** Active model families, used only to name a brand's families on its tile. */
export async function fetchModelNames(): Promise<ModelRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('models')
    .select('id, brand_id, name')
    .order('sort_order');

  if (error) throw error;
  return (data ?? []) as ModelRow[];
}

/**
 * Published testimonials.
 *
 * RLS returns only `is_published` rows. There is no fixture and no fallback: if
 * this returns nothing, the section does not render. Inventing a customer
 * review is the one thing this page must never do.
 */
export async function fetchTestimonials(): Promise<TestimonialRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('testimonials')
    .select('id, quote, author, location, rating')
    .order('sort_order')
    .limit(12);

  if (error) throw error;
  return (data ?? []) as TestimonialRow[];
}

/**
 * The rails the homepage needs, each fetched with its own bounded limit.
 *
 * `sections` is passed in so this reads the same rows the assembly will use,
 * rather than issuing a second query for the same data.
 */
export async function fetchRailProducts(
  sections: HomepageSectionRow[],
): Promise<Record<string, ProductRow[]>> {
  const railKeys = ['featured_collection', 'new_arrivals'];
  const rails = sections.filter((section) => railKeys.includes(section.section_key));

  const results = await Promise.all(
    rails.map(async (section) => {
      const slug = sectionSetting(section.settings, 'collection_slug');
      if (!slug) return [section.section_key, [] as ProductRow[]] as const;

      const products = await fetchCollectionProducts(slug, sectionLimit(section.settings));
      return [section.section_key, products] as const;
    }),
  );

  return Object.fromEntries(results);
}

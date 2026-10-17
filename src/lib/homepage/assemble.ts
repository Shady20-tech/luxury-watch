import type {
  BrandTile,
  CopySection,
  HeroSlide,
  HomeCta,
  HomepageContent,
  ProductCard,
  ProductRail,
  Testimonial,
  TrustItem,
} from './types';

/**
 * Turn homepage rows into view models.
 *
 * This module is pure: it takes plain rows and returns plain objects. No
 * database client, no `next/headers`, no environment access. That is what makes
 * the composition logic testable without a database, and it is the same
 * boundary `lib/navigation/assemble.ts` draws for the chrome.
 *
 * -----------------------------------------------------------------------------
 * THE SECTION-KEY CONTRACT
 * -----------------------------------------------------------------------------
 *
 * `homepage_sections.section_key` is the switch. Two shapes exist:
 *
 *   * A **numbered group** — `hero_1`, `hero_2`, `trust_1` … — renders as one
 *     repeated group, ordered by `sort_order`. One row is one editable slide or
 *     value proposition, which is far easier to edit in an admin table than a
 *     JSON array would be.
 *   * A **singular section** — `brand_story`, `final_cta` … — renders once.
 *
 * A key with no matching section is simply not rendered. That is how a section
 * is switched off, and it is why an unknown key is ignored rather than
 * throwing: a content editor adding a row we do not yet render must not break
 * the page.
 */

/** A `homepage_sections` row, as selected from the database. */
export type HomepageSectionRow = {
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

/** A `brands` row. */
export type BrandRow = {
  id: string;
  name: string;
  slug: string;
};

/** A `models` row, used only to name a brand's families. */
export type ModelRow = {
  id: string;
  brand_id: string;
  name: string;
};

/**
 * A product row joined with its brand, plus availability.
 *
 * `available` comes from `product_availability`, not from a stock column, and
 * is `null` when the function returned no row — which happens for a product
 * that is not published. The assembly treats `null` as unavailable rather than
 * guessing, so a bug in the query cannot make an unavailable watch look
 * buyable.
 */
export type ProductRow = {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  price_cents: number | null;
  currency: string;
  price_on_request: boolean;
  condition: ProductCard['condition'];
  reference_number: string | null;
  production_year: number | null;
  case_size_mm: number | null;
  movement: string | null;
  dial_color: string | null;
  published_at: string | null;
  brand_name: string | null;
  image_url: string | null;
  image_alt: string | null;
  available: boolean | null;
};

/** A `testimonials` row. */
export type TestimonialRow = {
  id: string;
  quote: string;
  author: string;
  location: string | null;
  rating: number | null;
};

export type AssembleHomepageInput = {
  sections: HomepageSectionRow[];
  productsBySection: Record<string, ProductRow[]>;
  brands: BrandRow[];
  models: ModelRow[];
  publishedCountByBrand: Record<string, number>;
  testimonials: TestimonialRow[];
  /** ISO timestamp used to decide the "New" badge. Injected for determinism. */
  now: string;
};

/** Products published within this window carry a "New" badge. */
export const NEW_ARRIVAL_WINDOW_DAYS = 45;

/**
 * Upper bound on products in any one rail.
 *
 * The homepage must never ask for the whole catalogue. A section's
 * `settings.limit` can lower this but never raise it, so a mis-edited row
 * cannot turn the homepage into a 4,000-row query.
 */
export const MAX_RAIL_PRODUCTS = 8;

const HERO_PREFIX = 'hero_';
const TRUST_PREFIX = 'trust_';

/** Read `settings.limit`, clamped. Returns `fallback` when unset or invalid. */
function readLimit(settings: unknown, fallback = 4): number {
  if (typeof settings !== 'object' || settings === null) return fallback;
  const raw = (settings as Record<string, unknown>).limit;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.trunc(raw), 1), MAX_RAIL_PRODUCTS);
}

/** Read a string field from `settings`, or `null`. */
function readSettingString(settings: unknown, key: string): string | null {
  if (typeof settings !== 'object' || settings === null) return null;
  const raw = (settings as Record<string, unknown>)[key];
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null;
}

function readEyebrow(settings: unknown): string | null {
  return readSettingString(settings, 'eyebrow');
}

/**
 * Build a CTA only when both halves are present.
 *
 * A label without a destination is a dead button, and the schema's
 * `homepage_sections_cta_safe` check already rejects an unsafe href. Returning
 * `null` here means the renderer omits the button entirely rather than
 * emitting an anchor with no `href`.
 */
function readCta(row: Pick<HomepageSectionRow, 'cta_label' | 'cta_href'>): HomeCta | null {
  const label = row.cta_label?.trim();
  const href = row.cta_href?.trim();
  if (!label || !href) return null;
  return { label, href };
}

/** Format a price for display. Returns `null` for a price-on-request piece. */
export function formatPrice(
  priceCents: number | null,
  currency: string,
  priceOnRequest: boolean,
): string | null {
  // The schema enforces `price_on_request` implies a null price, but the card
  // must not print "0.00" if that invariant is ever violated, so both are
  // checked.
  if (priceOnRequest || priceCents === null) return null;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    // Whole units only: watch prices are not quoted to the cent.
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

/**
 * A short factual line for a card.
 *
 * `short_description` is preferred. The seed leaves it null (the reference
 * site's marketing prose was deliberately not copied), so the fallback composes
 * a line from attributes the catalogue genuinely holds — reference, case size,
 * movement, dial. When there is nothing factual to say, it returns `null` and
 * the card omits the line rather than inventing filler.
 */
export function composeSummary(row: ProductRow): string | null {
  if (row.short_description?.trim()) return row.short_description.trim();

  const parts: string[] = [];
  if (row.reference_number) parts.push(`Ref. ${row.reference_number}`);
  if (row.production_year) parts.push(String(row.production_year));
  if (row.case_size_mm !== null) parts.push(`${Number(row.case_size_mm)} mm`);
  if (row.movement) parts.push(row.movement);
  if (row.dial_color) parts.push(`${row.dial_color} dial`);

  return parts.length > 0 ? parts.join(' · ') : null;
}

/** True when `publishedAt` is within the new-arrival window of `now`. */
export function isNewArrival(publishedAt: string | null, now: string): boolean {
  if (!publishedAt) return false;
  const published = Date.parse(publishedAt);
  const reference = Date.parse(now);
  if (Number.isNaN(published) || Number.isNaN(reference)) return false;

  const windowMs = NEW_ARRIVAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const age = reference - published;
  // A future timestamp is treated as new rather than as an error: a scheduled
  // publish would otherwise silently lose its badge.
  return age <= windowMs;
}

/**
 * An accessible alt for a product image.
 *
 * The `product_images.alt_text` column is `not null`, so a stored value is
 * preferred. The fallback names the product rather than leaving the attribute
 * empty, because an empty alt tells a screen-reader user nothing while a
 * decorative alt would hide a meaningful image.
 */
function productAlt(row: ProductRow): string {
  return row.image_alt?.trim() || row.title;
}

export function toProductCard(row: ProductRow, now: string): ProductCard {
  return {
    id: row.id,
    slug: row.slug,
    href: `/products/${row.slug}`,
    title: row.title,
    brandName: row.brand_name,
    summary: composeSummary(row),
    imageUrl: row.image_url,
    imageAlt: productAlt(row),
    price: formatPrice(row.price_cents, row.currency, row.price_on_request),
    condition: row.condition,
    // `null` means the availability function returned no row for this product,
    // which only happens when it is not published. Treating that as unavailable
    // is the safe direction.
    available: row.available === true,
    isNew: isNewArrival(row.published_at, now),
  };
}

function toCopySection(row: HomepageSectionRow): CopySection {
  return {
    id: row.id,
    eyebrow: readEyebrow(row.settings) ?? row.subtitle,
    title: row.title ?? '',
    body: row.body,
    cta: readCta(row),
    imageUrl: row.image_url,
  };
}

function toRail(row: HomepageSectionRow, products: ProductRow[], now: string): ProductRail {
  const limit = readLimit(row.settings);
  return {
    id: row.id,
    eyebrow: readEyebrow(row.settings) ?? row.subtitle,
    title: row.title ?? '',
    body: row.body,
    cta: readCta(row),
    collectionSlug: readSettingString(row.settings, 'collection_slug'),
    // The repository already bounded the query; slicing again keeps the
    // guarantee local to the assembly so a caller cannot bypass it.
    products: products.slice(0, limit).map((product) => toProductCard(product, now)),
  };
}

export function assembleHomepage(input: AssembleHomepageInput): HomepageContent {
  const { sections, productsBySection, brands, models, publishedCountByBrand, testimonials, now } =
    input;

  // Sections arrive already ordered by `sort_order`; sorting again here would
  // hide a repository ordering bug rather than surface it, so the order is
  // trusted and asserted in the repository's own test.
  const byKey = new Map(sections.map((section) => [section.section_key, section]));
  const group = (prefix: string) =>
    sections.filter((section) => section.section_key.startsWith(prefix));

  const hero: HeroSlide[] = group(HERO_PREFIX).map((row) => ({
    id: row.id,
    eyebrow: readEyebrow(row.settings) ?? row.subtitle,
    title: row.title ?? '',
    body: row.body,
    cta: readCta(row),
    imageUrl: row.image_url,
    // A hero image is decorative when the headline beside it carries the
    // meaning, but it is still the subject of the slide, so the alt names the
    // slide rather than being empty.
    imageAlt: row.image_url ? (row.title ?? '') : '',
  }));

  const trust: TrustItem[] = group(TRUST_PREFIX).map((row) => ({
    id: row.id,
    title: row.title ?? '',
    body: row.body,
    label: row.subtitle,
  }));

  const brandTiles: BrandTile[] = brands.map((brand) => ({
    id: brand.id,
    name: brand.name,
    slug: brand.slug,
    href: `/brands/${brand.slug}`,
    productCount: publishedCountByBrand[brand.id] ?? null,
    modelNames: models
      .filter((model) => model.brand_id === brand.id)
      .slice(0, 3)
      .map((model) => model.name),
  }));

  const testimonialModels: Testimonial[] = testimonials.map((row) => ({
    id: row.id,
    quote: row.quote,
    author: row.author,
    location: row.location,
    rating: row.rating,
  }));

  const featuredRow = byKey.get('featured_collection');
  const newArrivalsRow = byKey.get('new_arrivals');

  return {
    hero,
    brandShowcase: byKey.has('brand_showcase') ? toCopySection(byKey.get('brand_showcase')!) : null,
    featured: featuredRow
      ? toRail(featuredRow, productsBySection[featuredRow.section_key] ?? [], now)
      : null,
    brandStory: byKey.has('brand_story') ? toCopySection(byKey.get('brand_story')!) : null,
    newArrivals: newArrivalsRow
      ? toRail(newArrivalsRow, productsBySection[newArrivalsRow.section_key] ?? [], now)
      : null,
    browseBrands: byKey.has('browse_brands') ? toCopySection(byKey.get('browse_brands')!) : null,
    sellTradeCta: byKey.has('sell_trade_cta') ? toCopySection(byKey.get('sell_trade_cta')!) : null,
    sourcingCta: byKey.has('sourcing_cta') ? toCopySection(byKey.get('sourcing_cta')!) : null,
    trust,
    testimonialsSection: byKey.has('testimonials')
      ? toCopySection(byKey.get('testimonials')!)
      : null,
    testimonials: testimonialModels,
    newsletter: byKey.has('newsletter') ? toCopySection(byKey.get('newsletter')!) : null,
    finalCta: byKey.has('final_cta') ? toCopySection(byKey.get('final_cta')!) : null,
    brands: brandTiles,
    source: 'database',
  };
}

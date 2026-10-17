/**
 * Homepage view models.
 *
 * These types are the contract between the database and the homepage
 * components, mirroring the approach in `lib/navigation/types.ts`: they are not
 * the row types from `database.types.ts`. A component must be renderable from a
 * fixture in a test without a database, and it must not know about
 * `sort_order`, `is_active` or `section_key`.
 *
 * `lib/homepage/assemble.ts` is the only place that turns rows into these
 * shapes.
 */

/** A call to action. `href` is always a site-relative path or an https URL. */
export type HomeCta = {
  label: string;
  href: string;
};

/** One hero slide. */
export type HeroSlide = {
  id: string;
  /** Small line above the headline, for example "Watch sourcing". */
  eyebrow: string | null;
  title: string;
  body: string | null;
  cta: HomeCta | null;
  imageUrl: string | null;
  imageAlt: string;
};

/**
 * A product as a card renders it.
 *
 * `price` is `null` when the piece is priced on request, which is the norm for
 * this catalogue. The card must render "Request pricing & availability" in that
 * case rather than a number, and the type makes the null case impossible to
 * overlook.
 */
export type ProductCard = {
  id: string;
  slug: string;
  href: string;
  title: string;
  brandName: string | null;
  /** Short factual description, or a composed spec line when none is set. */
  summary: string | null;
  imageUrl: string | null;
  imageAlt: string;
  /** Formatted price, or `null` when priced on request. */
  price: string | null;
  condition: 'new' | 'unworn' | 'pre_owned' | 'vintage' | null;
  /** From the availability function. `false` renders a "Reserved" badge. */
  available: boolean;
  /** True when published recently enough to carry a "New" badge. */
  isNew: boolean;
};

/** A brand tile in the brand showcase. */
export type BrandTile = {
  id: string;
  name: string;
  slug: string;
  href: string;
  /** Number of published products, when known. */
  productCount: number | null;
  /** A few model family names, for a quiet secondary line. */
  modelNames: string[];
};

/** A testimonial. Only ever built from a published `testimonials` row. */
export type Testimonial = {
  id: string;
  quote: string;
  author: string;
  location: string | null;
  rating: number | null;
};

/** A trust / value-proposition item. */
export type TrustItem = {
  id: string;
  title: string;
  body: string | null;
  /** Short label shown above the title, for example "Authenticity". */
  label: string | null;
};

/** A heading-and-copy section (brand story, CTA blocks, final CTA). */
export type CopySection = {
  id: string;
  eyebrow: string | null;
  title: string;
  body: string | null;
  cta: HomeCta | null;
  imageUrl: string | null;
};

/**
 * A product rail backed by a real collection.
 *
 * `collectionSlug` is recorded so the "view all" link and an honest empty state
 * can both name the collection that produced no products.
 */
export type ProductRail = {
  id: string;
  eyebrow: string | null;
  title: string;
  body: string | null;
  cta: HomeCta | null;
  collectionSlug: string | null;
  products: ProductCard[];
};

/** Everything the homepage renders, in display order. */
export type HomepageContent = {
  /** Hero slides. Empty means no hero is rendered at all. */
  hero: HeroSlide[];
  brandShowcase: CopySection | null;
  featured: ProductRail | null;
  brandStory: CopySection | null;
  newArrivals: ProductRail | null;
  browseBrands: CopySection | null;
  sellTradeCta: CopySection | null;
  sourcingCta: CopySection | null;
  trust: TrustItem[];
  /** The testimonials heading, shown only when `testimonials` is non-empty. */
  testimonialsSection: CopySection | null;
  testimonials: Testimonial[];
  newsletter: CopySection | null;
  finalCta: CopySection | null;
  brands: BrandTile[];
  /**
   * True when the composition came from the database. False means the built-in
   * fallback was used because Supabase is unconfigured or unreachable, which the
   * page states plainly rather than presenting a fixture as live content.
   */
  source: 'database' | 'fallback';
};

/**
 * An empty composition.
 *
 * Every section is absent rather than filled with invented copy. The homepage
 * renders its own honest empty state from this, so a database with no
 * `homepage_sections` rows produces a page that explains itself instead of a
 * blank screen or a fabricated storefront.
 *
 * There is deliberately no code-side fixture of editorial copy. The chrome has
 * one because a header with no links is unusable, but duplicating seventeen
 * sections of marketing copy into TypeScript would guarantee that it drifts
 * from the seeded content the admin edits. When Supabase is unconfigured, the
 * homepage says so.
 */
export function emptyHomepage(source: HomepageContent['source']): HomepageContent {
  return {
    hero: [],
    brandShowcase: null,
    featured: null,
    brandStory: null,
    newArrivals: null,
    browseBrands: null,
    sellTradeCta: null,
    sourcingCta: null,
    trust: [],
    testimonialsSection: null,
    testimonials: [],
    newsletter: null,
    finalCta: null,
    brands: [],
    source,
  };
}

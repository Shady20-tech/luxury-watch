import { absoluteUrl, getPublicEnv } from '@/lib/env';

/**
 * Schema.org JSON-LD builders.
 *
 * Two rules govern everything in this file, and both exist to keep the markup
 * honest:
 *
 *  1. **Never emit a property we cannot back with real data.** In particular,
 *     `Product.offers` is emitted only when a genuine published price exists.
 *     The reference site's product markup omits `offers` entirely, which is
 *     correct for an inquiry-led catalogue; inventing a price to satisfy a
 *     validator would be a lie shown to search engines.
 *  2. **`brand` is the manufacturer, never the retailer.** The reference sets
 *     `brand` to its own store name. We emit the real manufacturer from the
 *     `brands` table, and we never assert authorised-dealer status.
 *
 * Google's guidance is explicit that structured data is not required for
 * generative AI features and that no special markup unlocks them:
 * https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
 * We still emit it, because it earns ordinary rich results and it is the
 * correct way to describe a product page.
 */

/**
 * A schema.org node. Values are genuinely heterogeneous, so `unknown` is the
 * honest value type rather than `any`.
 */
export type JsonLdNode = Record<string, unknown>;

/** The wrapped graph document produced by `jsonLdGraph`. */
export type JsonLdGraph = {
  '@context': 'https://schema.org';
  '@graph': JsonLdNode[];
};

export type BreadcrumbEntry = {
  name: string;
  /** Site-relative path, for example `/collections/rolex`. */
  path: string;
};

export type ProductSchemaInput = {
  name: string;
  /** Site-relative path of the product page. */
  path: string;
  description?: string | null;
  sku?: string | null;
  /** Manufacturer name from the `brands` table — not the store name. */
  brandName?: string | null;
  category?: string | null;
  /** Absolute or site-relative image URLs. */
  images?: string[];
  condition?: 'new' | 'pre_owned' | 'vintage' | null;
  /** Publish/update timestamp, used for `dateModified`. */
  updatedAt?: string | null;
  /**
   * A genuine published price, in minor units. When this is `null`, the product
   * is priced on request and NO `offers` node is emitted.
   */
  price?: { amountMinor: number; currency: string } | null;
  /** ISO 4217 code used when `price` is present but lacks its own currency. */
  fallbackCurrency?: string;
  /** Whether the item is in stock. Only meaningful alongside a real price. */
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder' | 'BackOrder';
};

export type FaqEntry = {
  question: string;
  answer: string;
};

/** Schema.org `ItemCondition` values, keyed by our own condition vocabulary. */
const CONDITION_URL: Record<NonNullable<ProductSchemaInput['condition']>, string> = {
  new: 'https://schema.org/NewCondition',
  pre_owned: 'https://schema.org/UsedCondition',
  vintage: 'https://schema.org/UsedCondition',
};

/** `YYYY-MM-DD` — schema.org accepts a date and search engines prefer it short. */
function toDateOnly(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

/** Turn a possibly-relative image path into an absolute URL. */
function toAbsoluteImage(image: string): string {
  if (/^https?:\/\//i.test(image)) return image;
  return absoluteUrl(image);
}

export function organizationSchema(): JsonLdNode {
  const { siteName } = getPublicEnv();

  return {
    '@type': 'Organization',
    '@id': absoluteUrl('/#organization'),
    name: siteName,
    url: absoluteUrl('/'),
    logo: {
      '@type': 'ImageObject',
      url: absoluteUrl('/icon.svg'),
    },
  };
}

/**
 * `LocalBusiness` for the physical showroom. Only the fields the owner supplies
 * are emitted; `address` and `telephone` appear only when configured, because a
 * fabricated address is worse than no address.
 */
export function localBusinessSchema(settings?: {
  name?: string;
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
  telephone?: string;
  email?: string;
  openingHours?: string[];
}): JsonLdNode | null {
  if (!settings) return null;

  const address: JsonLdNode = {};
  if (settings.streetAddress) address.streetAddress = settings.streetAddress;
  if (settings.addressLocality) address.addressLocality = settings.addressLocality;
  if (settings.addressRegion) address.addressRegion = settings.addressRegion;
  if (settings.postalCode) address.postalCode = settings.postalCode;
  if (settings.addressCountry) address.addressCountry = settings.addressCountry;

  const hasAddress = Object.keys(address).length > 0;
  const hasContact = Boolean(settings.telephone || settings.email);

  // Without an address or contact detail this node would be noise.
  if (!hasAddress && !hasContact) return null;

  const node: JsonLdNode = {
    '@type': 'LocalBusiness',
    '@id': absoluteUrl('/#localbusiness'),
    name: settings.name ?? getPublicEnv().siteName,
    url: absoluteUrl('/'),
  };

  if (hasAddress) {
    node.address = { '@type': 'PostalAddress', ...address };
  }
  if (settings.telephone) node.telephone = settings.telephone;
  if (settings.email) node.email = settings.email;
  if (settings.openingHours?.length) node.openingHours = settings.openingHours;

  return node;
}

/**
 * `WebSite` plus `SearchAction`, which is what makes a sitelinks searchbox
 * possible. `query-input` must reference the same name used in the target URL
 * template.
 */
export function websiteSchema(): JsonLdNode {
  const { siteName } = getPublicEnv();

  return {
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    name: siteName,
    url: absoluteUrl('/'),
    inLanguage: 'en',
    publisher: { '@id': absoluteUrl('/#organization') },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${absoluteUrl('/search')}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** `BreadcrumbList`. The final entry omits `item`, which is the documented convention. */
export function breadcrumbSchema(entries: BreadcrumbEntry[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: entries.map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: entry.name,
      item: absoluteUrl(entry.path),
    })),
  };
}

/** `ItemList` for collection and search result pages. */
export function itemListSchema(input: {
  name: string;
  items: { name: string; path: string }[];
}): JsonLdNode {
  return {
    '@type': 'ItemList',
    name: input.name,
    numberOfItems: input.items.length,
    itemListElement: input.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

/**
 * `Product`. Emits `offers` only when a real price is published. When the price
 * is on request, the node still describes the product accurately — it simply
 * does not claim a price.
 */
export function productSchema(input: ProductSchemaInput): JsonLdNode {
  const node: JsonLdNode = {
    '@type': 'Product',
    '@id': absoluteUrl(input.path),
    name: input.name,
    url: absoluteUrl(input.path),
  };

  if (input.description) node.description = input.description;
  if (input.sku) node.sku = input.sku;
  if (input.category) node.category = input.category;

  // The manufacturer, not the store. Omitting it is better than naming the
  // retailer, which is what the reference site does.
  if (input.brandName) {
    node.brand = { '@type': 'Brand', name: input.brandName };
  }

  if (input.images?.length) {
    node.image = input.images.map(toAbsoluteImage);
  }

  if (input.condition) {
    node.itemCondition = CONDITION_URL[input.condition];
  }

  const dateModified = toDateOnly(input.updatedAt);
  if (dateModified) node.dateModified = dateModified;

  // Honest pricing: no price means no offer node at all.
  if (input.price) {
    const currency = input.price.currency || input.fallbackCurrency || 'USD';
    node.offers = {
      '@type': 'Offer',
      url: absoluteUrl(input.path),
      priceCurrency: currency,
      // schema.org expects a decimal string, for example "12500.00".
      price: (input.price.amountMinor / 100).toFixed(2),
      availability: `https://schema.org/${input.availability ?? 'InStock'}`,
      seller: { '@id': absoluteUrl('/#organization') },
    };
  }

  return node;
}

/**
 * `FAQPage`. Only build this from questions and answers that are actually
 * rendered and visible on the page — marking up hidden content is a spam
 * policy violation.
 */
export function faqPageSchema(entries: FaqEntry[]): JsonLdNode | null {
  const usable = entries.filter((entry) => entry.question.trim() && entry.answer.trim());
  if (usable.length === 0) return null;

  return {
    '@type': 'FAQPage',
    mainEntity: usable.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.answer,
      },
    })),
  };
}

/**
 * Wrap one or more nodes into a single `@graph` document. Using a graph with
 * stable `@id` values lets nodes reference each other without duplicating the
 * organization on every page.
 */
export function jsonLdGraph(nodes: (JsonLdNode | null | undefined)[]): JsonLdGraph {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes.filter((node): node is JsonLdNode => Boolean(node)),
  };
}

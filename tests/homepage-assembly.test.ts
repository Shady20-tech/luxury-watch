import { describe, expect, it } from 'vitest';

import {
  assembleHomepage,
  composeSummary,
  formatPrice,
  isNewArrival,
  MAX_RAIL_PRODUCTS,
  NEW_ARRIVAL_WINDOW_DAYS,
  toProductCard,
  type HomepageSectionRow,
  type ProductRow,
} from '@/lib/homepage/assemble';

/**
 * Homepage assembly tests.
 *
 * The assembly is the only place rows become view models, so it is where the
 * honesty rules of this phase are actually enforced. These tests pin the ones
 * that matter:
 *
 *  - a price is never invented for a price-on-request piece,
 *  - availability is never assumed when the database did not say so,
 *  - a section with no row is absent rather than filled with placeholder copy,
 *  - a rail is bounded even when the section asks for more.
 *
 * The project runs with `noUncheckedIndexedAccess`, so `at()` is used instead of
 * `[0]` and the assertions stay honest about an empty result being possible.
 */

const NOW = '2026-06-01T00:00:00.000Z';

const section = (
  over: Partial<HomepageSectionRow> & { section_key: string },
): HomepageSectionRow => ({
  id: `id-${over.section_key}`,
  title: 'A title',
  subtitle: null,
  body: null,
  cta_label: null,
  cta_href: null,
  image_url: null,
  settings: {},
  sort_order: 10,
  ...over,
});

const product = (over: Partial<ProductRow> & { id: string }): ProductRow => ({
  slug: 'a-watch',
  title: 'A watch',
  short_description: null,
  price_cents: null,
  currency: 'GBP',
  price_on_request: true,
  condition: 'new',
  reference_number: null,
  production_year: null,
  case_size_mm: null,
  movement: null,
  dial_color: null,
  case_material: null,
  published_at: NOW,
  brand_name: 'Rolex',
  image_url: null,
  image_alt: null,
  available: true,
  ...over,
});

const emptyInput = {
  sections: [] as HomepageSectionRow[],
  productsBySection: {} as Record<string, ProductRow[]>,
  brands: [],
  models: [],
  publishedCountByBrand: {} as Record<string, number>,
  testimonials: [],
  now: NOW,
};

describe('formatPrice', () => {
  it('returns null when the piece is priced on request', () => {
    expect(formatPrice(1250000, 'GBP', true)).toBeNull();
  });

  it('returns null when there is no price, even if the flag is wrong', () => {
    // The schema makes this state unreachable, but a card that printed
    // "£0.00" because of a data bug would be worse than one that prints
    // nothing, so the guard is deliberate.
    expect(formatPrice(null, 'GBP', false)).toBeNull();
  });

  it('formats a real price in whole units', () => {
    expect(formatPrice(1250000, 'GBP', false)).toBe('£12,500');
  });
});

describe('composeSummary', () => {
  it('prefers a stored short description', () => {
    expect(composeSummary(product({ id: 'p', short_description: 'Mint condition' }))).toBe(
      'Mint condition',
    );
  });

  it('composes a factual line from attributes when there is no description', () => {
    const summary = composeSummary(
      product({
        id: 'p',
        reference_number: '116400',
        case_size_mm: 40,
        movement: 'Automatic',
        dial_color: 'White',
      }),
    );
    expect(summary).toBe('Ref. 116400 · 40 mm · Automatic · White dial');
  });

  it('returns null rather than filler when there is nothing factual to say', () => {
    expect(composeSummary(product({ id: 'p' }))).toBeNull();
  });
});

describe('isNewArrival', () => {
  it('treats a recently published piece as new', () => {
    expect(isNewArrival('2026-05-30T00:00:00.000Z', NOW)).toBe(true);
  });

  it('treats an older piece as not new', () => {
    const old = new Date(Date.parse(NOW) - (NEW_ARRIVAL_WINDOW_DAYS + 1) * 86400000).toISOString();
    expect(isNewArrival(old, NOW)).toBe(false);
  });

  it('treats a scheduled future publish as new, not as an error', () => {
    expect(isNewArrival('2026-06-02T00:00:00.000Z', NOW)).toBe(true);
  });

  it('is false for a product with no publish date', () => {
    expect(isNewArrival(null, NOW)).toBe(false);
  });

  it('is false for an unparseable date rather than throwing', () => {
    expect(isNewArrival('not-a-date', NOW)).toBe(false);
  });
});

describe('toProductCard', () => {
  it('never reports a price for a price-on-request piece', () => {
    const card = toProductCard(product({ id: 'p', price_cents: 999999 }), NOW);
    expect(card.price).toBeNull();
  });

  it('treats a missing availability answer as unavailable', () => {
    // `null` is what the repository passes when the availability function
    // returned no row. Guessing "available" here would let an unpublished or
    // unreserved piece look buyable.
    const card = toProductCard(product({ id: 'p', available: null }), NOW);
    expect(card.available).toBe(false);
  });

  it('falls back to the product title when there is no alt text', () => {
    const card = toProductCard(product({ id: 'p', title: 'Milgauss 116400' }), NOW);
    expect(card.imageAlt).toBe('Milgauss 116400');
  });

  it('builds a product href from the slug', () => {
    const card = toProductCard(product({ id: 'p', slug: 'rolex-milgauss' }), NOW);
    expect(card.href).toBe('/products/rolex-milgauss');
  });
});

describe('assembleHomepage', () => {
  it('returns an empty composition for no rows, inventing nothing', () => {
    const home = assembleHomepage(emptyInput);
    expect(home.hero).toEqual([]);
    expect(home.featured).toBeNull();
    expect(home.trust).toEqual([]);
    expect(home.brands).toEqual([]);
    expect(home.source).toBe('database');
  });

  it('orders hero slides by the order they were given', () => {
    const home = assembleHomepage({
      ...emptyInput,
      sections: [
        section({ section_key: 'hero_1', title: 'First' }),
        section({ section_key: 'hero_2', title: 'Second' }),
      ],
    });
    expect(home.hero.map((slide) => slide.title)).toEqual(['First', 'Second']);
  });

  it('reads an eyebrow from settings and falls back to the subtitle', () => {
    const home = assembleHomepage({
      ...emptyInput,
      sections: [
        section({ section_key: 'hero_1', subtitle: 'From subtitle' }),
        section({
          section_key: 'hero_2',
          subtitle: 'Ignored',
          settings: { eyebrow: 'From settings' },
        }),
      ],
    });
    expect(home.hero.at(0)?.eyebrow).toBe('From subtitle');
    expect(home.hero.at(1)?.eyebrow).toBe('From settings');
  });

  it('drops a call to action that has only half of itself', () => {
    const home = assembleHomepage({
      ...emptyInput,
      sections: [section({ section_key: 'hero_1', cta_label: 'Browse' })],
    });
    expect(home.hero.at(0)?.cta).toBeNull();
  });

  it('builds a CTA when both label and href are present', () => {
    const home = assembleHomepage({
      ...emptyInput,
      sections: [
        section({ section_key: 'hero_1', cta_label: 'Browse', cta_href: '/collections/all' }),
      ],
    });
    expect(home.hero.at(0)?.cta).toEqual({ label: 'Browse', href: '/collections/all' });
  });

  it('ignores a section key it does not render', () => {
    const home = assembleHomepage({
      ...emptyInput,
      sections: [section({ section_key: 'not_a_real_section', title: 'Ignore me' })],
    });
    // The row is not rendered anywhere, and it does not throw.
    expect(home.hero).toEqual([]);
    expect(home.featured).toBeNull();
  });

  it('leaves a singular section null when it has no row', () => {
    const home = assembleHomepage(emptyInput);
    expect(home.brandStory).toBeNull();
    expect(home.finalCta).toBeNull();
  });

  it('builds a singular section when its row exists', () => {
    const home = assembleHomepage({
      ...emptyInput,
      sections: [section({ section_key: 'final_cta', title: 'Any questions?' })],
    });
    expect(home.finalCta?.title).toBe('Any questions?');
  });

  it('caps a rail at MAX_RAIL_PRODUCTS even when the section asks for more', () => {
    const many = Array.from({ length: MAX_RAIL_PRODUCTS + 6 }, (_, index) =>
      product({ id: `p${index}` }),
    );
    const home = assembleHomepage({
      ...emptyInput,
      sections: [
        section({
          section_key: 'featured_collection',
          settings: { collection_slug: 'featured', limit: 100 },
        }),
      ],
      productsBySection: { featured_collection: many },
    });
    expect(home.featured?.products).toHaveLength(MAX_RAIL_PRODUCTS);
  });

  it('honours a smaller limit from the section settings', () => {
    const many = Array.from({ length: 6 }, (_, index) => product({ id: `p${index}` }));
    const home = assembleHomepage({
      ...emptyInput,
      sections: [
        section({
          section_key: 'featured_collection',
          settings: { collection_slug: 'featured', limit: 2 },
        }),
      ],
      productsBySection: { featured_collection: many },
    });
    expect(home.featured?.products).toHaveLength(2);
  });

  it('keeps a rail with no products rather than dropping it', () => {
    // The page needs to know the section was configured so it can say so
    // honestly, rather than silently rendering nothing.
    const home = assembleHomepage({
      ...emptyInput,
      sections: [
        section({ section_key: 'new_arrivals', settings: { collection_slug: 'new-arrivals' } }),
      ],
      productsBySection: { new_arrivals: [] },
    });
    expect(home.newArrivals).not.toBeNull();
    expect(home.newArrivals?.products).toEqual([]);
    expect(home.newArrivals?.collectionSlug).toBe('new-arrivals');
  });

  it('builds a brand tile with a count and its model families', () => {
    const home = assembleHomepage({
      ...emptyInput,
      brands: [{ id: 'b1', name: 'Rolex', slug: 'rolex' }],
      models: [
        { id: 'm1', brand_id: 'b1', name: 'Milgauss' },
        { id: 'm2', brand_id: 'b1', name: 'Submariner' },
        { id: 'm3', brand_id: 'other', name: 'Not Rolex' },
      ],
      publishedCountByBrand: { b1: 12 },
    });

    const tile = home.brands.at(0);
    expect(tile?.href).toBe('/brands/rolex');
    expect(tile?.productCount).toBe(12);
    expect(tile?.modelNames).toEqual(['Milgauss', 'Submariner']);
  });

  it('reports an unknown brand count as null rather than zero', () => {
    const home = assembleHomepage({
      ...emptyInput,
      brands: [{ id: 'b1', name: 'Rolex', slug: 'rolex' }],
    });
    expect(home.brands.at(0)?.productCount).toBeNull();
  });

  it('passes real testimonials through and leaves the list empty when there are none', () => {
    const home = assembleHomepage(emptyInput);
    expect(home.testimonials).toEqual([]);

    const withOne = assembleHomepage({
      ...emptyInput,
      testimonials: [
        { id: 't1', quote: 'Great service', author: 'A Client', location: 'London', rating: 5 },
      ],
    });
    expect(withOne.testimonials.at(0)?.author).toBe('A Client');
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetPublicEnvCache } from '@/lib/env';
import {
  breadcrumbSchema,
  faqPageSchema,
  jsonLdGraph,
  organizationSchema,
  productSchema,
  websiteSchema,
} from '@/lib/seo/schema';

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
  process.env.NEXT_PUBLIC_SITE_NAME = 'Example Watches';
  resetPublicEnvCache();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.NEXT_PUBLIC_SITE_NAME;
  resetPublicEnvCache();
});

/**
 * These tests encode the two honesty rules the project committed to: never
 * claim a price that does not exist, and never name the retailer as the
 * manufacturer.
 */
describe('productSchema pricing honesty', () => {
  const base = { name: 'Example Diver', path: '/products/example-diver' };

  it('omits the offers node entirely when the price is on request', () => {
    const schema = productSchema({ ...base, price: null });
    expect(schema).not.toHaveProperty('offers');
  });

  it('omits the offers node when no price argument is supplied', () => {
    const schema = productSchema(base);
    expect(schema).not.toHaveProperty('offers');
  });

  it('emits a valid offers node when a real price exists', () => {
    const schema = productSchema({
      ...base,
      price: { amountMinor: 1250000, currency: 'USD' },
    });

    expect(schema.offers).toMatchObject({
      '@type': 'Offer',
      priceCurrency: 'USD',
      price: '12500.00',
    });
  });

  it('formats the price as a two-decimal string, not a float', () => {
    const schema = productSchema({ ...base, price: { amountMinor: 999, currency: 'USD' } });
    const offers = schema.offers as Record<string, unknown>;
    expect(offers.price).toBe('9.99');
    expect(typeof offers.price).toBe('string');
  });

  it('falls back to the default currency when the price omits one', () => {
    const schema = productSchema({
      ...base,
      price: { amountMinor: 100, currency: '' },
      fallbackCurrency: 'GBP',
    });
    expect((schema.offers as Record<string, unknown>).priceCurrency).toBe('GBP');
  });

  it('defaults availability to InStock only when a price is present', () => {
    const withPrice = productSchema({ ...base, price: { amountMinor: 100, currency: 'USD' } });
    expect((withPrice.offers as Record<string, unknown>).availability).toBe(
      'https://schema.org/InStock',
    );

    const withoutPrice = productSchema(base);
    expect(withoutPrice).not.toHaveProperty('offers');
  });
});

describe('productSchema brand attribution', () => {
  const base = { name: 'Example Diver', path: '/products/example-diver' };

  it('uses the manufacturer supplied by the caller, never the store name', () => {
    const schema = productSchema({ ...base, brandName: 'Rolex' });
    expect(schema.brand).toEqual({ '@type': 'Brand', name: 'Rolex' });
  });

  it('does not fall back to the site name when no manufacturer is known', () => {
    const schema = productSchema(base);
    expect(schema).not.toHaveProperty('brand');
    expect(JSON.stringify(schema)).not.toContain('Example Watches');
  });
});

describe('productSchema other fields', () => {
  const base = { name: 'Example Diver', path: '/products/example-diver' };

  it('maps the condition vocabulary onto schema.org URLs', () => {
    expect(productSchema({ ...base, condition: 'new' }).itemCondition).toBe(
      'https://schema.org/NewCondition',
    );
    expect(productSchema({ ...base, condition: 'pre_owned' }).itemCondition).toBe(
      'https://schema.org/UsedCondition',
    );
  });

  it('emits dateModified as a date only, and drops an unparseable value', () => {
    expect(productSchema({ ...base, updatedAt: '2026-03-04T10:20:30.000Z' }).dateModified).toBe(
      '2026-03-04',
    );
    expect(productSchema({ ...base, updatedAt: 'not-a-date' })).not.toHaveProperty('dateModified');
  });

  it('makes relative image paths absolute', () => {
    const schema = productSchema({ ...base, images: ['/images/watch.jpg'] });
    expect(schema.image).toEqual(['https://example.com/images/watch.jpg']);
  });

  it('leaves already-absolute image URLs untouched', () => {
    const schema = productSchema({
      ...base,
      images: ['https://cdn.example.com/watch.jpg'],
    });
    expect(schema.image).toEqual(['https://cdn.example.com/watch.jpg']);
  });

  it('gives the product node an @id matching its URL', () => {
    const schema = productSchema(base);
    expect(schema['@id']).toBe('https://example.com/products/example-diver');
    expect(schema.url).toBe('https://example.com/products/example-diver');
  });
});

describe('faqPageSchema', () => {
  it('returns null rather than an empty FAQPage when there is nothing to mark up', () => {
    expect(faqPageSchema([])).toBeNull();
    expect(faqPageSchema([{ question: '   ', answer: 'x' }])).toBeNull();
    expect(faqPageSchema([{ question: 'x', answer: '' }])).toBeNull();
  });

  it('drops incomplete entries but keeps the usable ones', () => {
    const schema = faqPageSchema([
      { question: 'Is it authentic?', answer: 'Yes.' },
      { question: 'Empty', answer: '   ' },
    ]);
    expect(schema?.mainEntity).toHaveLength(1);
  });

  it('builds a valid Question and acceptedAnswer pair', () => {
    const schema = faqPageSchema([{ question: 'Do you ship?', answer: 'Yes, worldwide.' }]);
    expect(schema?.mainEntity).toEqual([
      {
        '@type': 'Question',
        name: 'Do you ship?',
        acceptedAnswer: { '@type': 'Answer', text: 'Yes, worldwide.' },
      },
    ]);
  });
});

describe('breadcrumbSchema', () => {
  it('numbers positions from one and makes items absolute', () => {
    const schema = breadcrumbSchema([
      { name: 'Home', path: '/' },
      { name: 'Rolex', path: '/collections/rolex' },
    ]);

    expect(schema.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://example.com/' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Rolex',
        item: 'https://example.com/collections/rolex',
      },
    ]);
  });
});

describe('organizationSchema and websiteSchema', () => {
  it('gives the organization a stable @id other nodes can reference', () => {
    expect(organizationSchema()['@id']).toBe('https://example.com/#organization');
  });

  it('points the search action at the real search route', () => {
    const website = websiteSchema();
    const action = website.potentialAction as Record<string, unknown>;
    const target = action.target as Record<string, unknown>;

    expect(target.urlTemplate).toBe('https://example.com/search?q={search_term_string}');
    // The query-input name must match the placeholder in the template.
    expect(action['query-input']).toBe('required name=search_term_string');
  });

  it('references the organization from the website by @id', () => {
    const website = websiteSchema();
    expect(website.publisher).toEqual({ '@id': 'https://example.com/#organization' });
  });
});

describe('jsonLdGraph', () => {
  it('wraps nodes in a graph with the schema.org context', () => {
    const graph = jsonLdGraph([organizationSchema()]);
    expect(graph['@context']).toBe('https://schema.org');
    expect(graph['@graph']).toHaveLength(1);
  });

  it('filters out null entries so no empty node is emitted', () => {
    const graph = jsonLdGraph([organizationSchema(), null, undefined, faqPageSchema([])]);
    expect(graph['@graph']).toHaveLength(1);
  });
});

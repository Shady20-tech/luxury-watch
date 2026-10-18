import { describe, expect, it } from 'vitest';

import {
  assembleChrome,
  buildAnnouncements,
  buildBrandPanels,
  buildFooterColumns,
  buildHeaderNav,
  buildIdentity,
  isExternalHref,
  isSafeHref,
  type BrandRow,
  type ModelRow,
  type NavigationRow,
} from '@/lib/navigation/assemble';

/**
 * Assembly tests.
 *
 * The navigation tree is the piece of the chrome most likely to break quietly:
 * a bad sort, a lost parent link or a dropped filter produces a menu that still
 * renders, just wrong. These tests pin the behaviour that matters.
 *
 * The project runs with `noUncheckedIndexedAccess`, so every index access is
 * checked. `at()` is used rather than `[0]` because it returns a nullable the
 * assertions can reason about, and it keeps the tests honest about the fact that
 * an empty result is a possible outcome rather than an assumption.
 */

const nav = (over: Partial<NavigationRow> & { id: string }): NavigationRow => ({
  parent_id: null,
  label: 'Label',
  href: '/somewhere',
  group_label: null,
  sort_order: 10,
  ...over,
});

const brand = (over: Partial<BrandRow> & { id: string }): BrandRow => ({
  name: 'Brand',
  slug: 'brand',
  sort_order: 10,
  ...over,
});

const model = (over: Partial<ModelRow> & { id: string; brand_id: string }): ModelRow => ({
  name: 'Model',
  slug: 'model',
  sort_order: 10,
  ...over,
});

describe('isSafeHref', () => {
  it('accepts site-relative paths', () => {
    expect(isSafeHref('/collections/all')).toBe(true);
    expect(isSafeHref('/')).toBe(true);
  });

  it('accepts https URLs', () => {
    expect(isSafeHref('https://example.com/page')).toBe(true);
  });

  it('rejects javascript: and data: URLs', () => {
    // A `javascript:` href in a menu is an XSS vector. The database constrains
    // hrefs, but a row can be edited by hand in the Supabase dashboard.
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('JavaScript:alert(1)')).toBe(false);
    expect(isSafeHref('data:text/html,<script>')).toBe(false);
  });

  it('rejects protocol-relative and bare http URLs', () => {
    // `//evil.com` inherits the page scheme, so it passes a naive
    // "starts with a slash" check while pointing at another origin.
    expect(isSafeHref('//evil.com')).toBe(false);
    expect(isSafeHref('http://example.com')).toBe(false);
  });
});

describe('isExternalHref', () => {
  it('treats only absolute https as external', () => {
    expect(isExternalHref('https://example.com')).toBe(true);
    expect(isExternalHref('/pages/about')).toBe(false);
    expect(isExternalHref('http://example.com')).toBe(false);
  });
});

describe('buildHeaderNav', () => {
  it('orders top-level items by sort_order', () => {
    const items = buildHeaderNav(
      [
        nav({ id: 'c', label: 'Third', sort_order: 30 }),
        nav({ id: 'a', label: 'First', sort_order: 10 }),
        nav({ id: 'b', label: 'Second', sort_order: 20 }),
      ],
      [],
      [],
    );

    expect(items.map((item) => item.label)).toEqual(['First', 'Second', 'Third']);
  });

  it('breaks a sort_order tie by label so the order is deterministic', () => {
    const items = buildHeaderNav(
      [
        nav({ id: 'z', label: 'Zebra', sort_order: 10 }),
        nav({ id: 'a', label: 'Apple', sort_order: 10 }),
      ],
      [],
      [],
    );

    expect(items.map((item) => item.label)).toEqual(['Apple', 'Zebra']);
  });

  it('promotes the /brands item into a mega menu built from the catalogue', () => {
    const items = buildHeaderNav(
      [nav({ id: 'b', label: 'Brands', href: '/brands' })],
      [brand({ id: 'b1', name: 'Rolex', slug: 'rolex' })],
      [model({ id: 'm1', brand_id: 'b1', name: 'Daytona', slug: 'cosmograph-daytona' })],
    );

    expect(items).toHaveLength(1);
    const item = items.at(0);
    expect(item?.kind).toBe('brands');
    if (item?.kind !== 'brands') throw new Error('expected the brands mega menu');

    const panel = item.panels.at(0);
    expect(panel?.label).toBe('Rolex');
    expect(panel?.columns.at(0)?.links.at(0)?.href).toBe('/collections/cosmograph-daytona');
  });

  it('drops a row with an unsafe href rather than rendering it', () => {
    const items = buildHeaderNav(
      [
        nav({ id: 'ok', label: 'Safe', href: '/safe' }),
        nav({ id: 'bad', label: 'Unsafe', href: 'javascript:alert(1)' }),
      ],
      [],
      [],
    );

    expect(items.map((item) => item.label)).toEqual(['Safe']);
  });

  it('does not promote a child row into the top level', () => {
    const items = buildHeaderNav(
      [
        nav({ id: 'parent', label: 'Shop', sort_order: 10 }),
        nav({ id: 'child', label: 'Child', parent_id: 'parent', sort_order: 5 }),
      ],
      [],
      [],
    );

    expect(items.map((item) => item.label)).toEqual(['Shop']);
  });

  it('returns an empty array when there are no rows', () => {
    expect(buildHeaderNav([], [], [])).toEqual([]);
  });
});

describe('buildBrandPanels', () => {
  it('sorts brands and models by sort_order then name', () => {
    const panels = buildBrandPanels(
      [
        brand({ id: 'b2', name: 'Patek Philippe', slug: 'patek-philippe', sort_order: 20 }),
        brand({ id: 'b1', name: 'Rolex', slug: 'rolex', sort_order: 10 }),
      ],
      [
        model({ id: 'm2', brand_id: 'b1', name: 'Submariner', slug: 'submariner', sort_order: 20 }),
        model({
          id: 'm1',
          brand_id: 'b1',
          name: 'Daytona',
          slug: 'cosmograph-daytona',
          sort_order: 10,
        }),
      ],
      14,
    );

    expect(panels.map((panel) => panel.label)).toEqual(['Rolex', 'Patek Philippe']);
    expect(
      panels
        .at(0)
        ?.columns.at(0)
        ?.links.map((link) => link.label),
    ).toEqual(['Daytona', 'Submariner']);
  });

  it('caps the model list and adds a link to the full brand page', () => {
    // A menu that lists 200 models is unusable. The cap keeps the panel
    // scannable and the brand page remains the complete list.
    const models = Array.from({ length: 20 }, (_, index) =>
      model({
        id: `m${index}`,
        brand_id: 'b1',
        name: `Model ${String(index).padStart(2, '0')}`,
        slug: `model-${index}`,
        sort_order: index,
      }),
    );

    const panels = buildBrandPanels(
      [brand({ id: 'b1', name: 'Rolex', slug: 'rolex' })],
      models,
      14,
    );
    const columns = panels.at(0)?.columns;

    expect(columns?.at(0)?.links).toHaveLength(14);

    const overflow = columns?.at(1)?.links;
    expect(overflow).toHaveLength(1);
    expect(overflow?.at(0)?.label).toBe('All Rolex');
    expect(overflow?.at(0)?.href).toBe('/brands/rolex');
  });

  it('does not add an overflow link when nothing was truncated', () => {
    const panels = buildBrandPanels(
      [brand({ id: 'b1', name: 'Rolex', slug: 'rolex' })],
      [model({ id: 'm1', brand_id: 'b1' })],
      14,
    );

    expect(panels.at(0)?.columns).toHaveLength(1);
  });

  it('gives a brand with no models an empty column list', () => {
    const panels = buildBrandPanels([brand({ id: 'b1', name: 'Rolex', slug: 'rolex' })], [], 14);
    expect(panels.at(0)?.columns).toEqual([]);
  });
});

describe('buildFooterColumns', () => {
  it('groups rows by group_label and preserves order within a group', () => {
    const columns = buildFooterColumns([
      nav({ id: '1', label: 'Shop', group_label: 'Explore', sort_order: 10 }),
      nav({ id: '2', label: 'Brands', group_label: 'Explore', sort_order: 20 }),
      nav({ id: '3', label: 'Shipping', group_label: 'Policies', sort_order: 10 }),
    ]);

    expect(columns.map((column) => column.heading)).toEqual(['Explore', 'Policies']);
    expect(columns.at(0)?.links.map((link) => link.label)).toEqual(['Shop', 'Brands']);
  });

  it('falls back to an Explore heading when group_label is null', () => {
    const columns = buildFooterColumns([nav({ id: '1', label: 'Orphan', group_label: null })]);
    expect(columns.at(0)?.heading).toBe('Explore');
  });

  it('treats a whitespace-only group_label as absent', () => {
    const columns = buildFooterColumns([nav({ id: '1', label: 'Orphan', group_label: '   ' })]);
    expect(columns.at(0)?.heading).toBe('Explore');
  });

  it('omits unsafe links', () => {
    const columns = buildFooterColumns([
      nav({ id: '1', label: 'Safe', href: '/safe', group_label: 'Explore' }),
      nav({ id: '2', label: 'Unsafe', href: 'javascript:void(0)', group_label: 'Explore' }),
    ]);

    expect(columns.at(0)?.links.map((link) => link.label)).toEqual(['Safe']);
  });
});

describe('buildAnnouncements', () => {
  it('keeps a safe link', () => {
    const announcement = buildAnnouncements([
      { id: 'a1', message: 'Hello', link_label: 'More', link_url: '/pages/about' },
    ]).at(0);

    expect(announcement?.linkUrl).toBe('/pages/about');
  });

  it('drops an unsafe link but keeps the message', () => {
    const announcement = buildAnnouncements([
      { id: 'a1', message: 'Hello', link_label: 'More', link_url: 'javascript:alert(1)' },
    ]).at(0);

    expect(announcement?.message).toBe('Hello');
    expect(announcement?.linkUrl).toBeNull();
  });
});

describe('buildIdentity', () => {
  it('returns a usable identity when settings are missing', () => {
    const identity = buildIdentity(null);

    expect(identity.businessName).toBe('Carbon Watch Company');
    expect(identity.addressLines).toEqual([]);
    expect(identity.socials).toEqual([]);
  });

  it('joins address parts and skips the empty ones', () => {
    const identity = buildIdentity({
      business_name: 'Appleton & Co',
      tagline: null,
      logo_url: null,
      contact_email: null,
      contact_phone: null,
      whatsapp_url: null,
      address_line1: '12 Guildhall Street',
      address_line2: null,
      address_city: 'London',
      address_region: null,
      address_postal_code: 'EC2V 7HH',
      address_country: 'United Kingdom',
      social_instagram: null,
      social_facebook: null,
      social_x: null,
      social_youtube: null,
      age_gate_enabled: true,
      age_gate_minimum_age: 18,
    });

    expect(identity.addressLines).toEqual([
      '12 Guildhall Street',
      'London',
      'EC2V 7HH United Kingdom',
    ]);
  });

  it('includes only the socials that are set', () => {
    const identity = buildIdentity({
      business_name: 'Appleton & Co',
      tagline: null,
      logo_url: null,
      contact_email: null,
      contact_phone: null,
      whatsapp_url: null,
      address_line1: null,
      address_line2: null,
      address_city: null,
      address_region: null,
      address_postal_code: null,
      address_country: null,
      social_instagram: 'https://instagram.com/x',
      social_facebook: null,
      social_x: null,
      social_youtube: 'https://youtube.com/x',
      age_gate_enabled: true,
      age_gate_minimum_age: 18,
    });

    expect(identity.socials.map((social) => social.label)).toEqual(['Instagram', 'YouTube']);
  });
});

describe('assembleChrome', () => {
  it('assembles header and footer from their separate row sets', () => {
    const chrome = assembleChrome({
      headerRows: [nav({ id: 'h1', label: 'Shop', href: '/collections/all' })],
      footerRows: [nav({ id: 'f1', label: 'Shipping', group_label: 'Policies' })],
      brands: [],
      models: [],
      announcements: [],
      settings: null,
      ageGateFallback: true,
      source: 'database',
    });

    expect(chrome.source).toBe('database');
    expect(chrome.header.map((item) => item.label)).toEqual(['Shop']);
    expect(chrome.footerColumns.at(0)?.heading).toBe('Policies');
  });

  it('never places a footer row in the header', () => {
    const chrome = assembleChrome({
      headerRows: [],
      footerRows: [nav({ id: 'f1', label: 'Only footer' })],
      brands: [],
      models: [],
      announcements: [],
      settings: null,
      ageGateFallback: true,
      source: 'database',
    });

    expect(chrome.header).toEqual([]);
  });
});

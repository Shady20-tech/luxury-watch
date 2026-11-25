// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CommunityPanel, PromoBanner, SocialPanel } from '@/components/homepage/dark-sections';
import { BrandShowcase, ProductRailSection, TrustRow } from '@/components/homepage/sections';
import { brandPhotograph } from '@/lib/images/site-photography';
import type { BrandTile, CopySection, ProductRail, TrustItem } from '@/lib/homepage/types';

/**
 * The homepage's dark panels and the restyled light sections.
 *
 * These cover the behaviour the redesign could plausibly break and a screenshot
 * cannot show:
 *
 *  - the social panel renders nothing without a real link, so it cannot become
 *    an empty grid;
 *  - the brand tabs are real links, and appear only when there is more than one
 *    brand to switch between;
 *  - the newsletter panel is a real `GET` form that reaches the contact route,
 *    not a fake subscribe control;
 *  - the dark grounds actually carry the light text tokens, which is the one
 *    thing the reference departure could get wrong.
 *
 * jsdom does not lay out the document, so this suite says nothing about
 * contrast or overflow. The token contrast is asserted in
 * `tests/design-tokens.test.ts` and the geometry in the browser audit.
 */

afterEach(cleanup);

const section: CopySection = {
  id: 'sec-1',
  eyebrow: 'Eyebrow',
  title: 'Section title',
  body: 'Section body',
  cta: { label: 'Do the thing', href: '/contact' },
  imageUrl: null,
};

describe('PromoBanner', () => {
  it('renders the section copy and a working call to action', () => {
    render(<PromoBanner section={section} />);

    expect(screen.getByRole('heading', { name: 'Section title' })).toBeDefined();
    const cta = screen.getByRole('link', { name: /Do the thing/ });
    expect(cta.getAttribute('href')).toBe('/contact');
  });

  it('sits on the darkest ground with light text', () => {
    const { container } = render(<PromoBanner section={section} />);
    const panel = container.querySelector('section');

    // The near-black panel and the light text token together are what make this
    // legible; asserting only one of them would pass on a white-on-white panel.
    expect(panel?.className).toContain('bg-night-950');
    expect(screen.getByRole('heading', { name: 'Section title' }).className).toContain(
      'text-on-night',
    );
  });

  it('omits the eyebrow and the button when the row has neither', () => {
    render(<PromoBanner section={{ ...section, eyebrow: null, cta: null }} />);

    expect(screen.queryByText('Eyebrow')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('CommunityPanel', () => {
  it('posts the email to the contact route rather than pretending to subscribe', () => {
    const { container } = render(<CommunityPanel section={section} />);
    const form = container.querySelector('form');

    // There is no public subscribe write path in this build, so the form must
    // not post somewhere that implies one.
    expect(form?.getAttribute('method')).toBe('get');
    expect(form?.getAttribute('action')).toBe('/contact');
  });

  it('labels the email field for assistive technology', () => {
    render(<CommunityPanel section={section} />);

    expect(screen.getByLabelText('Email address')).toBeDefined();
  });

  it('says plainly that it does not subscribe silently', () => {
    render(<CommunityPanel section={section} />);

    expect(screen.getByText(/does not subscribe you silently/i)).toBeDefined();
  });
});

describe('SocialPanel', () => {
  const socials = [
    { label: 'Instagram', href: 'https://example.test/instagram' },
    { label: 'Facebook', href: 'https://example.test/facebook' },
  ];

  it('renders nothing when there is no real social link', () => {
    // The whole point: no connected account must not become an empty grid or an
    // invented post tile.
    const { container } = render(<SocialPanel section={section} socials={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders one labelled external link per social account', () => {
    render(<SocialPanel section={section} socials={socials} />);

    const link = screen.getByRole('link', { name: /Instagram/ });
    expect(link.getAttribute('href')).toBe('https://example.test/instagram');
    // An external link opened in a new tab needs both, or it is a reverse
    // tabnabbing vector and a surprise.
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('renders the section heading on the dark ground', () => {
    const { container } = render(<SocialPanel section={section} socials={socials} />);

    expect(container.querySelector('section')?.className).toContain('bg-night-950');
    expect(screen.getByRole('heading', { name: 'Section title' })).toBeDefined();
  });
});

describe('TrustRow', () => {
  const items: TrustItem[] = [
    { id: 't1', title: 'Checked twice', body: 'Every piece.', label: 'Authenticity' },
    { id: 't2', title: 'No pressure', body: 'Advice first.', label: 'Honesty' },
  ];

  it('renders each item as a heading with its body', () => {
    render(<TrustRow items={items} />);

    expect(screen.getByRole('heading', { name: 'Checked twice' })).toBeDefined();
    expect(screen.getByText('Advice first.')).toBeDefined();
  });

  it('still renders an item whose label matches no icon', () => {
    // A content editor adding a value proposition must not produce a hole.
    render(
      <TrustRow items={[{ id: 't3', title: 'New promise', body: null, label: 'Something new' }]} />,
    );

    expect(screen.getByRole('heading', { name: 'New promise' })).toBeDefined();
  });
});

describe('ProductRailSection', () => {
  const rail: ProductRail = {
    id: 'r1',
    eyebrow: null,
    title: 'New arrivals',
    body: null,
    cta: { label: 'View all', href: '/watches' },
    collectionSlug: 'new-arrivals',
    imageUrl: null,
    products: [
      {
        id: 'p1',
        slug: 'a',
        href: '/watches/a',
        title: 'Alpha',
        brandName: 'Omega',
        summary: null,
        imageUrl: null,
        imageAlt: '',
        dialColor: null,
        caseMaterial: null,
        price: null,
        condition: null,
        available: true,
        isNew: false,
      },
      {
        id: 'p2',
        slug: 'b',
        href: '/watches/b',
        title: 'Beta',
        brandName: 'Rolex',
        summary: null,
        imageUrl: null,
        imageAlt: '',
        dialColor: null,
        caseMaterial: null,
        price: null,
        condition: null,
        available: true,
        isNew: false,
      },
    ],
  };

  it('renders a brand tab per distinct brand, as a real link', () => {
    render(<ProductRailSection rail={rail} />);

    const omega = screen.getByRole('link', { name: 'Omega' });
    expect(omega.getAttribute('href')).toBe('/brands/omega');
    expect(screen.getByRole('link', { name: 'Rolex' }).getAttribute('href')).toBe('/brands/rolex');
  });

  it('names the tab group after the rail it belongs to', () => {
    render(<ProductRailSection rail={rail} />);

    // Two rails on one page would otherwise produce two identically-named
    // navigation landmarks, which is both an axe failure and genuinely
    // ambiguous for a screen reader.
    expect(screen.getByRole('navigation', { name: 'Browse by brand: New arrivals' })).toBeDefined();
  });

  it('renders no tabs when the rail spans a single brand', () => {
    const single = { ...rail, products: [rail.products[0]!] };
    render(<ProductRailSection rail={single} />);

    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('names the collection when it has no published products', () => {
    render(<ProductRailSection rail={{ ...rail, products: [] }} />);

    expect(screen.getByText(/new-arrivals/)).toBeDefined();
  });

  it('says so when no collection is linked at all', () => {
    render(<ProductRailSection rail={{ ...rail, products: [], collectionSlug: null }} />);

    expect(screen.getByText(/No collection is linked/i)).toBeDefined();
  });
});

describe('BrandShowcase', () => {
  const brands: BrandTile[] = [
    {
      id: 'b1',
      name: 'Omega',
      slug: 'omega',
      href: '/brands/omega',
      productCount: 1,
      modelNames: ['Seamaster'],
      photograph: null,
    },
    {
      id: 'b2',
      name: 'Rolex',
      slug: 'rolex',
      href: '/brands/rolex',
      productCount: 2048,
      modelNames: [],
      photograph: brandPhotograph('rolex'),
    },
  ];

  it('renders each brand as a link to its catalogue', () => {
    render(<BrandShowcase brands={brands} />);

    expect(screen.getByRole('link', { name: /Omega/ }).getAttribute('href')).toBe('/brands/omega');
  });

  it('uses the singular for a single watch', () => {
    render(<BrandShowcase brands={brands} />);

    expect(screen.getByText('1 watch')).toBeDefined();
    expect(screen.getByText('2,048 watches')).toBeDefined();
  });
});

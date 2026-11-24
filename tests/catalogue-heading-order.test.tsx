// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `server-only` throws by design outside a Server Component; the card pulls it
// in transitively through `@/lib/catalogue/types`.
vi.mock('server-only', () => ({}));

import { CatalogueGrid } from '@/components/catalogue/catalogue-card';
import type { CatalogueProduct } from '@/lib/catalogue/types';

/**
 * Heading order in the catalogue grid.
 *
 * axe checks `heading-order` only in a browser, because the rule depends on
 * which headings are actually in the accessibility tree — a `display:none`
 * heading such as the sidebar's "Filter" is not. That is why this defect was
 * invisible to `tests/a11y-shell.test.tsx` (jsdom) and only appeared in
 * `npm run audit:a11y`: on a narrow screen the sidebar is hidden, so every
 * card's `h3` followed the page `h1` directly.
 *
 * The grid now owns an `h2`, so the cards never skip a level regardless of
 * viewport. This test asserts the level directly, which jsdom *can* do.
 */

const product: CatalogueProduct = {
  id: 'p1',
  slug: 'rolex-milgauss-116400',
  href: '/products/rolex-milgauss-116400',
  title: 'Rolex Milgauss',
  brandName: 'Rolex',
  brandSlug: 'rolex',
  modelName: 'Milgauss',
  modelSlug: 'milgauss',
  summary: null,
  imageUrl: null,
  imageAlt: 'Rolex Milgauss',
  price: null,
  condition: 'new',
  reference: '116400GV',
  year: 2025,
  caseSize: '40 mm',
  caseMaterial: 'Steel',
  movement: 'Automatic',
  dialColor: 'Black',
  boxAndPapers: true,
  available: true,
  isNew: true,
};

afterEach(cleanup);

describe('catalogue grid heading order', () => {
  it('renders a level-2 heading for the grid, above each card heading', () => {
    render(<CatalogueGrid products={[product]} />);

    const gridHeading = screen.getByRole('heading', { name: 'Watches', level: 2 });
    const cardHeading = screen.getByRole('heading', { name: 'Rolex Milgauss', level: 3 });

    // The grid heading must precede the card heading in document order, or the
    // card's level-3 heading would still follow the page h1 first.
    expect(gridHeading.compareDocumentPosition(cardHeading)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('labels the grid from the scope so the heading is not a generic word', () => {
    render(<CatalogueGrid products={[product]} label="Rolex watches" />);

    expect(screen.getByRole('heading', { name: 'Rolex watches', level: 2 })).toBeDefined();
  });

  it('omits its heading when the caller already supplies one', () => {
    render(<CatalogueGrid products={[product]} headingId={null} />);

    expect(screen.queryByRole('heading', { name: 'Watches', level: 2 })).toBeNull();
  });
});

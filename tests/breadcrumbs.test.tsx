// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Breadcrumbs } from '@/components/product/breadcrumbs';

/**
 * The shared breadcrumb trail.
 *
 * axe's `link-in-text-block` rule fires when a link sits inside a run of prose
 * and is distinguished only by colour. jsdom cannot lay out a document, so that
 * rule never runs in a jsdom suite — it caught the model listing page only in
 * the browser audit, after a hand-rolled trail used bare `/` separators in a
 * `<nav>` with no list. The structure below is what keeps the rule quiet:
 * each crumb is its own list item, so no link shares a text block with prose.
 */
describe('Breadcrumbs', () => {
  afterEach(cleanup);

  const entries = [
    { name: 'Brands', path: '/brands' },
    { name: 'Rolex', path: '/brands/rolex' },
    { name: 'Milgauss', path: '/brands/rolex/models/milgauss' },
  ];

  it('renders an ordered list so links never share a text block', () => {
    const { container } = render(<Breadcrumbs entries={entries} />);

    expect(container.querySelector('nav > ol')).not.toBeNull();
    expect(container.querySelectorAll('nav > ol > li')).toHaveLength(3);
  });

  it('links every entry except the last', () => {
    render(<Breadcrumbs entries={entries} />);

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Brands',
      'Rolex',
    ]);
  });

  it('marks the final entry as the current page and does not link to it', () => {
    render(<Breadcrumbs entries={entries} />);

    const current = screen.getByText('Milgauss');

    expect(current.getAttribute('aria-current')).toBe('page');
    expect(current.closest('a')).toBeNull();
  });

  it('renders nothing when there are no entries', () => {
    const { container } = render(<Breadcrumbs entries={[]} />);

    expect(container.querySelector('nav')).toBeNull();
  });
});

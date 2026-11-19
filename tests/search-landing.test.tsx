// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SearchLanding } from '@/components/catalogue/search-landing';

/**
 * The search landing is the crawlable index of the taxonomy, so its links are
 * the only way a crawler reaches a model page. The mega-menu links the same
 * models but mounts on interaction, so it contributes no anchors to the served
 * HTML; if these hrefs regress to the `?model=` facet, every model page becomes
 * an orphan that is indexable and in the sitemap but reachable from nowhere.
 */

afterEach(cleanup);

describe('SearchLanding', () => {
  it('links a model to its own page, not the noindex facet', () => {
    render(
      <SearchLanding
        brands={[
          {
            name: 'Rolex',
            slug: 'rolex',
            productCount: 4,
            models: [{ name: 'Milgauss', slug: 'milgauss', productCount: 4 }],
          },
        ]}
        collections={[]}
      />,
    );

    const model = screen.getByRole('link', { name: 'Milgauss' });
    expect(model.getAttribute('href')).toBe('/brands/rolex/models/milgauss');
  });

  it('omits a brand with nothing published', () => {
    render(
      <SearchLanding
        brands={[
          {
            name: 'Richard Mille',
            slug: 'richard-mille',
            productCount: 0,
            models: [],
          },
        ]}
        collections={[]}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Richard Mille' })).toBeNull();
  });
});

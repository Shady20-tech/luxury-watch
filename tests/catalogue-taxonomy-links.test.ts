import { describe, expect, it } from 'vitest';

import { catalogueBasePath } from '@/lib/catalogue/params';

/**
 * Internal links to taxonomy pages must point at the page that is allowed to
 * rank.
 *
 * -----------------------------------------------------------------------------
 * THE DEFECT THIS PINS
 * -----------------------------------------------------------------------------
 *
 * A model family has two addresses that show the same watches:
 *
 *   `/brands/<brand>/models/<model>`   its own indexable page, in the sitemap
 *   `/brands/<brand>?model=<model>`    a filtered brand listing, `noindex`
 *
 * Both render the same grid, so nothing looks wrong and no test failed. But the
 * brands index linked the filtered form, which `isIndexableListing` marks
 * `noindex` and canonicalises onto the clean brand page. The model page was
 * therefore reachable only from the brand detail page and the sitemap — a page
 * that asked to be indexed while the site's own directory pointed at a
 * duplicate that asked not to be.
 *
 * Every other call site (navigation, search landing, brand detail, sitemap) had
 * already moved to the nested route. The brands index was the single straggler,
 * which is exactly the shape of drift these assertions catch: they state the
 * rule, not the one call site that broke it.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS ASSERTED ON THE HELPERS AND THE SOURCE
 * -----------------------------------------------------------------------------
 *
 * The links are built inline in server components, which are awkward to render
 * in isolation. Rather than mock a page's whole data layer to inspect one `href`,
 * the first test pins the URL the router itself produces for a model scope, and
 * the second scans the app source for the filtered spelling. A new page that
 * reintroduces it fails the scan whether or not it is rendered under test.
 */

const APP_SOURCE_GLOB = new URL('../src/app/', import.meta.url);

describe('model scope URL', () => {
  it('renders a model scope as the nested, indexable route', () => {
    // `modelScopeSlug` carries `<brand>/<model>`, and `catalogueBasePath` turns
    // it back into the nested path. This is the address the sitemap lists and
    // the one `isIndexableListing` allows to rank.
    expect(catalogueBasePath({ scope: 'model', scopeSlug: 'rolex/milgauss' })).toBe(
      '/brands/rolex/models/milgauss',
    );
  });

  it('falls back to the brand index when the composite slug is malformed', () => {
    // A scope slug without both halves is not a model page. Falling back rather
    // than emitting `/brands/rolex/models/undefined` keeps a malformed value
    // from becoming a real, broken URL.
    expect(catalogueBasePath({ scope: 'model', scopeSlug: 'rolex' })).toBe('/brands');
    expect(catalogueBasePath({ scope: 'model', scopeSlug: null })).toBe('/brands');
  });
});

describe('internal links to a model family', () => {
  it('never links a model through the noindex `?model=` filtered listing', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');

    async function collect(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const files = await Promise.all(
        entries.map(async (entry) => {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) return collect(path);
          return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
        }),
      );
      return files.flat();
    }

    const offenders: string[] = [];
    for (const file of await collect(APP_SOURCE_GLOB.pathname)) {
      const source = await readFile(file, 'utf8');
      // The filtered spelling: a brand path followed by a `model` query. The
      // nested route (`/models/<slug>`) does not match, which is the point.
      if (/\/brands\/\$\{[^}]+\}\?model=/.test(source)) {
        offenders.push(file.replace(APP_SOURCE_GLOB.pathname, 'src/app/'));
      }
    }

    expect(offenders).toEqual([]);
  });
});

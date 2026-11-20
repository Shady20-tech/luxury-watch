# SEO

The SEO layer lives in `src/lib/seo/` and is treated as a first-class
requirement from the foundation onward, not as a task added before launch.

## Files

| File                             | Responsibility                                                |
| -------------------------------- | ------------------------------------------------------------- |
| `src/lib/seo/metadata.ts`        | Canonical URLs, Open Graph, Twitter cards, robots directives. |
| `src/lib/seo/schema.ts`          | Schema.org JSON-LD builders.                                  |
| `src/lib/seo/sitemap.ts`         | Sitemap entries, honest `lastmod`, cache tags.                |
| `src/components/seo/json-ld.tsx` | Renders a JSON-LD graph with escaping.                        |
| `src/app/robots.ts`              | `robots.txt`.                                                 |
| `src/app/sitemap.ts`             | `sitemap.xml`.                                                |

## What Google actually says about AI features

Two claims circulate widely and both are wrong. The guidance below is taken from
Google's official documentation, checked in October 2026.

### Structured data is not required for AI Overviews or AI Mode

Google states plainly that there is no special schema.org markup, file or
configuration required for its generative AI search features. A page appears in
AI Overviews because it ranks and is indexed normally.

Source:
<https://developers.google.com/search/docs/fundamentals/ai-optimization-guide>

We still emit structured data, because it earns ordinary rich results and it is
the correct way to describe a product page. We do not emit it expecting it to
unlock anything.

### `llms.txt` is ignored by Google Search

Google does not use `llms.txt` and does not support it. It is not created here,
and the absence is intentional rather than an oversight.

Source: the same guide, and
<https://developers.google.com/search/blog/2025/07/ai-mode-and-your-site>

What Google's guidance _does_ recommend is ordinary good practice: useful
content, clear semantic HTML, descriptive headings, and accessible markup.

## Sitemap `lastmod` honesty

`<lastmod>` is a crawl **hint**. It cannot force a recrawl.

- A timestamp is emitted only when a genuine publish or update value exists.
- `toLastModified()` returns `undefined` for an unparseable value, and
  `buildSitemapEntry()` then omits the field entirely, rather than substituting
  the current time.
- `latestLastModified()` returns `undefined` when no entry has a timestamp.
- Brand and collection entries carry the row's real `updated_at`. Product and
  page entries arrive with the database-driven sitemap in Phase 12.

Publishing, editing, unpublishing, archiving or deleting a product invalidates
the `sitemap`, `products` and `product:<slug>` cache tags through
`productRevalidationTags()`.

## Honesty rules enforced by tests

`tests/seo-schema.test.ts` pins two rules that are easy to break by accident:

1. **No invented prices.** `Product.offers` is emitted only when a real
   published price exists. When the price is on request, the node describes the
   product without claiming a price. The reference site's markup omits `offers`
   entirely, which is correct for an inquiry-led catalogue.
2. **`brand` is the manufacturer, never the retailer.** The reference site sets
   `brand` to its own store name. We emit the real manufacturer from the
   `brands` table, and omit `brand` entirely when it is unknown rather than
   substituting the site name.

## Crawl-trap hygiene

Faceted navigation and sort permutations multiply URLs. The strategy has one
rule per URL class, and the sitemap applies the same rule so the two never
contradict each other.

| URL class                                     | Indexed?             | Canonical                             | In sitemap?                                               |
| --------------------------------------------- | -------------------- | ------------------------------------- | --------------------------------------------------------- |
| `/shop`, `/brands/x`, `/collections/x`        | yes                  | itself                                | yes, if it has published pieces                           |
| `/shop?page=2` (any clean listing + page)     | yes                  | itself                                | no — a sitemap lists the head of a series, not every page |
| `/shop?sort=price_asc`                        | yes                  | the clean listing                     | no                                                        |
| `/shop?pageSize=48`                           | yes                  | the clean listing                     | no                                                        |
| any listing with a filter or a `q` term       | no                   | the clean listing (`noindex, follow`) | no                                                        |
| `/search` (blank or not)                      | no                   | `/search`                             | no                                                        |
| a brand or collection with 0 published pieces | no                   | itself (`noindex, follow`)            | no                                                        |
| `/collections/all`                            | n/a — 308 to `/shop` | —                                     | no                                                        |

The decision lives in `isIndexableListing()` and `canonicalListingPath()` in
`src/lib/catalogue/params.ts`, and `tests/catalogue-params.test.ts` pins it. The
scoped-page half — a brand or collection holding nothing — is pinned separately
in `tests/catalogue-scope-indexing.test.ts`, because it depends on a database
count rather than only on the query string.

### Why `robots.txt` does not disallow query strings

An earlier version disallowed `/*?*sort=`, `/*?*filter=` and `/*?*page=`. That
was wrong twice over:

- A disallowed URL is never fetched, so the crawler never reads its `noindex` or
  its canonical — the two signals that consolidate a facet permutation onto the
  clean listing. Blocking the crawl does not suppress the URL; it stops the page
  from saying where it belongs.
- It contradicted this site's own rule that `?page=2` is indexable with a
  self-referential canonical. The disallow hid the deeper pages while the page
  metadata invited crawlers in.

Facet control is therefore page-level only, which is what Google's
faceted-navigation guidance recommends. `tests/robots.test.ts` asserts that no
query-string pattern is present, so the mistake cannot be reintroduced quietly.

### Thin taxonomy pages

A brand or collection page with no published pieces is real and has an honest
empty state, but it cannot rank: it says only "we hold none of these right now".
It is `noindex, follow` — `follow` because it is still a useful hop into the
catalogue — and the sitemap omits it.

Both sides read the same aggregate (`published_product_counts()` /
`published_collection_counts()`), so the page and the sitemap reach the decision
from one number and cannot drift. That is the point of the aggregate existing as
a function rather than as a client-side count.

### Duplicate addresses

- `/collections/all` permanently redirects (308) to `/shop`. Only the destination
  is in the sitemap; a sitemap should carry the target of a redirect, not the
  redirect.
- The blank `/search` page is a landing page (collections, brands, model
  families) rather than a copy of the shop grid. It is still `noindex`: it is a
  query surface, not a destination, and its content is an index of pages that are
  already in the sitemap.

## Accessibility is an SEO requirement

Google's guidance explicitly links accessible markup to how well its systems
understand a page. The accessibility tree is how a machine reads the content.

The reference site sets `user-scalable=0`, which blocks pinch-zoom and fails
WCAG 1.4.4. We do not. Our viewport sets `maximumScale: 5` and
`userScalable: true`.

## Targets

The goal is 100/100 in Lighthouse Performance, Accessibility, Best Practices and
SEO for public templates where technically achievable. Scores will be measured
with real audits and reported with evidence, including any remaining limitation.
No score is promised in advance, and none is fabricated.

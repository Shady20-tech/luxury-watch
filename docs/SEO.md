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
- Product, brand, collection and page entries are added in Phase 12, each
  carrying its real `updated_at`.

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

Faceted navigation and sort permutations multiply URLs. Two mechanisms apply:

- `robots.txt` disallows `/*?*sort=`, `/*?*filter=` and `/*?*page=`.
- `buildListingMetadata()` sets `noindex` on multi-facet permutations and points
  the canonical at the clean collection URL.

`robots.txt` cannot reliably match query strings, so the page-level `noindex` is
what actually does the work.

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

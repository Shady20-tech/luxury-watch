# SEO

The SEO layer lives in `src/lib/seo/` and is treated as a first-class
requirement from the foundation onward, not as a task added before launch.

## Files

| File                             | Responsibility                                                |
| -------------------------------- | ------------------------------------------------------------- |
| `src/lib/seo/metadata.ts`        | Canonical URLs, Open Graph, Twitter cards, robots directives. |
| `src/lib/seo/schema.ts`          | Schema.org JSON-LD builders.                                  |
| `src/lib/seo/sitemap.ts`         | Sitemap entries, honest `lastmod`, revalidation paths.        |
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
- Brand, collection, model, product and page entries all carry the row's real
  `updated_at`. Verified against a production build: the emitted timestamps
  match `select updated_at from products` exactly, and are not build times.
- The fixed informational routes carry no `lastmod` at all. They have no row and
  therefore no honest timestamp, so the field is omitted rather than faked.

## The sitemap is cached, and what invalidates it

`src/app/sitemap.ts` exports `revalidate = 3600`, so the document is served from
cache for up to an hour. That cache is cleared by **`revalidatePath`**, not by a
cache tag: the route reads through the repository rather than through
`unstable_cache`, so there is no tagged data cache to flush.

The paths live in `src/lib/seo/sitemap.ts` and are imported by the actions, so a
path cannot be forgotten in one place and kept in another:

| Helper                       | Called from                                                            |
| ---------------------------- | ---------------------------------------------------------------------- |
| `productRevalidationPaths()` | `createProductAction`, `updateProductAction`, `setProductStatusAction` |
| `SITEMAP_PATH` (directly)    | `savePageAction`, `deletePageAction` in `content-actions.ts`           |

`productRevalidationPaths()` includes `SITEMAP_PATH`. **A new mutation that can
change what the catalogue contains must include it too.** Only these two helpers
exist: an earlier draft of this change also added brand and collection helpers,
which were removed because no brand or collection editor exists to call them —
an unused helper is not preparation, it is a claim that something is wired when
it is not.

Page saves call `revalidatePath(SITEMAP_PATH)` directly rather than through a
helper, because `revalidateContent()` already revalidates the page's own path and
the sitemap is the only extra one. FAQ and testimonial edits deliberately do not
call it: they cannot change sitemap membership.

This was broken until Phase 14 and the breakage was invisible to the whole test
suite. The sitemap had no invalidation at all, so a piece published through the
admin stayed absent from the sitemap for up to an hour and an archived piece
stayed advertised for the same hour. It was reproduced against a production
build: publish a draft, re-fetch `/sitemap.xml`, still absent; call
`revalidatePath('/sitemap.xml')`, re-fetch, present. The lesson is the shape of
the test: no test asserted _what an action revalidates_, only what it returned,
so 900 green tests said nothing about it. `tests/sitemap-revalidation.test.ts`
now drives the real action with `next/cache` mocked and asserts the path is
passed. It was mutation-tested — removing `SITEMAP_PATH` from the helper fails
three of its five cases.

## What the sitemap lists

| Source                                  | Listed when                                            |
| --------------------------------------- | ------------------------------------------------------ |
| `/`, `/shop`, `/brands`, `/collections` | always                                                 |
| 11 informational routes                 | always — they are static segments with their own copy  |
| products                                | published, via RLS                                     |
| brands / collections / models           | at least one published piece                           |
| CMS pages                               | published, and not already covered by a static segment |

`/design-system` is deliberately absent: it is `noindex, nofollow`, and a sitemap
entry for a `noindex` page tells a crawler two contradictory things. A test pins
the exclusion.

The informational routes are a fixed list rather than a query because several of
them — `/contact`, `/appointments`, the three `/services/*` pages — have no
`pages` row at all. They are routes with their own copy. Listing only what the
table holds would omit them. Each was checked against a production build for
`noindex` before being added; all were indexable with a self-canonical.

Because a published `pages` row can shadow a static segment (`about` renders at
`/pages/about`), the CMS-page loop skips any slug already covered by the fixed
list. Without that, the same canonical is emitted twice. A test asserts the
count is exactly one.

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

A third rule applies to the site-wide graph: **`LocalBusiness` is not emitted.**
`localBusinessSchema()` exists, and the site has a `site_settings` table with
address columns, but the seed leaves every address field empty. Emitting a
`LocalBusiness` with no address would be a claim about a physical location that
the data does not support, and Google's own guidance treats a missing address as
a defect in that type. The builder stays unused until the columns are filled —
which is the correct state, not an oversight. When an address is entered, wire it
up rather than inventing one.

## FAQ structured data

`/pages/faq` emits `FAQPage` from the same rows `FaqAccordion` renders, so the
markup cannot describe a question the visitor cannot see. `faqPageSchema()`
returns `null` for an empty list rather than an empty `mainEntity`, because an
empty list is a claim about nothing.

This was dead code until Phase 14: `faqPageSchema()` was written and tested but
never called, while ten real questions rendered unmarked. Worth knowing when
auditing the schema layer — a builder existing is not evidence that it is used.
`grep -rn '<builderName>(' src/` outside `lib/seo/schema.ts` is the check.

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

### Thin taxonomy copy, which the count rule cannot see

The count rule above asks "does this page have anything to show?". It cannot ask
"does this page have anything to say?". Those are different failures and the
second is easier to miss, because a page with 12 pieces in its grid looks
substantial.

`/brands/[slug]` renders `brands.description` in the hero and in
`<meta name="description">`. Every seeded brand once carried the same
`'Reference brand seeded for development.'`, so four indexable, self-canonical
pages shared one sentence that described nothing — while each passed the
published-count test and appeared in the sitemap. Recorded as G78.

The fallback in `page.tsx` is a generated sentence naming the brand, and it only
runs when `description` is null. A populated-but-placeholder column defeats it,
which is the general shape of this defect: placeholder data is more dangerous
than missing data, because missing data falls through to code that was written to
handle it.

`tests/seed-copy.test.ts` guards the seed: no placeholder phrasing, no two brands
alike, and each description long enough to add something a template could not
say. It does not check production content, because the seed is what a fresh
environment loads and there is no admin surface for brand copy yet. When one is
added, extend the same assertions to what the editor saves.

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

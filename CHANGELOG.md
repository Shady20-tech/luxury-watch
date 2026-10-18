# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Phase 7 — Wishlist and cart

**Date:** 2026-10-18

#### Added

**Migration `supabase/migrations/0012_wishlist_and_cart.sql`**

- `discount_kind` (`percentage`, `fixed_amount`, `free_delivery`) and
  `discount_codes` — administrator-configured promotional codes. The table has
  **no public read policy**, so the list of live codes cannot be enumerated with
  the anon key.
- `carts.discount_code` — the code a customer has applied, stored as a reference
  to the code, never as an amount. A tampered request can change which code is
  named; it cannot change what the code is worth.
- `cart_pricing(lines jsonb, discount_code text, currency char(3))` — the single
  source of truth for every number the cart shows. It re-reads each product,
  decides availability, decides whether the product model permits a quantity
  above one, and recomputes the discount from the code. `security definer`,
  because it must see unpublished rows in order to report them honestly, and it
  never returns `cost_cents`, `compare_at_cents` or a stock count.
- `catalogue_by_ids(uuid[])` — the published card rows for a set of ids, with the
  publication and active-taxonomy gates re-applied inside the function. The
  wishlist needs this because `wishlist_items` can reference a product that has
  since been unpublished, and a wishlist that rendered a draft would be a leak.

**Cart**

- `src/lib/cart/` — `types.ts` (view models), `pricing.ts` (a pure mapper from the
  `cart_pricing` payload, with no arithmetic of its own), `validation.ts` (Zod
  schemas and the mutation state), `session.ts` (the httpOnly guest-cart token),
  `merge.ts` (the merge rules) and `events.ts` (the change signal).
- `src/server/repositories/cart-repository.ts` — reads and writes against the
  request-scoped client, plus the service-role path a guest cart needs.
- `src/server/services/cart-service.ts`, `src/server/actions/cart-actions.ts` —
  `addToCart`, `updateCartQuantity`, `removeFromCart`, `applyDiscountCode`,
  `clearCart`, `mergeGuestCartAction` and `moveToCartFromWishlist`.
- `src/components/cart/` — the add-to-cart control, the cart contents, the line
  controls, the discount form and the responsive cart drawer.
- `/cart` — the cart page, explicitly `force-dynamic` because it reads a cookie.

**Wishlist**

- `src/lib/wishlist/` — `guest.ts` (the `localStorage` list, ids only),
  `assemble.ts` and `types.ts`.
- `src/server/repositories/wishlist-repository.ts`,
  `src/server/services/wishlist-service.ts`, and the wishlist server actions.
- `src/components/wishlist/` — the guest list, the signed-in grid, the remove
  control, the move-to-cart control and the one-shot sign-in merge.
- `/wishlist`, the product-page wishlist toggle, and live header badges.

#### Security

- **A discount is recomputed from the code, never accepted as an amount.** The
  form posts the code and nothing else; `cart_pricing` decides eligibility and
  the value. An ineligible code is reported with a reason and applies nothing
  rather than raising, so an expired code is a normal outcome and not an error.
- **A repeated product id is one line, not two.** `cart_pricing` ignores a
  second occurrence of an id, so listing a product twice cannot inflate a
  subtotal, and `cart_items_cart_product_key` makes the duplicate unrepresentable.
- **A quantity is normalised, and the constraint is the boundary.**
  `cart_items_quantity_positive` rejects a zero, a negative or a value above 99
  even in a direct statement; `cart_pricing` clamps a unique piece to one and
  says that it did.
- **The guest-cart token is `httpOnly`.** It is written in exactly one module,
  it is not an authentication token, and it is never accepted as proof of
  identity.
- **A saved id cannot confirm that a draft exists.** `catalogue_by_ids` returns
  no row for a draft or archived product, so an id the browser holds is not an
  oracle for the catalogue.

#### Fixed

- **`aria-pressed` on a catalogue filter link failed WCAG and the browser
  audit.** Every filter row is an `<a>` that navigates, and `aria-pressed` is not
  permitted on a link: axe reports `aria-allowed-attr`, which failed
  `npm run audit:a11y` on `/collections/all` at desktop width, where the filter
  panel is expanded rather than folded into a drawer. This was a Phase 5 defect,
  reproduced on a clean checkout of the previous commit and red in CI on `main`
  (run `39125597185`). The selected state now uses `aria-current`, the attribute
  that means "current item in a set of links". `tests/catalogue-params.test.ts`
  guards it at source level, because jsdom does not run `aria-allowed-attr` — the
  same layout gap that hid the Phase 3 and Phase 4 defects.

#### Changed

- `scripts/a11y-audit.mjs` now audits `/cart` and `/wishlist`, so the two
  surfaces this phase adds are covered by the check that catches contrast and
  overflow. The audit is green across **10 pages × 4 viewports** plus the
  age-gate pass.
- `tests/a11y-shell.test.tsx` mocks `next/navigation`'s `usePathname`, which the
  header now needs.

#### Not done, and deliberately

- **No payment gateway, no card field, no provider.** `npm run check:no-payment`
  passes unchanged. Payment is settled offline by an administrator.
- **A cart does not reserve stock.** Nothing in the cart path decrements
  `inventory` or writes a reservation, and the copy says so. The piece is held
  when an order request is submitted and an administrator confirms it.
- **Submitting an order request is not built.** The path from a cart to a request
  is the next phase; the cart's control states that plainly rather than offering a
  button that leads nowhere.

### Phase 5 — Catalogue and discovery

**Date:** 2026-10-17

#### Added

**Catalogue query layer (`supabase/migrations/0010_catalogue_browsing.sql`)**

- `p_availability text` on `catalogue_filtered`, `catalogue_search` and
  `catalogue_facets`, accepting `any` / `available` / `reserved`. Availability is
  a real tri-state, not a boolean: a reserved watch is genuinely spoken for and
  must be distinguishable from one that is available.
- `p_exclude text` on `catalogue_filtered`, so each facet dimension counts
  against the other active filters but **not** its own. Without this, selecting a
  brand zeroed every other brand — a one-way filter list, which is a real UX
  defect rather than a cosmetic one.
- Availability values are the database's own (`available` / `reserved`), read
  through `is_product_available`, so the storefront cannot drift from the
  inventory rules.

**Catalogue view models and URL state (`src/lib/catalogue/`)**

- `types.ts` — `CatalogueProduct`, `FacetSet`, `FacetOption`, `CatalogueListing`
  and honest empty constructors. `source` distinguishes "the database answered
  and found nothing" from "the database did not answer"; only the first is a
  genuine empty result.
- `params.ts` — one validated, canonical representation of a listing:
  `parseCatalogueParams`, `buildCatalogueHref`, `canonicalListingPath`,
  `isIndexableListing`, `hasActiveFilters`, `countActiveFilterGroups`,
  `catalogueHiddenInputs`. Defaults are omitted when rendering a URL, so there is
  exactly one address for each logical page.
- `assemble.ts` — pure row-to-view-model conversion plus `paginationWindow`.

**Catalogue UI (`src/components/catalogue/`)**

- `catalogue-card.tsx` / `CatalogueGrid` — every value from the database; a
  price-on-request piece says "Request pricing & availability" rather than
  printing a number, and a reserved piece carries a "Reserved" badge instead of
  being hidden.
- `catalogue-filters.tsx` — link-based facets, so filters work without
  JavaScript and each combination is a real URL. `FilterRow`, `FacetGroup`,
  `ChoiceFilter`, `ConditionFilter`, `RangeFilter`, `BoxAndPapersFilter`,
  `AvailabilityFilter`, `ActiveFilterChips`.
- `listing-toolbar.tsx` — sort and page-size as a plain `GET` form carrying the
  active filters as hidden inputs, so sorting cannot silently drop a filter.
- `pagination.tsx` — crawlable page links, `aria-current` on the current page,
  and the range ends rendered as non-links rather than disabled anchors.
- `mobile-filter-drawer.tsx` — controlled Radix dialog that closes on a URL
  change, so tapping a filter cannot leave a stale overlay over the new results.
- `search-form.tsx` — `GET` search that preserves the active filters.

**Routes**

- `/shop` — the one canonical "everything" listing. `/collections/all`
  permanently redirects to it (308) so the old address and existing links keep
  working without two live URLs competing for the same grid.
- `/brands/[slug]` and `/collections/[slug]` — real scoped listings; an unknown
  or inactive slug is a `404`, not a `200` with an empty grid.
- `/search` — the listing with a `q` term, reusing the same RPC, facets and
  cards rather than a second result pipeline. Always `noindex, follow`.
- `/shop` added to the XML sitemap.

#### Changed

- Filtered, searched and sorted listings are `noindex, follow` and declare the
  clean listing as canonical. The decision comes from `isIndexableListing`, not
  from comparing the canonical path to `/shop` — filtering keeps the base path,
  so that comparison would have been true for both cases.
- `/products/[slug]` now resolves its identity through
  `fetchPublishedProductIdentity`, the function that actually exists.

#### Verified

- `npm run verify` green (248 unit tests across 13 files, typecheck, lint,
  format, no-payment guard, production build). `tests/catalogue-params.test.ts`
  covers the query layer directly, including the `isIndexableListing`
  invariant that the rendered-page check caught.
- `scripts/db-verify.sh` green on a reset database: all 10 migrations apply
  cleanly, all 6 RLS/auth suites pass, seeds are idempotent.
- Against a real PostgREST + database through the real `supabase-js` path:
  `/shop` renders 20 of 20; `availability=reserved` 4 and `availability=available`
  16 (partitioning correctly); `brand=rolex` 4; a combined brand+availability
  filter that matches nothing returns an honest empty state; `pageSize=12&page=2`
  returns 8; `sort=price_asc` matches the database ordering; a selected brand
  still lists the other brands' counts (facet self-exclusion); `/brands/rolex` 4,
  `/collections/featured` 6, `/search?q=rolex` 4; an invented brand slug 404s;
  `/collections/all` 308s to `/shop`.

---

### Phase 6 — Product detail page

**Date:** 2026-10-18

#### Security

**Closed a live column-level leak on `products` (`supabase/migrations/0011_product_detail.sql`).**

The `anon` role could read `cost_cents` and `compare_at_cents` directly. RLS
restricts rows, not columns, and the public-read policy is row-scoped, so both
columns were readable through PostgREST. This was proven against the real client
path before the fix:

```
GET /rest/v1/products?select=slug,price_cents,cost_cents&limit=1
→ [{"slug":"priced-watch","price_cents":1250000,"cost_cents":4200000}]
```

`cost_cents` is the business's cost basis. Exposing it to anyone with the public
anon key is a commercial-information leak, not a cosmetic one.

The fix revokes the table-level `select` grant from `anon` and `authenticated`
and re-grants only the public read surface column by column, so the sensitive
columns are now **hard-denied** rather than filtered to empty:

```
GET /rest/v1/products?select=slug,cost_cents&limit=1  → 401 42501 permission denied
GET /rest/v1/products?select=*&limit=1                → 401 42501 permission denied
GET /rest/v1/products?select=slug,title,price_cents   → 200 (public columns intact)
```

The distinction matters: an empty result would have been indistinguishable from
"this column is null", and a future `select('*')` would have silently succeeded
again. A `select('*')` now fails loudly, which is the outcome that keeps the
guarantee from eroding.

#### Added

**Database (`supabase/migrations/0011_product_detail.sql`)**

- `catalogue_similar(p_product_id uuid, p_limit integer)` — related products for
  the detail page. Ranks by shared model, then shared brand, then shared case
  material, and returns a `match_reason` so the page can explain the selection
  rather than asserting an unexplained "you may also like". Excludes the anchor,
  excludes unpublished rows, and is `stable` and read-only.
- `submit_product_question(...)` — the product enquiry. Validates name, email and
  message length, resolves the slug to a **published** product, enforces a
  per-address rate limit through `rate_limit_counters`, and writes an `inquiries`
  row of type `product_question`, returning a reference. `SECURITY DEFINER` with
  `set search_path = ''`, so the write does not depend on a public insert policy
  and cannot be redirected by a hostile `search_path`.

**Application**

- `src/lib/product/types.ts` — `ProductDetail`, `ProductDetailResult`
  (`ok` / `not_found` / `unavailable`) and `SpecRow`, `ProductImage`.
- `src/lib/product/assemble.ts` — pure row-to-view-model mapping, plus
  `productBreadcrumbs`. Image resolution is injected, so every state is testable
  without a database.
- `src/lib/product/enquiry.ts` — the Zod schema, the state type and the
  `safeDatabaseMessage` allowlist. Kept out of the action because a `'use server'`
  module may only export async functions, so these could not be unit-tested from
  there.
- `src/server/repositories/product-repository.ts` — `fetchProductDetail`,
  availability, `catalogue_similar` and `submit_product_question` calls.
- `src/server/services/product-service.ts` — three-state assembly, `cache`d per
  request so `generateMetadata` and the page share one round trip.
- `src/server/actions/product-actions.ts` — the `submitEnquiry` server action.
- Components: `breadcrumbs`, `product-gallery`, `price-block`, `spec-table`,
  `purchase-actions`, `enquiry-form`.
- `src/app/(site)/products/[slug]/page.tsx` — the real detail template, replacing
  the Phase 3 placeholder.

**Tests**

- `supabase/tests/17_product_detail.sql` — RLS and function behaviour: `anon`
  denied on `cost_cents` / `compare_at_cents` / `select *` / `order by cost_cents`;
  `catalogue_similar` never leaks a draft, never returns the anchor, and does not
  hide a published product whose taxonomy is inactive; question shape validation.
- `tests/product-detail-assembly.test.ts` — 17 cases over the honesty rules.
- `tests/product-enquiry-action.test.ts` — schema validation and the error
  allowlist, including that an unrecognised database error is hidden.
- `supabase/tests/10_public_boundary.sql` — assertion strengthened from
  "empty result" to "permission denied", which is the stronger guarantee the
  revoke now provides.

#### Changed

- `src/lib/seo/schema.ts` — `ProductSchemaInput.condition` was missing `unworn`,
  a real value of the `product_condition` enum, and `CONDITION_URL` had no entry
  for it. A product whose condition was `unworn` could therefore not be typed into
  the schema builder at all. `unworn` now maps to `NewCondition`, the term that
  asserts what "never worn" actually means.
- `src/server/services/product-service.ts` — dropped an unused `ProductDetail`
  type import.

#### Decisions

- **`generateStaticParams` returns `[]`.** The phase asks for it, and the shape
  matters more than the values: prerendering every product would freeze prices,
  stock and `lastmod` timestamps into the deployment, so the sitemap's freshness
  claim would be false. The page renders per request against the live row. It also
  keeps `next build` from needing a database, which matters because the Vercel
  build runs before any Supabase secret is necessarily present.
- **An unreachable database is a 200, not a 404.** Telling a visitor a watch does
  not exist when the fault is an outage would be false, and it would invite a
  crawler to drop a valid URL. The page states the problem plainly and is
  `noindex`.
- **The cart and wishlist controls are genuinely disabled, with a note.** There is
  no cart to add to until Phase 7 and no account until Phase 9. A live-looking
  button that discarded the click would be a lie; omitting the controls would hide
  a real planned feature. Both are rendered disabled with `aria-disabled`, a
  `title`, and visible text naming the phase.
- **The enquiry is the real call to action for this phase**, so it is a prominent
  in-page anchor and a working form, not a placeholder.
- **`offers` is emitted only for a genuine price.** A price-on-request piece makes
  no price claim in the JSON-LD at all. `priceMinor` is set from the same single
  decision that formats the visible price, so the two cannot disagree.
- **`product_questions` was left for its own purpose.** The public Q&A table
  exists, but an enquiry is private correspondence, so it is written to `inquiries`
  with `inquiry_type = 'product_question'` — the value the enum already reserves
  for it.

#### Fixed

- **Production-only 500 on `/products/[slug]`.** The page exported
  `generateStaticParams` while reading through the cookie-aware Supabase server
  client, so Next.js classified the route as SSG and then failed at request time
  under `next start` with `Page changed from static to dynamic at runtime ...
  reason: cookies`, returning a 500 for **every** product, published or not. It did
  not reproduce in `next dev`, and `next build` succeeded, so it was only visible
  by running the production server. Fixed with `export const dynamic =
  'force-dynamic'`; `generateStaticParams` is retained as the extension point for
  a future ISR decision. Verified after the fix: `priced-watch` 200,
  `draft-watch` 404, an invented slug 404, and a real full product 200 with 23
  spec rows, the related rail and both JSON-LD nodes. Recorded in `AGENTS.md` as a
  standing pitfall, because the same shape will recur on any future
  database-backed route.

#### Verified

- Migrations 0001–0011 apply cleanly from an empty database; seed is idempotent.
- `supabase/tests/17_product_detail.sql` and `10_public_boundary.sql` pass.
- The column leak is closed through the real `supabase-js` → PostgREST path, not
  only in SQL (401 `42501` on the sensitive columns, 200 on the public ones).
- `submit_product_question` returns a reference end to end; the sixth submission
  from one address is refused with the rate-limit message; a draft slug is
  refused with `Unknown product`.
- `catalogue_similar` on a real seed anchor returns same-model siblings first,
  then same-brand pieces, and no anchor or draft.
- Rendered pages against a production `next start`, not only `next dev`: a real
  published product returns 200 with 23 spec rows, the price-on-request prompt,
  the enquiry form, the related rail and `Product` + `BreadcrumbList` JSON-LD
  with **no** `offers` node; `priced-watch` returns 200 with a visible price and
  an `Offer` of `12500.00`; `draft-watch` and an invented slug both return 404.
- The enquiry submitted through the rendered `<form>` with **JavaScript disabled**
  returns 200 with a reference (`LW-26-100017`) and honest confirmation copy that
  claims no payment. This is the real progressive-enhancement path, not a
  simulated one.
- `npm run verify` passes: payment guard, format, lint, typecheck, 277 tests and
  `next build`. `/products/[slug]` builds as SSG with no prerendered params.
- `npm run check:no-payment` passes: no gateway, SDK, card field or payment
  webhook anywhere.

---

### Phase 4 — Homepage composition from database sections
**Date:** 2026-10-17

#### Added

**Homepage assembly (`src/lib/homepage/`)**

- `types.ts` — the homepage view models the components consume. They are
  deliberately not the database row types: a component must render from a
  fixture in a test without knowing about `sort_order`, `is_active` or
  `section_key`.
- `assemble.ts` — a pure function that turns `homepage_sections` rows plus their
  resolved references into an ordered render list. It is pure on purpose: the
  section order, filtering and fallback behaviour are unit-tested without a
  database or a browser.

**Homepage components (`src/components/homepage/`)**

- `hero-carousel.tsx` — three hero slides, keyboard operable, pausable and
  `prefers-reduced-motion` aware (satisfies WCAG 2.2.2 for the auto-rotation),
  with an honest "slide n of m" affordance.
- `sections.tsx` — the remaining section renderers (brand showcase, featured
  collection, brand story, new arrivals, browse brands, the sell/trade and
  sourcing CTAs, trust points, testimonials, newsletter, final CTA). Seventeen
  `section_key`s are handled in total — three hero slides, four trust points and
  ten singular sections — matching the demo seed exactly.
- `product-card.tsx` — reads every value from its props; shows the price or
  "Request pricing", and a Reserved badge driven by real availability.

**Data access**

- `src/server/repositories/homepage-repository.ts` and
  `src/server/services/homepage-service.ts` — the homepage read path, keeping
  queries out of the visual components.
- `src/server/repositories/catalogue-repository.ts` — minimal slug lookups so the
  catalogue routes can distinguish a real slug from an invented one.
- `src/lib/media.ts` — resolves a `storage_path` or a same-project
  `external_url` to an image URL, and returns `null` (rendering the labelled
  placeholder) for anything else. A third-party URL is rejected deliberately:
  the image config allowlists only the Supabase host, and hotlinking another
  business's photography is a licensing problem.

**Database**

- `supabase/migrations/0009_public_availability.sql` — the `product_availability`
  RPC, so availability is read from real inventory rather than inferred in the UI.
- `supabase/seed/03_homepage_demo.sql` — demo `homepage_sections` rows. Clearly
  labelled as demo; the mechanism is real, the copy is placeholder until the
  owner supplies content (A6).
- `supabase/tests/15_public_availability.sql` — proves the RPC returns the real
  answer, including `false` for a reserved piece.

**Routes**

- The root page (`src/app/(site)/page.tsx`) is now the database-driven homepage
  composition, replacing the Phase 1 placeholder.
- `/products/[slug]`, `/brands/[slug]` and `/collections/[slug]` are honest
  placeholders that validate the slug against the database and `notFound()` for
  an unknown, draft or archived slug.

**Verification tooling**

- `scripts/dev-postgrest-proxy.mjs` — strips the `/rest/v1` prefix so the real
  `@supabase/supabase-js` client path can be exercised against a local PostgREST,
  exactly as Kong routes it in a real project.
- `tests/homepage-assembly.test.ts` and `tests/homepage-components.test.tsx`.
- `tests/chrome.test.tsx` — two regression tests for the logo link's accessible
  name (see Fixed below).
- `scripts/a11y-audit.mjs` now also audits `/brands/rolex`.

#### Changed

- `src/components/ui/button.tsx` — the button variants the homepage CTAs need.
- `src/lib/database.types.ts` — regenerated for migration 0009.
- `axe-core` is now pinned to `4.14.0` instead of `^4.11.0` (see Fixed below).

#### Verification

- `npm run verify` green: lint, typecheck, **216 tests** (up from 163), build.
- Homepage rendered against a real PostgreSQL database through PostgREST:
  `h1` "Timepieces chosen one at a time", 13 `h2`s, 8 product links, 5 brand
  links, 12 "Request pricing", 6 "Reserved", an `ItemList` JSON-LD block, and no
  fallback path taken.
- `product_availability` confirmed to return a real `false` for the reserved
  piece.
- Route checks: `/`, `/brands`, `/brands/rolex`, a real product slug and
  `/collections/featured` return 200; invented slugs and brands, and draft or
  archived products, return 404 — the RLS policy decides, not application code.
- `npm run audit:a11y` green across 7 pages × 4 viewports (mobile-320/390,
  tablet-768, desktop-1440), plus the age-gate pass — 30 checks in total, with
  no critical or serious violation and no horizontal overflow.
- Lighthouse against a production build: **desktop 100/100/100/100**; **mobile
  performance 95–97** with accessibility, best practices and SEO all 100 (CLS 0,
  TBT 80–120 ms, LCP 2.3–2.9 s). The mobile performance shortfall and its
  diagnosis are recorded honestly as G19 rather than rounded up.

#### Fixed

- **The logo link failed WCAG 2.5.3 (Label in Name) on every page.** The link
  carried `aria-label="{business} — home"`, and an `aria-label` *replaces* the
  name computed from the link's contents. Because the link also renders the
  business name and the tagline, the visible text was no longer contained in the
  accessible name, which axe reports as `label-content-name-mismatch`
  (serious). The hint is now a `sr-only` "— Home" text node inside the link, so
  the accessible name is the visible text plus the hint. `sr-only` is out of
  flow, so it cannot affect layout.
- **Why CI passed while the defect was real.** This was diagnosed rather than
  assumed, and the cause was *not* the fallback/database chrome split. `axe-core`
  was declared as `^4.11.0`, so the lockfile pinned `4.11.0` and CI's `npm ci`
  installed that; the local `node_modules` had drifted to `4.14.0`. Bisecting the
  rule across `4.11.0`, `4.12.0`, `4.13.0` and `4.14.0` showed that `4.11.0`
  through `4.13.0` do **not** flag this markup at any of the four viewports,
  while `4.14.0` does — so CI was running an older detector with a blind spot,
  and the bug was always present in the source. `axe-core` is now pinned exactly
  so the CI and local detectors cannot diverge again, and the two regression
  tests below assert the invariant in jsdom (where axe skips the rule, because it
  needs layout).
- The homepage no longer renders a static placeholder; it renders real database
  rows in the order the admin sets.

#### Known limitations added

- G17 (placeholder catalogue routes), G18 (demo homepage seed), G19 (mobile
  Lighthouse 95–97) and G20 (no font preload hints). G14 was resolved.

---

### Phase 4 follow-up — failing CI audit diagnosed and fixed
**Date:** 2026-10-17

The `browser-audit` CI job (run `38999968219`) failed on the accessibility step.
It was **not** the axe rule from the Phase 4 entry above; it was a navigation
timeout, and the root cause was a real product bug that the audit had surfaced.

#### Fixed

- **The not-found page linked to `/collections`, which is not a route.** The
  catalogue lives at `/collections/all` and `/collections/[slug]`; the bare path
  has no page. A visitor clicking "Browse the catalogue" was sent to a 404, and
  the `next/link` prefetch for that path never settled, so the audit's
  `networkidle` wait exceeded its 30 s timeout on any page that rendered the
  template. CI hit it on `/brands/rolex`, which falls back to the not-found
  template when no database is configured. Corrected to `/collections/all`.
- **The not-found page's primary CTA failed WCAG AA colour contrast.** It used
  `bg-accent` — the brand gold `gold-500` (`#a18040`, ~3.4:1), which
  `globals.css` documents as safe for large text only — under a normal-size
  white label. The route error boundary (`src/app/error.tsx`) had the same
  defect. Both now use the contrast-checked `Button` primary variant /
  `bg-gold-700` (`#806428`, 5.6:1).

#### Added

- `tests/design-tokens.test.ts` — a source-level guard that fails if any file
  reintroduces `bg-accent` as a background. This class of bug is invisible to
  jsdom (axe skips colour contrast without layout), so it is asserted against
  the source rather than the rendered DOM. Verified by reintroducing the bug and
  watching the guard fail.
- `scripts/a11y-audit.mjs` now audits `/this-page-does-not-exist` in every
  configuration, so the not-found template is checked directly. `/brands/rolex`
  cannot stand in for it: that path renders a real brand page when a database is
  configured and only reaches the template when one is not, so the template would
  go unaudited in exactly the configuration CI runs.

#### Verification

- `npm run verify` green: lint, typecheck, **217 tests** (up from 216), build.
- `npm run audit:a11y` green across **8 pages × 4 viewports** plus the age-gate
  pass, run against a production build with **Supabase unconfigured** — the
  configuration that CI uses and the one that reproduces the failure. Three
  consecutive runs were identical.
- CI green on run `39079548258` for commit `e68e445`: all three jobs passed
  (lint/typecheck/test/build, migrations/RLS/concurrency, and the accessibility
  and responsive audit that had failed on run `38999968219`). G13 is resolved.

#### Known limitations added

- G22 (contrast failure, resolved), G23 (broken link, resolved) and G24 (the
  sandbox's git-ignored `.env.local` and local database were lost with `/tmp`;
  no secret lost, recreated from `.env.example`).

#### Process note

A stale `next-server` left over from an earlier session was found to be serving
a previous build on the audit port. Because Next.js renames its process, the
`pkill -f "next start"` used to stop it never matched, so early audit runs in
this session measured the wrong build and produced inconsistent results. The
audit was re-run against a fresh build on a verified-free port. The pitfall is
now recorded in `AGENTS.md`.

---

### Phase 3 — Luxury design system, shared layout and responsive navigation
**Date:** 2026-10-17

#### Added

**Design tokens (`src/app/globals.css`)**

- A neutral ink ramp (`ink-50`…`ink-950`), a gold accent ramp, line and surface
  tokens, and semantic aliases (`background`, `foreground`, `foreground-muted`,
  `accent-text`, `border`). Every text token is contrast-checked rather than
  chosen by eye.
- Display and body font stacks, a content container width, and `eyebrow`,
  `container-page` and `glass-panel`/`glass-panel-strong` utilities.
- A `prefers-reduced-motion` block that suppresses transitions and animations
  globally, and a viewport that allows pinch-zoom.

**Component primitives (`src/components/ui/`)**

- `button` (five variants, five sizes, `asChild` support), `input`, `badge`,
  `section` (`Card`, `SectionHeading`), `skeleton`, `states` (`EmptyState`,
  `ErrorState`), `media-frame`, `accordion`, `drawer`, `dropdown-menu`.

**Chrome (`src/components/chrome/`)**

- `site-header`, `site-footer`, `desktop-nav` (Radix NavigationMenu mega menu
  with Brand → Model panels), `mobile-nav` (Radix Dialog drawer with an
  accordion), `announcement-bar` (dismissible, pausable), `header-actions`,
  `wordmark`, `footer-parts`, `planned-page`.
- `age-gate` — an accessible Radix Dialog gate, driven by `site_settings`
  (`age_gate_enabled`, `age_gate_minimum_age`) with the environment flag as the
  fallback when no settings row exists.

**Navigation assembly (`src/lib/navigation/`)**

- `types.ts` — the view-model contract between the database and the chrome.
- `assemble.ts` — pure row-to-view-model functions (`buildIdentity`,
  `buildAgeGate`, `buildHeaderNav`, `buildFooterColumns`, `buildAnnouncements`),
  tested directly because tree assembly is the part worth testing.
- `fallback.ts` — the fixture used when Supabase is unconfigured or unreachable.

**Chrome data access**

- `src/server/repositories/navigation-repository.ts` — the six queries that feed
  the chrome, selecting only the columns the view models need.
- `src/server/services/chrome-service.ts` — `getChrome`, which degrades in three
  documented states (database, unconfigured, query failure) and is wrapped in
  React `cache()` so the header, footer and drawer share one set of queries.

**Public route group (`src/app/(site)/`)**

- A layout that renders the header, footer and age gate once, with
  `revalidate = 300` and a documented trade-off.
- Fourteen placeholder routes that every navigation link resolves to. Each states
  plainly which phase fills it, so the navigation is honest rather than a set of
  404s. `scripts/generate-placeholder-routes.py` keeps them byte-identical.
- `design-system` — an inspectable reference page (`noindex`, unlinked) showing
  every token and primitive.

**Verification tooling**

- `scripts/a11y-audit.mjs` — a layout-aware audit that drives real Chromium
  against a real build and checks six pages at four viewports, plus the age gate
  open at 320px. It exists because jsdom cannot lay out a document, so axe skips
  every geometry-dependent rule there, colour contrast above all.
- `tests/a11y-shell.test.tsx` and `tests/chrome.test.tsx` — axe over the shell in
  jsdom, and behavioural tests for the drawer, accordion, header actions and age
  gate.
- A `browser-audit` CI job, so the browser-dependent rules run on every push.

#### Fixed

- **`media-frame` placeholder failed WCAG AA.** It used `text-ink-400` on
  `bg-surface-100`, which is 4.17:1 — below the 4.5:1 minimum for normal text.
  The placeholder is now `text-ink-500` (5.27:1). Found by the real-browser
  audit, not by the jsdom suite, which cannot see colour contrast.
- **The header overflowed horizontally at 320px.** Three separate causes, all
  fixed: the menu button could shrink below its 44px touch target because it
  lacked `shrink-0`; the desktop navigation wrapper kept its `ml-6` and `flex-1`
  while its contents were hidden below `lg`, occupying 24px of a 320px row; and
  four 44px action icons plus the wordmark exceeded the available width. The
  wrapper is now `hidden lg:block`, Account and Wishlist move into the drawer
  below `sm`, and the wordmark truncates rather than pushing the row wider.
- **Duplicate navigation landmark.** The header rendered `<nav>` inside `<nav>`.
  The outer element is now a plain `<div>`, leaving exactly one labelled
  `nav aria-label="Primary"`, as axe's `landmark-unique` rule requires.
- **`text-ink-400` was used for readable text in six places.** All are now
  `text-ink-500`, except the dropdown's disabled state, where WCAG exempts
  disabled controls and the lower contrast is the signal. A token test and a
  source scan enforce the rule.

#### Changed

- `tests/design-tokens.test.ts` gained a `muted text tokens are contrast-safe on
  every surface` block. It asserts `ink-500` clears 4.5:1 on both light
  surfaces, records *why* `ink-400` is not a text token, and scans `src/` so the
  class cannot be reintroduced by copy-paste. Verified to fail on the original
  defect and name the offending file.
- `package.json` gained `audit:a11y`.
- `vitest.config.ts` gained `setupFiles: ['tests/setup.ts']` (matchMedia and
  ResizeObserver polyfills, which Radix needs under jsdom).

#### Verification

- `npm run check:no-payment` — passed. No gateway, SDK, card field or payment
  webhook.
- `npm run format:check` — passed.
- `npm run lint` — passed, no warnings.
- `npm run typecheck` — passed.
- `npm test` — **163 tests in 10 files, all passing** (was 106 after Phase 2).
- `npm run build` — passed; 25 static pages.
- `scripts/a11y-audit.mjs` — **24 page/viewport combinations plus 2 age-gate
  passes, zero critical or serious violations and zero horizontal overflow.**
  The age-gate pass asserts the dialog actually opened, so it cannot pass
  vacuously.
- All eleven previously-verified routes still return 200.
- The contrast guard was tested against the original defect and fails as
  intended, naming `src/components/ui/media-frame.tsx`.

#### Acceptance criteria

All Phase 3 criteria met except one, recorded honestly:

- Chrome renders from database navigation data — **met**, with the fallback
  fixture in use only while Supabase is unconfigured (A1). The fallback is
  labelled as such in the UI.
- Keyboard-only pass: skip link → header → mega menu → footer — **met**;
  exercised in `tests/chrome.test.tsx` and by the Radix primitives.
- axe reports no critical or serious violations on the shell — **met**, in both
  jsdom and a real browser.
- Mobile drawer behaves correctly at 320px and up — **met**; the 320px overflow
  was found and fixed.
- Age gate (in the phase scope) — **met**, driven by `site_settings`.

#### Honest limitations recorded

- The age gate is a legal affordance, not a security control. It is bypassable by
  clearing storage and is documented as such in the component.
- The gate is not in the first paint, because the visitor's answer lives in
  `localStorage` and the server cannot read it. This is a deliberate trade-off
  that avoids showing the gate to returning visitors.
- Lighthouse has not been run in this phase. It is scheduled for Phase 14, and no
  score is claimed here.

---

### Phase 2 — Database schema, migrations, RLS and authorisation foundation
**Date:** 2026-10-17

#### Added

**Migrations (`supabase/migrations/`)** — 8 files, applied in order, all verified
against a real PostgreSQL 17 instance from an empty schema.

- `0001_extensions_enums_helpers.sql` — `pgcrypto` and `citext` (installed into
  the `extensions` schema, as Supabase does), 13 enum types, `set_updated_at()`,
  `normalize_slug()`, and the order-reference sequence and generator.
- `0002_accounts_profiles_roles.sql` — `profiles`, `user_roles`, `addresses`, and
  the `on_auth_user_created` trigger that creates a profile for every new user.
- `0003_catalogue.sql` — `brands`, `models`, `products`, `product_images`,
  `product_specs`, `collections`, `collection_products`, `inventory`,
  `inventory_transactions`, with the full-text search index and the partial
  indexes for featured and priced products.
- `0004_commerce.sql` — `payment_methods`, `delivery_options`, `carts`,
  `cart_items`, `order_requests`, `order_request_items`, `order_request_events`,
  `inventory_reservations`. No table has any column able to hold card data.
- `0005_service_requests.sql` — the five service flows (sell/trade, sourcing,
  repair, appointment, contact) each with a request table and an append-only
  update table, plus `product_questions`, `messages` and `notifications`.
- `0006_content_and_config.sql` — `pages`, `faqs`, `announcements`,
  `testimonials`, `navigation_items`, `homepage_sections`, `media`,
  `site_settings`, `newsletter_subscribers`, `admin_audit_logs`,
  `rate_limit_counters`.
- `0007_rls_policies.sql` — the role helpers (`is_staff`, `is_admin`,
  `has_role`, `has_permission`, `role_permissions`), the permission map, RLS
  enabled on all 47 tables, and 96 policies.
- `0008_order_submission_and_reservations.sql` — `reserve_inventory`,
  `release_reservation`, `confirm_reservation`, `submit_order_request`, and the
  status-change trigger that releases or converts a reservation.

**Authorisation design**

- Roles live in `user_roles`, **not** on `profiles`. A role column on a row the
  user can update would put the highest-value column in the schema one policy
  mistake away from privilege escalation. Splitting the tables removes the
  writable surface entirely. This is a deliberate change from the Phase 0 plan;
  the reasoning is recorded in `DATABASE_SCHEMA.md` §6.1.
- All helpers are `SECURITY DEFINER` with `set search_path = ''` and
  fully-qualified references, so a hostile `search_path` cannot redirect them.
- `has_permission()` is the single primitive that both the service layer and the
  RLS policies call, so a rule cannot drift between the two.
- `user_roles.expires_at` lets a temporary grant lapse with no manual revoke;
  every helper ignores expired rows.
- `admin_audit_logs` has a `SELECT` policy and no write policy at all — not even
  `SUPER_ADMIN` can write it through the API.

**Database tests (`supabase/tests/`)**

- `00_supabase_shim.sql` — emulates Supabase's `auth` schema and API roles so the
  suites run without a Supabase project. A test fixture, not a deployment
  artifact.
- `10_public_boundary.sql` — anonymous visitors read the published catalogue and
  nothing else, across 20 private tables, with a positive control so the denials
  are not vacuous.
- `20_customer_ownership.sql` — ownership isolation between customers, including
  that internal notes stay hidden on the customer's own record.
- `30_role_escalation.sql` — the decisive test: no customer can grant themselves
  a role; each staff role's permission boundary; `ADMIN` is not `SUPER_ADMIN`;
  expired roles grant nothing.
- `40_order_and_inventory.sql` — server-derived totals, price-on-request
  recording no amount, disabled payment methods rejected, and a schema-wide
  assertion that no column can hold card data.

**Concurrency proof (`scripts/db-concurrency-matrix.py`)**

Five scenarios run against real Postgres, launching 8 concurrent order
submissions for a product with 1 unit in stock. The row lock and the
`inventory_reserved_within_quantity` check constraint are each **independently**
sufficient to hold the invariant; only removing both breaks it (8/8 racers
succeed, stock reaches −7). Scenario 5 is the negative control that proves the
test can fail.

**Catalogue seed (`supabase/seed/01_catalogue.sql`)**

4110 products across 4 brands and 41 model families, with 8785 specification
rows, generated by `scripts/generate-catalogue-seed.py`. Every product is seeded
as `draft` so nothing appears on the storefront until published deliberately. No
images, no marketing prose and no prices are seeded — the reference site's
photography and text are its own content, and every product is
`price_on_request`, matching how the reference catalogue presents itself. The
seed is idempotent and verified to be so.

**Generated types**

- `src/lib/database.types.ts` — replaced the Phase 1 placeholder with the real
  generator output: all 47 tables and 13 enums. Regeneration instructions are in
  `DATABASE_SCHEMA.md` §1.3.

**Documentation**

- `DATABASE_SCHEMA.md` — ERD, every table, every enum, the constraints that carry
  business meaning, the authorisation model, the concurrency proof, the seed's
  contents and deliberate omissions, and the schema's known limitations. Every
  claim was read back from the running database rather than restated from intent.
- `ARCHITECTURE.md` — data model section updated to reflect the schema as built.

**CI**

- `.github/workflows/ci.yml` — new `database` job running on a PostgreSQL 17
  service container. Applies the shim, all migrations, all four RLS suites, and
  the five-scenario concurrency matrix on every push. The schema is the security
  boundary, so a migration that quietly drops a policy fails the build.
- `scripts/db-verify.sh`, `scripts/db-concurrency-test.py`,
  `scripts/db-concurrency-matrix.py` — now dual-mode: they use a direct `psql`
  connection when `PGHOST` is set (the CI path) and a Docker container otherwise.
  `db-verify.sh` fails loudly if `PGHOST` is set without a `psql` client, rather
  than silently falling back to a daemon CI does not have.

#### Changed

- `scripts/check-no-payment-providers.mjs` — the content checks now support a
  `payment-guard:allow` line marker, needed because two files legitimately name
  card fields in order to assert their absence. The marker is restricted to a
  small explicit file allowlist and cannot suppress the dependency, secret-key or
  webhook-route checks, so it cannot be used to smuggle a real integration past
  the guard. Both restrictions were verified against adversarial fixtures.
- `supabase/migrations/0006_content_and_config.sql` — `gen_random_bytes` is now
  schema-qualified as `extensions.gen_random_bytes`, because Supabase installs
  `pgcrypto` outside `public`.

#### Fixed

- `package.json` — `npm run verify` did not run `format:check`, even though CI
  did. A formatting failure therefore passed locally and failed on GitHub, which
  is exactly the kind of divergence a local gate exists to prevent. `verify` now
  runs the same steps in the same order as the CI job.
- `DATABASE_SCHEMA.md`, `README.md` — reformatted by Prettier, which the above
  omission had allowed to slip through.
- `DATABASE_SCHEMA.md`, `AGENTS.md` — the seed section described a verified
  database as showing 4119 products and 9 fixtures. Measured directly, the
  suites leave 10 fixture products (`SKU-DRAFTORD` had been missed), so the real
  figure is 4120 products and 5 brands. The behaviour behind the discrepancy is
  recorded as G9 in `KNOWN_ISSUES.md`.
- `scripts/db-concurrency-test.py` — the harness was proving nothing. It
  backgrounded jobs through `docker exec -i`, which attaches stdin and caused the
  racers to be suspended with `SIGTTIN` instead of racing, and the critical
  section was too short for overlap to occur. The racers are now launched as
  separate processes before any is awaited, and `--slow-window` widens the
  read-to-write gap so contention is certain rather than hoped for. The
  negative-control modes exist so the test can be shown to fail.

### Phase 1 — Application foundation, configuration and quality baseline
**Date:** 2026-10-17

#### Added

**Application foundation**
- `package.json` — pinned, mutually compatible dependency set. Node `>=20.9.0`.
  `overrides.postcss` pins `8.5.30` to remove a known vulnerability (see
  *Fixed* below).
- `tsconfig.json` — `strict: true`, plus `noUncheckedIndexedAccess`,
  `noImplicitOverride` and `noFallthroughCasesInSwitch`; `@/*` path alias.
- `next.config.ts` — security headers on every response; `X-Robots-Tag:
  noindex` and `Cache-Control: no-store` on private paths; Supabase Storage
  added to `images.remotePatterns` only when the project URL is configured;
  `poweredByHeader` disabled; build fails on type and lint errors.
- `postcss.config.mjs`, `eslint.config.mjs` (flat config, with explicit
  `jsx-a11y` rules and `consistent-type-imports`), `.prettierrc.json`,
  `.prettierignore`.
- `.gitignore` — created **before** the first dependency install, so
  `node_modules/`, `.next/`, `.env.local` and Supabase local artefacts were never
  at risk of being committed.
- `vitest.config.ts` — Node environment, `@` alias, V8 coverage.

**Configuration and secrets handling**
- `src/lib/env.ts` — public environment. Validates lazily and **never throws at
  import time**, so a missing variable cannot break `next build`. Collects every
  problem at once through `collectPublicEnvIssues()`, and reports presence as
  booleans only.
- `src/lib/env.server.ts` — server-only environment, guarded by `import
  'server-only'`. Exposes `requireServiceRoleKey()` and
  `requireRevalidationSecret()` for the point of use.
- `.env.example` — every variable the project needs, with setup notes per
  service and no secret values.

**Supabase access pattern**
- `src/lib/supabase/browser.ts` — anon-key client for Client Components.
- `src/lib/supabase/server.ts` — two server clients, because Next.js only allows
  cookie writes in a Server Action or Route Handler: a read-only variant for
  Server Components and a writable variant for actions and handlers.
- `src/lib/supabase/admin.ts` — service-role client guarded by `server-only`.
- `src/middleware.ts` — refreshes the Supabase session on navigation, which is
  the only place a Server Component's refreshed token can actually be persisted.
  Returns early and harmlessly when Supabase is unconfigured.
- `src/lib/database.types.ts` — clearly marked placeholder, to be replaced by
  `supabase gen types` output in Phase 2. Intentionally empty rather than filled
  with invented tables.

**Error handling and logging**
- `src/lib/errors.ts` — `AppError` with an HTTP status per code, safe
  client-facing messages, `toErrorResponse()`, `handleServerError()` and
  `withErrorHandling()`. Internal messages, causes and stack traces never cross
  the boundary to the client.
- `src/lib/logger.ts` — structured single-line JSON logging with recursive
  redaction of credential-shaped keys, depth-limited and length-capped.

**Shell, styles and boundaries**
- `src/app/layout.tsx` — `lang`, self-hosted `next/font` (Cardo + Nunito),
  metadata defaults, `metadataBase`, a skip link, and site-wide
  Organization/WebSite JSON-LD emitted once.
- `src/app/globals.css` — design tokens for the gold accent, neutral surfaces,
  status colours, typography, spacing and motion, mapped into Tailwind v4
  `@theme`; semantic aliases; base layer with a visible focus ring,
  `prefers-reduced-motion` handling and no zoom blocking.
- `src/app/page.tsx` — a real status page reporting genuine configuration state.
  No product catalogue is mocked, per the Phase 1 rule against inventing data.
- `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx` —
  boundaries that show a correlation digest, never an internal message.
- `src/app/icon.svg`.

**SEO**
- `src/lib/seo/metadata.ts` — canonical URLs, Open Graph, Twitter cards, robots
  directives, `noIndexMetadata()`, and `buildListingMetadata()` for facet
  canonicalisation.
- `src/lib/seo/schema.ts` — Organization, LocalBusiness, WebSite + SearchAction,
  BreadcrumbList, ItemList, Product and FAQPage builders, plus a `@graph`
  wrapper with stable `@id` values.
- `src/lib/seo/sitemap.ts` — sitemap entries, honest `lastmod` handling, and the
  cache tags that keep the sitemap from going stale.
- `src/components/seo/json-ld.tsx` — JSON-LD renderer that escapes `<` and `>`.
- `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/manifest.ts` — crawl rules,
  the sitemap (real routes only), and the web manifest.
- `src/app/api/health/route.ts` — reports configuration state as booleans.
- `docs/SEO.md` — the SEO approach and Google's official AI-search guidance.

**Quality baseline and CI**
- `tests/` — 106 real assertions across 7 suites: environment validation and
  graceful degradation, log redaction, error handling and non-leakage, schema.org
  pricing and brand honesty, sitemap `lastmod` honesty, design-token contrast
  computed from the real WCAG formula, and behavioural tests proving the payment
  guard actually rejects violations.
- `scripts/check-no-payment-providers.mjs` — fails the build if a payment
  dependency, gateway host, card field, payment webhook or provider-named route
  is introduced. Scans both content and file paths.
- `.github/workflows/ci.yml` — `npm ci` → payment guard → format check → lint →
  typecheck → test → build, on Node 22, with least-privilege permissions.
- `README.md` — local setup, scripts, environment variables, Vercel deployment.
- `docs/SECURITY_HEADERS.md` — active headers and the reason CSP is prepared and
  documented rather than guessed at.

#### Fixed
- **`postcss` vulnerability (high).** `next@15.5.28` pins `postcss@8.4.31`,
  which is affected by GHSA-qx2v-qp2m-jg93 and related source-map disclosure
  advisories. The only fix npm offered was a semver-major upgrade to Next 16,
  which the binding project decision forbids. Resolved instead with a targeted
  `overrides.postcss: 8.5.30`. Verified: Next resolves the patched version,
  `npm audit --omit=dev` reports **0 vulnerabilities**, and the production build
  and full test suite still pass.

#### Changed
- `.example.env` (1 byte, empty, misnamed, read by no tool) was **deleted** and
  replaced by `.env.example`, as scheduled in Phase 0.

#### Decisions recorded
- **Prettier added**, because the Phase 1 scope names it. `eslint-config-prettier`
  is applied last so formatting rules do not conflict with lint rules.
- **ESLint pinned to 9.39.5.** `eslint-config-next@15` does not support ESLint 10;
  installing ESLint 10 would break linting entirely. ESLint 9.39.5 is marked
  unsupported upstream but is the version Next 15 actually works with.
- **TypeScript pinned to 5.9.3.** npm `latest` for TypeScript is now 7.x, which
  is far ahead of what Next 15 and the ecosystem are tested against.
- **Vitest pinned to 3.2.7.** `latest` is 5.x; 3.2.7 is the version compatible
  with the current Vite and Node baseline.
- **CSP deliberately deferred, not omitted.** A restrictive CSP shipped before
  the real asset graph is audited breaks the app, and one that is loosened under
  pressure until it allows everything creates false confidence. The intended
  policy is documented in `docs/SECURITY_HEADERS.md` and tracked in
  `KNOWN_ISSUES.md` with an owning phase.
- **HSTS omits `preload`.** Preload is effectively irreversible; it is added only
  once the owner confirms every subdomain is HTTPS-only.
- **No `llms.txt`.** Google Search ignores it. The absence is intentional and
  documented, with a source, in `docs/SEO.md`.

#### Verification
- `npm ci` — clean install from the committed lockfile: **pass** (431 packages).
- `npm run check:no-payment` — **pass**.
- `npm run format:check` — **pass**.
- `npm run lint` — **pass**, 33 files scanned, 0 problems.
- `npm run typecheck` — **pass**.
- `npm test` — **pass**, 7 suites, 106 tests.
- `npm run build` — **pass**, 8 routes generated.
- `npm audit --omit=dev` — **0 vulnerabilities**.
- **GitHub Actions CI — green on `main` for commit `4e65779`.** All ten steps passed: install
  (`npm ci`), payment guard, format check, lint, typecheck, test and build, on Node 22.
- Runtime checks against a production server on port 3100:
  - `/` → 200, `/api/health` → 200, `/robots.txt` → 200, `/sitemap.xml` → 200,
    unmatched route → 404.
  - All seven security headers present on `/`.
  - `X-Robots-Tag: noindex, nofollow` present on a private path.
  - `robots.txt`, `sitemap.xml` and the JSON-LD graph inspected and correct.
  - `/api/health` correctly reports `degraded` with no secrets configured.
  - No secret material found in any `.next/static/` client chunk.

#### Acceptance criteria — Phase 1
All met. See the Phase 1 section of `IMPLEMENTATION_PLAN.md`.

---

### Phase 0 — Project contract, repository audit and reference analysis
**Date:** 2026-10-16

#### Added
- `REFERENCE_ANALYSIS.md` — direct audit of https://carbonwatchcompany.com/ covering:
  - platform and theme identification (Shopify, `OMRUs - Slate Edit` / `Minimog - OS 2.0` 5.5.0, USD/en)
  - extracted design tokens (gold `161,128,64` accent, Cardo display serif, Nunito body sans, light
    and dark themes, 8px spacing rhythm)
  - full route taxonomy from the XML sitemaps: 15 pages, ~44 collections across a Brand → Model
    two-level taxonomy plus merchandising collections, flat SEO-descriptive product slugs, 1 blog
  - global chrome: top bar, dismissible rotating announcement bar, header, four-column mega menu,
    overlay search with Popular Searches, age-verification gate, four-block footer, cart drawer
  - home page section-by-section composition, collection (PLP) anatomy with the nine sort options,
    product detail (PDP) anatomy with dual CTAs and the inquiry form field set
  - the three service flows (sell/trade, sourcing, repair & restoration) and the contact page
  - mobile behaviour, accessibility findings and SEO findings
  - nine concrete opportunities to improve on the reference
  - an explicit table of **known access limitations** (JS-rendered account, cart, search, mega menu
    and filter states were not observable; only one of five product sitemaps was sampled)
  - the legal stance: structure and interaction patterns only; no copied source, assets or long text;
    no claim of authorised-dealer status
- `ARCHITECTURE.md` — the technical contract:
  - stack decisions, with a recorded reason for staying on Next.js 15.x and for standardising on npm
  - the repository audit result
  - system context diagram (no payment provider appears in it, by design)
  - full route architecture for the public storefront and the `/admin` surface
  - the complete target data model: catalogue, commerce-without-payments, inquiries, content and
    configuration, accounts and auth
  - the two-client Supabase access pattern and the service → repository layering rules
  - thirteen explicit security boundaries
  - the order-request flow end to end, with its honesty requirements and the invariant that stock is
    reserved by an admin, not by submission
  - the Resend email flow with its non-blocking failure semantics
  - the SEO architecture, including faceted-navigation canonicalisation and the honest stance on
    `<lastmod>` as a crawl hint
  - the Lighthouse strategy, Vercel deployment assumptions, the environment-variable list, the
    testing strategy and the explicit non-goals
- `IMPLEMENTATION_PLAN.md` — the phase-by-phase plan (Phases 0–15) with, for each phase, its scope,
  its acceptance criteria and its dependencies; plus twelve project-wide invariants that apply to
  every phase
- `KNOWN_ISSUES.md` — an honest register grouped into owner-side setup, reference access limitations,
  repository/environment issues, security items, quality/performance risks and open questions, each
  with severity, status and a concrete next action
- `.env.example` — every environment variable the project will need, with names and setup notes only
  and no secret values

#### Changed
- Nothing. This phase made **no** changes to application code, because there is none yet.

#### Decisions recorded
- **Package manager: npm.** The repository has no `package.json` and no lockfile, so there is no
  existing convention to respect. npm 11.19.1 is available in the environment and is Vercel's
  default. Recorded rather than changed silently later.
- **Next.js 15.x, not 16.** The binding project decision names Next.js 15; npm `latest` is currently
  16.4.2. Staying on 15 is compliance, and the upgrade is the owner's decision.
- **Scaffolding in place is justified.** The repository contains only `.git/` and a 1-byte
  `.example.env`, so building a new application here is not a needless rewrite. This is the
  documented reason required by the phase rules.
- **`.example.env` will be removed in Phase 1** and replaced with `.env.example`. It is empty and
  misnamed, so no tool reads it and it misleads setup.

#### Verification
- Repository inspected: `git log` (1 commit), `git status` (clean), file tree (2 entries), tool
  versions (Node 24.21.0, npm 11.19.1), network reachability of the npm registry and the reference
  site.
- Reference audited by direct HTTP retrieval: `sitemap.xml` and its 8 child sitemaps, `robots.txt`,
  the home page, a brand collection page, a product page, the cart, the contact page, the FAQ page,
  the about page, the three service pages and the blog index.
- No build, lint, typecheck or test run was possible in this phase because no application exists.
  This is expected and is recorded rather than reported as a pass.

#### Acceptance criteria
All Phase 0 acceptance criteria met. See the Phase 0 section of `IMPLEMENTATION_PLAN.md` for the
item-by-item confirmation.

---

## [0.0.0] — 2026-10-16

### Added
- `Create .example.env` (`c658c2b`) — the repository's initial and only prior commit.

*Recorded for completeness. This commit predates the project audit; the file is empty and is
scheduled for removal in Phase 1.*

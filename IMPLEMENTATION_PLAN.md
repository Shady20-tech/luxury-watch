# Implementation Plan — Luxury Watch E-commerce Platform

Last updated: 2026-10-18 (end of Phase 7, both passes; order-request flow)
Reference: https://carbonwatchcompany.com/ · Deployment: Vercel · Data: Supabase · Email: Resend
Payments: **manual/offline selection only — no gateway, no online processing**

---

## How to read this plan

Each phase is delivered as a separate prompt by the project owner and executed **one at a time**.
Before starting any phase, the agent must read:

1. `IMPLEMENTATION_PLAN.md` (this file)
2. `CHANGELOG.md`
3. `KNOWN_ISSUES.md`
4. `ARCHITECTURE.md`
5. `DATABASE_SCHEMA.md` (once it exists, from Phase 2 onward)
6. `REFERENCE_ANALYSIS.md` (for UI/IA work)

This ordering exists so each phase continues the real implementation instead of starting over.

**Phase status key:** `done` · `in progress` · `not started` · `blocked`

> The phase titles below are the plan for the build. Phase 0 is the only phase whose full prompt has
> been supplied and executed so far. Later phases will be issued by the owner; where the owner's
> wording differs from this plan, the owner's wording wins and this plan is updated to match.

---

## Phase summary

| # | Phase | Status | Depends on |
|---|---|---|---|
| 0 | Project contract, repository audit and reference analysis | **done** | — |
| 1 | Foundation: Next.js 15 + TypeScript + Tailwind scaffold, config, tooling, CI | **done** | 0 |
| 2 | Supabase project, database schema, migrations, RLS, generated types | **done** | 1 |
| 3 | Design system, global chrome (top bar, announcement, header, mega menu, footer, age gate) | **done** | 1, 2 |
| 4 | Homepage composition from database sections | **done** | 2, 3 |
| 5 | Catalogue: brands, models, collections, product listing, filters, sort, search | **done** | 2, 3, 4 |
| 6 | Product detail page, media gallery, specs, related/recently viewed, wishlist | **done** | 5 |
| 7 | Cart, manual order-request flow, payment-method selection, delivery/pickup, confirmation | **done** | 5, 6 |
| 8 | Resend transactional email, templates, admin notifications | **in progress** | 7 |
| 9 | Authentication, customer account area (orders, wishlist, profile, addresses) and roles | not started | 7, 8 |
| 10 | Admin platform (products, brands, models, collections, inventory, orders, inquiries, media, pages, announcements, payment methods, settings) | not started | 2, 4, 7, 9 |
| 11 | Service flows (sell/trade, sourcing, repair), contact, CMS pages, FAQ, testimonials | not started | 3, 8, 9, 10 |
| 12 | SEO hardening: dynamic sitemap with real `lastmod`, structured data, robots, canonicals, invalidation | not started | 5, 6, 11 |
| 13 | Security hardening: headers/CSP, rate limiting, honeypots, audit review, RLS test suite | not started | 10, 11 |
| 14 | Performance, accessibility and Lighthouse 100/100 pass on key templates | not started | 11, 12 |
| 15 | QA, E2E suite, seed/demo data policy, Vercel production deployment, documentation | not started | 13, 14 |

---

## Phase 0 — Project contract, repository audit and reference analysis ✅ done

**Goal:** establish the contract and the plan; touch as little as possible.

**Audit result:** the repository was effectively empty.

```
luxury-watch/
├── .git/
└── .example.env      # 1 byte, empty
```
One commit (`c658c2b Create .example.env`), branch `main` → `origin/main`
(`github.com/Shady20-tech/luxury-watch`). No `package.json`, no app code, no migrations, no tests,
no CI, no Vercel config. **This is a greenfield repository**, which is the documented justification
for scaffolding an app in Phase 1 rather than refactoring one.

**Deliverables produced:**

| File | Content |
|---|---|
| `REFERENCE_ANALYSIS.md` | Reference platform/theme, design tokens, full route taxonomy (15 pages, ~44 collections, flat product slugs, 1 blog), global chrome, home composition, PLP/PDP anatomy, service flows, mobile behaviour, accessibility and SEO findings, improvement opportunities, honest access limitations, legal stance |
| `ARCHITECTURE.md` | Stack decisions, route map, full target data model, data-access layering, security boundaries, order-request flow, email flow, SEO architecture, Lighthouse strategy, Vercel assumptions, env var names, testing strategy, non-goals |
| `IMPLEMENTATION_PLAN.md` | This file |
| `KNOWN_ISSUES.md` | Open issues with severity and next action |
| `CHANGELOG.md` | Audit entry |
| `.env.example` | Variable names and dashboard setup notes, no secrets |

**Decisions recorded (with reasons):**

1. **Package manager = npm** (`package-lock.json`). Reason: no existing lockfile or `package.json`
   to respect; npm 11.19.1 present; Vercel default. A different choice would be a silent change with
   no evidence to justify it.
2. **Next.js 15.x (latest stable), not 16.** Reason: the binding decision names Next.js 15; npm
   `latest` is currently 16.4.2. Staying on 15 is compliance, and upgrading is the owner's call.
3. **`.example.env` will be replaced by `.env.example` in Phase 1.** Reason: the existing file is
   empty and misnamed (`.example.env` is not read by any tool), so it is a setup trap.
4. **Reference rebuild is structural, not literal.** Reason: the reference is a live business using a
   commercial Shopify theme; we reproduce information architecture and interaction patterns only.

**Not done in this phase (deliberately):** no application scaffold, no dependencies installed, no
schema, no migrations, no UI. Only documentation plus an environment-variable template.

**Acceptance criteria:**

| Criterion | Status |
|---|---|
| Existing codebase inspected rather than replaced blindly | ✅ audited; documented as greenfield |
| Five planning/change documents exist and reflect real findings | ✅ |
| No payment-gateway implementation planned anywhere | ✅ verified against all phases below |
| Manual order-request workflow explicit as a project-wide requirement | ✅ |
| Database-driven products explicit | ✅ |
| Dynamic product sitemap timestamps explicit | ✅ |
| Vercel + Resend + strict security + Lighthouse target explicit | ✅ |
| Report audit findings and stop | ✅ |

---

## Phase 1 — Foundation (scaffold, tooling, CI) ✅ done

**Goal:** a real, buildable Next.js 15 application with quality gates, and nothing fake.

**Delivered**

| Item | Status | Notes |
|---|---|---|
| Next.js 15 (App Router) + React + TS + Tailwind in place, on npm | done | Next 15.5.28, React 19.3.1, Tailwind v4.3.3 |
| Strict `tsconfig` + `@/*` alias | done | Also `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch` |
| ESLint + Prettier; `lint` / `typecheck` / `build` scripts | done | Flat config, `next/core-web-vitals` + `next/typescript` + `prettier`, explicit `jsx-a11y` rules |
| Vitest with real passing tests | done | 7 suites, 106 assertions — no placeholder assertions |
| `app/layout.tsx` with `<html lang>`, `next/font`, metadata defaults | done | Cardo + Nunito self-hosted; skip link; site-wide JSON-LD |
| `next.config.ts` with image domains and security headers | done | Supabase Storage pattern added conditionally; 7 headers; private-path `noindex` |
| `.env.example` replacing `.example.env`; `lib/env.ts` | done | `.example.env` deleted. Validation never throws at import, so `next build` cannot break on a missing variable; problems are collected and surfaced at `/api/health` |
| `app/globals.css` design tokens | done | Gold accent, neutral surfaces, status colours, radii, spacing, motion; contrast verified by test |
| Real `not-found` and `error` boundaries | done | Plus `global-error.tsx`; all show a digest, never an internal message |
| GitHub Actions: install → lint → typecheck → test → build | done | `.github/workflows/ci.yml`, Node 22, least privilege, plus the payment guard and a format check |
| `README.md` with setup, scripts and Vercel steps | done | |

**Beyond the original scope, and why**

- **`scripts/check-no-payment-providers.mjs`** — the no-payment rule is a
  project-wide invariant, so it is enforced mechanically rather than by
  convention. It fails CI on a payment dependency, gateway host, card field,
  payment webhook or provider-named route, and is itself covered by behavioural
  tests that prove it rejects each violation class.
- **`src/lib/logger.ts`, `src/lib/errors.ts`** — the phase asks for a real error
  boundary; a boundary is only honest if internal detail cannot leak through it,
  which requires a shared error model and a logger that redacts secrets.
- **The SEO layer (`src/lib/seo/`, `robots.ts`, `sitemap.ts`, `manifest.ts`,
  `api/health`)** — the brief makes SEO first-class "from the foundation", and
  the sitemap's honest `lastmod` handling has to exist before the catalogue is
  built on top of it. Building it later would mean retrofitting cache tags.
- **Supabase client boundaries** — the service-role leak risk (D3) is a critical
  issue, and the guard that prevents it (`server-only`) has to be in place before
  any code could import it wrongly.

**Acceptance criteria**

| Criterion | Result |
|---|---|
| `npm ci && npm run lint && npm run typecheck && npm test && npm run build` all pass | **Pass.** All five verified individually and in sequence. 106 tests pass, build generates 8 routes. |
| App boots locally and renders a real page | **Pass.** Verified against a production server: `/` returns 200 and renders genuine configuration state, not a placeholder dashboard. |
| No secret in the repo; `.env.example` lists every variable used | **Pass.** Secret scan clean. `.env.example` documents all 15 variables with per-service setup notes. |
| CI green on `main` | **Pass.** Confirmed on GitHub for commit `4e65779` — all ten steps succeeded (install, payment guard, format check, lint, typecheck, test, build). Run `38985101969`. |

**Additional verification performed**

- `npm audit --omit=dev` → **0 vulnerabilities**, after resolving a real `postcss`
  advisory via a targeted override (see `CHANGELOG.md`).
- Runtime header inspection: all seven security headers present; `X-Robots-Tag:
  noindex` on private paths.
- `robots.txt`, `sitemap.xml` and the JSON-LD graph inspected for correctness.
- `/api/health` correctly reports `degraded` when nothing is configured.
- Client-bundle scan: no secret material and no `service_role` reference in
  `.next/static/`.

**Carried forward**

- C1 (`.example.env`) and C3 (no `.gitignore`) and C4 (no lockfile) are
  **resolved**.
- C5 (no secret scanning in CI) remains open — partially mitigated by the
  redaction tests, but a repository-level scan is scheduled for Phase 13.
- CSP remains deferred by design, with the intended policy documented and an
  owning phase recorded in `KNOWN_ISSUES.md` (D9).

---

## Phase 2 — Database schema, migrations and RLS ✅ done

**Goal:** the real Supabase schema, versioned, with row-level security from the start.

**Status:** complete and verified. All 8 migrations apply cleanly to an empty
PostgreSQL 17 database, all 4 RLS suites pass, and the concurrency proof passes
including its negative control. Full reference: `DATABASE_SCHEMA.md`.

**Delivered**

- `supabase/migrations/0001`–`0008` — 47 tables, 13 enums, 96 RLS policies,
  138 indexes. Applied in order and re-verified from an empty schema.
- `supabase/tests/00`–`40` — the Supabase environment shim plus four
  authorisation suites (public boundary, customer ownership, role escalation,
  order and inventory).
- `supabase/seed/01_catalogue.sql` — 4110 products across 4 brands and 41 model
  families, 8785 spec rows. All `draft`; no images, prose or prices.
- `scripts/db-verify.sh`, `db-reset.sh`, `db-concurrency-test.py`,
  `db-concurrency-matrix.py`, `generate-catalogue-seed.py` — all dual-mode
  (Docker locally, direct `psql` in CI).
- `src/lib/database.types.ts` — real generated types, replacing the Phase 1
  placeholder.
- `DATABASE_SCHEMA.md` — the authoritative schema reference.
- `.github/workflows/ci.yml` — new `database` job running migrations, RLS suites
  and the concurrency matrix against a PostgreSQL 17 service container.

**Deviations from the Phase 0 plan, and why**

| Planned | Built | Reason |
|---|---|---|
| `profiles.role` (`customer`/`staff`/`admin`), plus a trigger preventing self-escalation | `user_roles` table with a 7-value `staff_role` enum and no write policy | RLS restricts rows, not columns. A `role` column on a self-editable row is one policy mistake from privilege escalation. Removing the column removes the attack surface instead of guarding it. See `DATABASE_SCHEMA.md` §6.1. |
| Optional `categories` table | Not created | Nothing in the reference navigation or planned storefront needs it; `collections` covers curated grouping. |
| `order_request_status` enum name | `order_status` | Consistency with the other enum names. |
| `condition` enum | `product_condition` (`new`/`unworn`/`pre_owned`/`vintage`) | Namespaced to avoid a bare `condition` in the schema; `unworn` added because the reference catalogue distinguishes it from `pre-owned`. |
| `order_requests.status_history` jsonb | Separate `order_request_events` table | An append-only table gives the audit trail real columns, a real actor, and RLS, which a jsonb blob cannot. |

**Acceptance criteria**

| Criterion | Status |
|---|---|
| Migrations apply cleanly to a fresh database | ✅ verified from an empty schema via `db-verify.sh` |
| Migrations are safe to apply in order | ✅ verified; `db-reset.sh` + full re-apply |
| Anonymous cannot read drafts | ✅ `10_public_boundary.sql`, with a positive control |
| A customer cannot read or modify another customer's order request, cart or wishlist | ✅ `20_customer_ownership.sql` |
| A customer cannot write products | ✅ `10_public_boundary.sql` (insert denied; update has zero-row effect) |
| Only admin can set `order_status` to `paid_offline` | ✅ `30_role_escalation.sql` + the settlement constraint |
| No customer can self-escalate a role | ✅ `30_role_escalation.sql` |
| Schema contains **no** payment credential, card or gateway field | ✅ asserted across `information_schema.columns` in `40_order_and_inventory.sql`, plus the CI payment guard |
| Inventory cannot be oversold under concurrency | ✅ five-scenario proof with a passing negative control |
| `DATABASE_SCHEMA.md` documents every table, column, policy and invariant | ✅ written from the running database |
| Seed is clearly labelled demo data | ✅ all products `draft`; no images, prose or prices |
| Generated TypeScript types | ✅ 47 tables, 13 enums |

**Not done in this phase, by design:** running against a real Supabase project
(the suites use the shim), Storage bucket policies (dashboard configuration), and
`supabase db lint` (needs the Supabase CLI linked to a project). These are tracked
in `KNOWN_ISSUES.md`.

---

## Phase 3 — Design system and global chrome ✅ done

> **Status: complete (2026-10-17).** Verified by `npm run verify` (163 tests),
> `scripts/a11y-audit.mjs` (24 page/viewport combinations plus 2 age-gate passes,
> no critical or serious axe violations, no horizontal overflow) and a production
> build of 25 static pages. Two real defects were found and fixed in this phase:
> a WCAG AA contrast failure on the media placeholder, and a 320px horizontal
> overflow in the header. Both were invisible to jsdom and were only caught by
> the real-browser audit. Remaining honest limitations are recorded in
> `KNOWN_ISSUES.md` as G10–G16 and in the Phase 3 `CHANGELOG.md` entry.

> **Ordering note.** The owner's Phase 3 brief covered the design system and shared layout, so
> that phase and the then-planned authentication phase were swapped. Authentication was scheduled
> as the standalone Phase 4, but the owner's Phase 4 brief is the **homepage**, which the plan
> now records as Phase 4. Authentication has therefore been merged into Phase 9 (Authentication,
> customer account area and roles), which is where it is first needed: nothing before Phase 9
> requires a signed-in user, and the account area depends on the order-request flow from Phase 7.
> No scope was dropped — every authentication requirement below is retained.

**Delivered in this phase**
- Design tokens in `globals.css`: ink/gold/line/surface ramps, semantic aliases, display and body
  font stacks, `container-page`, `eyebrow`, `glass-panel`, `glass-panel-strong`, a global
  `prefers-reduced-motion` block and a zoomable viewport.
- Primitives: `button`, `input`, `badge`, `section` (`Card`, `SectionHeading`), `skeleton`,
  `states` (`EmptyState`, `ErrorState`), `media-frame`, `accordion`, `drawer`, `dropdown-menu`.
  (`select`, `textarea`, `dialog` as a general primitive and `breadcrumb` arrive with the phases
  that need them — Phase 5 forms and Phase 6 breadcrumbs — rather than being built unused here.)
- Chrome: header, mega menu (Radix NavigationMenu, Brand → Model), mobile drawer (Radix Dialog +
  accordion), announcement bar, footer, header actions, wordmark.
- Age gate driven by `site_settings.age_gate_enabled` and `age_gate_minimum_age`, with the
  environment flag as the fallback when no settings row exists.
- `src/lib/navigation/` (types, pure assembly, fallback fixture) and
  `src/server/{repositories,services}/` for chrome data, with `getChrome` cached per request.
- Fourteen placeholder routes so every navigation link resolves to a real page that names the
  phase which fills it, plus a `noindex` design-system reference page.
- Verification tooling: `scripts/a11y-audit.mjs` and a `browser-audit` CI job.

**Scope**
- Component primitives (button, input, select, textarea, dialog, sheet, accordion, badge, card,
  breadcrumb, skeleton) built on Tailwind tokens, with Radix primitives for anything that has to
  trap focus or manage roving tabindex
- **Top bar**: phone (`tel:`), rotating message, email (`mailto:`), location link, socials
- **Announcement bar**: database-driven, dismissible, pausable, `prefers-reduced-motion` aware
- **Header**: logo, search trigger, account, wishlist count, cart count
- **Mega menu**: Brand → Model two-level panel built from the database, keyboard navigable, Escape
  to close, focus returned to trigger, mobile drawer with accordion sections
- **Footer**: newsletter, store/contact block, quick links, policies, socials, bottom bar;
  mobile accordion behaviour
- **Age gate**: accessible modal (focus trap, `aria-modal`, keyboard operable, remembers choice),
  enable/disable and minimum age from `site_settings`
- Skip link, visible focus rings, reduced-motion support, zoomable viewport

**Acceptance criteria**
- Chrome renders from database navigation data, not hardcoded arrays
- Keyboard-only pass: skip link → header → mega menu → footer
- axe reports no critical/serious violations on the shell
- Mobile drawer behaves correctly at 320px and up

---

## Phase 4 — Homepage composition

**Goal:** the home page is assembled from database rows, in the order the admin
sets, with every card value read from the database.

**Scope**
- `homepage_sections` drives the page: which sections appear, in what order, and
  their per-section settings (`settings` jsonb). No section order is hardcoded.
- Seventeen `section_key`s are handled — three hero slides (`hero_1`…`hero_3`),
  four trust points (`trust_1`…`trust_4`) and ten singular sections (brand
  showcase, featured collection, brand story, new arrivals, browse brands,
  sell/trade CTA, sourcing CTA, testimonials, newsletter, final CTA).
- Product rails resolve through `products` + `product_images`; the featured
  collection resolves through `collection_products`; brands and their published
  counts come from `brands` + `products`.
- Availability comes from the `product_availability` RPC rather than being
  inferred in the UI, so a sold-out piece is marked from real inventory.
- Cards link to `/products/<slug>`, `/brands/<slug>` and `/collections/<slug>`.
  Those routes are placeholders in this phase (Phase 5 fills them), but each one
  validates the slug against the database and returns a real 404 for an invented
  or unpublished slug — a link to a 404 is a broken storefront.
- Degradation is honest and has three states: database, empty-with-database, and
  fallback-when-unconfigured. There is deliberately **no** code-side fixture of
  editorial copy, because marketing copy that lives in two places drifts from
  what the admin edits.

**Acceptance criteria**
- Section order, headings and CTAs come from `homepage_sections`, not from a
  hardcoded array (verified by rendering against a seeded database).
- Every product card value is read from the database; no hardcoded product.
- A draft, archived or unpublished slug 404s rather than rendering (RLS enforces
  this at the query, and the route confirms it).
- `npm run verify` green, `scripts/a11y-audit.mjs` green with `/brands/<slug>`
  added, and Lighthouse run against a production build with the real scores
  recorded.
- With Supabase unconfigured, the page says the content layer is not connected
  instead of inventing content.

**Status: complete.** `npm run verify` is green at 216 tests; the browser audit is
green across 7 pages × 4 viewports plus the age-gate pass. The logo link's WCAG
2.5.3 failure was found and fixed, along with the `axe-core` version drift that
had hidden it from CI (G21). Lighthouse: desktop 100/100/100/100, mobile 95–97
performance with 100 accessibility, best practices and SEO — recorded as G19
rather than rounded up.

---

## Phase 5 — Catalogue and discovery

**Scope**
- `/brands/[slug]`, `/collections/[slug]` with server-side pagination
- Faceted filtering (brand, model, condition, year, case size, movement, dial, price band) and the
  nine sort options observed in the reference
- Facet state in the URL; canonical strategy for filtered permutations (`noindex, follow` on
  multi-facet combinations)
- Product cards: image, badge (New / Sold Out / Price on request), title, short description, price
  **or** "Request pricing & availability", wishlist toggle, add-to-cart
- `/search` with real database search (title, sku, reference number, brand, model) plus the
  popular-searches affordance
- Replaces the Phase 4 placeholder routes (`/brands/[slug]`, `/collections/[slug]`,
  `/products/[slug]`) with the full implementations

**Acceptance criteria**
- Every card value comes from the database; no hardcoded product
- Filters and sort work against real data and are reflected in the URL
- Empty states are honest and actionable
- Facet permutations are not indexable; clean collection URLs are canonical

**Status: complete and verified (2026-10-17).** `npm run verify` is green at 248
tests, and `scripts/db-verify.sh` is green on a reset database (10 migrations, 6
RLS/auth suites, idempotent seeds). Verified against a real PostgREST + database
through the real `supabase-js` path: `/shop` 20 of 20, `availability=reserved` 4
and `availability=available` 16 (a true partition), `brand=rolex` 4, an
impossible filter combination returns an honest empty state, `pageSize=12&page=2`
returns 8, `sort=price_asc` matches the database ordering, a selected brand still
lists the other brands' counts, `/brands/rolex` 4, `/collections/featured` 6,
`/search?q=rolex` 4, an invented brand slug 404s, and `/collections/all` 308s to
`/shop`.

Two decisions worth recording, both from repository evidence rather than
preference:

- **Availability is a tri-state (`any` / `available` / `reserved`), not a
  boolean.** The database already models it through `is_product_available`, and a
  reserved watch is genuinely spoken for — collapsing that to a boolean would
  have thrown away a distinction the data carries.
- **`/shop` is the canonical listing, not `/collections/all`.** `/collections/all`
  is retained as a 308 so the reference-style address and existing links keep
  working, but only one URL is indexable and canonical.

Deferred to later phases, and deliberately not stubbed here: the wishlist toggle
and add-to-cart on the card (Phases 7 and 9), and the product detail template
(Phase 6). A card control that looked live but discarded the click would be worse
than its absence, so the whole card is one link to the product.

---

## Phase 6 — Product detail page

**Scope**
- `/products/[slug]` with `generateStaticParams` for published products
- Media gallery with thumbnails, zoom, keyboard navigation, explicit dimensions
- Spec table from `product_specs` + structured columns (reference, case size, movement, year,
  condition, waterproof, box & papers)
- Price block: real price **or** "Request pricing & availability" — never a fabricated price
- CTAs: add to cart, add to wishlist, "Ask a question" (creates a `product_question` inquiry)
- Related products and recently viewed
- Breadcrumbs (visible + `BreadcrumbList` data)
- Stock/availability shown honestly from `inventory`

**Acceptance criteria**
- Published product renders fully from the database
- Draft/archived product returns 404 to the public
- Both price paths render correctly and truthfully
- Product JSON-LD validates; `offers` present only when a real price exists

**Status: complete and verified (2026-10-18).** `npm run verify` is green at 277
tests, and `scripts/db-verify.sh` is green on a reset database (11 migrations, 7
RLS/auth suites, idempotent seeds). Every acceptance criterion was checked against
a real PostgREST + database through the real `supabase-js` path:

- **Published product renders fully from the database** — a real seed anchor
  returns 200 with 23 specification rows, the brand crumb, the related section and
  `Product` + `BreadcrumbList` JSON-LD.
- **Draft/archived returns 404** — `draft-watch` and an invented slug both 404, and
  the slug is resolved through RLS rather than by application code.
- **Both price paths render truthfully** — a price-on-request piece shows "Request
  pricing & availability" and emits **no** `offers` node; `priced-watch` shows
  `$12,500` and emits an `Offer` of `12500.00` with `InStock`.
- **Product JSON-LD validates and `offers` is conditional** — `priceMinor` is set
  from the same single decision that formats the visible price, so the two cannot
  disagree.

**Phase 6 also closed a critical security leak (D10).** The `anon` role could read
`products.cost_cents` and `products.compare_at_cents` — the business's cost basis —
through PostgREST, because RLS restricts rows rather than columns. Migration
`0011_product_detail.sql` revokes the table-level `select` grant and re-grants the
public read surface column by column, so the sensitive columns are hard-denied
(`401`, SQLSTATE `42501`) and a bare `select('*')` fails loudly. Proven against the
real client path before and after the fix.

Decisions worth recording:

- **`generateStaticParams` returns `[]`.** Prerendering every product would freeze
  price, stock and `lastmod` into the deployment, so the sitemap's freshness claim
  would be false. The page renders per request against the live row, and the build
  does not need a database. Revisit with ISR in Phase 12, together with the
  sitemap.
- **An unreachable database is a 200 with `noindex`, not a 404.** A 404 would tell
  a visitor a watch does not exist when the fault is an outage, and it would invite
  a crawler to drop a valid URL.
- **The cart and wishlist controls are genuinely disabled and labelled.** There is
  no cart until Phase 7 and no account until Phase 9; a live-looking button that
  discarded the click would be worse than a control that states its phase.

Deferred to later phases and deliberately not stubbed: recently viewed (needs a
session or account, Phase 9), the working wishlist toggle (Phase 9), and
add-to-cart (Phase 7). The enquiry form is the real call to action in this phase.
`/products/[slug]` is indexable but not yet in `sitemap.xml` (G34); the
database-driven sitemap with real per-product `<lastmod>` is Phase 12.

---

## Phase 7 — Cart and manual order-request flow ✅ done

> **Scope note (2026-10-18).** This phase was run in two passes, and **both are
> now complete**. The first pass implemented the **wishlist and the cart**. The
> second pass implemented the **order-request flow**: `/checkout` (the
> order-request form), the confirmation and guest lookup pages, server-side
> validation, rate limiting and honeypot, and the reservation-on-*submission*
> step. Working notes sometimes call the second pass "Phase 8", but the plan
> numbers it correctly here — Phase 8 is transactional email. The route is
> `/checkout` rather than `/order-request`; the bullets below keep the original
> wording and are all satisfied.

**Goal:** the commerce path — with **no payment processing anywhere**.

**Scope**
- Cart: add/update/remove, quantity, guest cart via session token, merge on login, server-side
  re-pricing on every read and write
- Cart drawer + `/cart` page sharing one state source
- Wishlist: saved products for a signed-in customer, a local list for a guest, merge on sign-in,
  and move-to-cart
- `/checkout`: collect name, email, phone, fulfilment (delivery or pickup), delivery address when
  applicable, **payment method chosen from admin-enabled methods**, customer note
- Server-side validation, rate limiting, honeypot on the request form
- Totals recomputed from the database — client totals are ignored
- `order_requests` + `order_request_items` + `order_request_events` written transactionally
- Confirmation page with reference number, explicit "request received / payment arranged offline"
  language
- Guest lookup by reference **+ access token** (the token is minted at submission; the storefront
  never treats the reference alone as a credential)
- Stock **is held on submission** and converted to a sale on confirmation; a rejected or cancelled
  request releases the hold

**Acceptance criteria**
- Cart and wishlist persist as intended for both a guest and a signed-in customer (tested)
- A duplicate wishlist row is impossible, enforced by a constraint and tested
- A zero, negative or out-of-range quantity is rejected by a constraint and clamped by the pricing
  function, and both are tested
- The server never reads a price or a stock count from the browser: `cart_pricing` accepts ids and
  quantities only, and a discount is recomputed from its code (tested)
- **Zero** payment gateway, SDK, card field, iframe or provider reference anywhere in the codebase
- End-to-end: browse → add to cart → order request → confirmation, against real Supabase (G46:
  verified locally against PostgreSQL + PostgREST, not a real Supabase project)
- Confirmation copy never claims payment was made
- Disabled payment methods cannot be selected (tested)

---

## Phase 8 — Transactional email (Resend)

**Scope**
- `src/lib/email/transport.ts` calls Resend over its HTTPS API with `fetch`, with a no-key fallback
  that logs the recipient and subject (never the body) instead of sending. The SDK is deliberately
  not used: it wraps one POST.
- Templates live in `src/lib/email/orders.ts` as plain functions returning `{ subject, text, html }`.
  Done: order request received (customer), new order request (admin). Remaining: status changed
  (customer), inquiry received (admin), inquiry reply (customer), welcome, newsletter confirmation.
  Each needs a trigger that does not exist yet — the account area (Phase 9) and the admin platform
  (Phase 10) — so the transport and message model are in place ahead of them.
- Sent from services after the database write succeeds; email failure must not roll back data.
  `sendEmail` returns a result and never throws, and `notifyOrderRequestSubmitted` swallows its own
  failures.
- Delivery/failure logging is emitted (`email.sent`, `email.skipped`, `email.send_failed`); surfacing
  it in the admin UI arrives with Phase 10.

**Acceptance criteria**
- Emails send in a configured environment and are logged in an unconfigured one — **met** for the two
  order-request messages (`tests/email-transport.test.ts`).
- Every template states offline payment clearly and never claims payment — **met**, and enforced:
  `tests/email.test.ts` scans every rendered message for a payment claim and fails if one appears.
- No API key in the repo or the client bundle — **met**; the key is server-only and the transport is
  behind `server-only`.

**Verification note.** Email delivery itself is unverified end to end: A3 (no Resend account or
verified sending domain) is still open, so no message has been sent through Resend from this
repository. What is verified is the rendered message, the request shape and the no-key path.

---

## Phase 9 — Authentication, customer account area and roles

**Scope — authentication**
- Supabase Auth with `@supabase/ssr` cookie-based sessions, middleware-refreshed
- `/login`, `/register`, `/forgot-password`, `/reset-password`, email confirmation
- `profiles` row auto-created on signup via trigger; role defaults to `customer`
- `/admin` guarded server-side by role; unauthorised users get a real 403, not a redirect loop
- Account menu reflecting real auth state
- Server-side Zod validation on every auth action; generic error messages that do not leak whether
  an email exists

**Scope — customer account area**
- `/account` overview, `/account/orders` (own order requests with status timeline), order detail
- `/account/wishlist`, `/account/profile`, address book
- Honest empty states; no invented orders

**Acceptance criteria**
- Register → confirm → login → logout works end to end against real Supabase
- A `customer` cannot reach any `/admin` route or mutation
- Session refresh works; no auth flash-of-wrong-state
- Tests cover the role guard on both route and service level
- A customer sees only their own data (verified by RLS tests)
- Status timeline reads from `order_request_events`

---

## Phase 10 — Admin platform

**Goal:** every admin control performs a real database operation.

**Scope**
- Dashboard with **real** counts and recent activity (no fabricated statistics)
- Products CRUD (create, edit, duplicate, publish, unpublish, archive, delete) with images,
  specs, SEO fields, price / price-on-request
- Brands, models, collections and collection merchandising (drag-order)
- Inventory management with stock and thresholds
- Orders: list, filter, detail, status transitions with notes, audit trail, stock reservation
- Inquiries: list, filter, reply, close
- Payment methods: enable/disable, label, instructions
- Delivery options: enable/disable, fee
- Announcements, pages, FAQs, testimonials, site settings, navigation
- Media library backed by Supabase Storage
- Every mutation: server-side authz + Zod validation; publish/edit triggers sitemap revalidation

**Acceptance criteria**
- A non-admin cannot perform any admin mutation (tested at service and route level)
- Publishing/editing/unpublishing/archiving/deleting a product invalidates the sitemap cache
- No dead buttons; unavailable features are disabled with an honest explanation
- No hardcoded statistics anywhere

---

## Phase 11 — Service flows, contact and CMS pages

**Scope**
- `/services/sell-trade`, `/services/sourcing`, `/services/repair-restoration` — each with the
  reference's section structure, its own typed inquiry form and its own admin queue
- `/contact` with the reference's Address / Information / Social Media blocks and its form fields
- CMS pages from `pages`: About, FAQ (from `faqs`), Warranty, Shipping, Satisfaction Guarantee,
  Terms of Use, Privacy Policy, Data Sharing Opt-out
- Testimonials section, WhatsApp/community CTA, newsletter signup
- FAQ accordion with accessible disclosure semantics

**Acceptance criteria**
- All three service flows create real inquiries routed to the right admin queue
- Contact form works and is rate-limited
- FAQ and policy pages render from the database, not hardcoded text

---

## Phase 12 — SEO hardening

**Scope**
- Database-driven `/sitemap.xml` index plus products, collections, brands, pages sitemaps
- Every product `<lastmod>` uses the real `updated_at`; collections/pages use their own
- Tag-based revalidation on publish / edit / unpublish / archive / delete
- `robots.txt` route disallowing `/admin`, `/account`, `/cart`, `/wishlist`, `/checkout`,
  `/order/`, `/api`, and filtered/sorted permutations
- Structured data: Organization, LocalBusiness, WebSite + SearchAction, BreadcrumbList, Product
  (+ Offer only when a real price exists), FAQPage where Q&A is visible
- Canonical and metadata coverage for every public template
- Document that `<lastmod>` is a crawl hint, not a guarantee

**Acceptance criteria**
- Sitemap entries carry accurate timestamps that change when a product is edited (tested)
- Structured data validates with no errors on home, collection, product, FAQ, contact
- `robots.txt` blocks private and trap URLs while allowing all public content

---

## Phase 13 — Security hardening

**Scope**
- CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
- Rate limiting on inquiries, contact, newsletter, order requests and auth
- Honeypots, input sanitisation, output escaping, upload MIME/size validation
- Full RLS regression suite; service-role usage audit (confirm server-only)
- Dependency audit; secret scan of the repository
- Documented threat model and incident notes in `ARCHITECTURE.md`

**Acceptance criteria**
- Security headers present and verified on a deployed URL
- RLS test suite green
- No secret in the repository or the client bundle
- Rate limits demonstrably enforced

---

## Phase 14 — Performance, accessibility and Lighthouse

**Scope**
- Real Lighthouse runs on home, collection, product, contact and a CMS page; fix iteratively
- Accessibility pass: contrast, focus order, landmarks, labels, dialogs, carousels, forms
- Performance pass: JS budget, image sizing, font loading, CLS, LCP, INP
- Report **actual** scores with evidence

**Acceptance criteria**
- Best Practices and SEO at 100 on key public templates
- Accessibility at 100, or every remaining violation documented with severity and cause
- Performance at 100, or the real score plus the specific external constraint documented
- No fabricated scores; `KNOWN_ISSUES.md` reflects the truth

---

## Phase 15 — QA, seed data policy, deployment and docs

**Scope**
- Playwright E2E: browse → product → cart → order request → confirmation; auth; admin CRUD; age
  gate; wishlist; accessibility smoke
- Seed/demo data clearly labelled; a documented way to purge it
- Vercel production deployment, environment variables, domain, migrations applied out of band
- `README.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `KNOWN_ISSUES.md`, `CHANGELOG.md` finalised
- Handover notes: what the owner must configure in Supabase, Resend and Vercel

**Acceptance criteria**
- Full test suite green
- Production deployment live and functional
- Every remaining issue documented with severity and next action
- Owner-facing setup checklist complete and accurate

---

## Project-wide invariants (apply to every phase)

1. **No payment gateway, no online payment processing.** Payment is selected as an informational
   option and settled offline.
2. **No false payment success messaging.**
3. **All catalogue, pricing, inventory, SEO and navigation data comes from the database.**
4. **Business logic in server services/repositories**, not in visual components.
5. **RLS on every table; authorisation enforced server-side.**
6. **No secrets in the repository.** `.env.example` documents names only.
7. **No dead buttons, fake dashboards, placeholder CRUD or fabricated statistics.**
8. **Every phase updates `CHANGELOG.md`, `IMPLEMENTATION_PLAN.md` and `KNOWN_ISSUES.md`.**
9. **Every phase runs lint, typecheck, tests and build, and fixes what it broke.**
10. **No copying of reference source code, theme assets or long text passages; no claim of
    authorised-dealer status.**
11. **Sitemap `lastmod` reflects real product timestamps and is invalidated on change.**
12. **Accessibility and SEO are first-class, not a final coat of paint.**

---

## Current state

- **Completed:** Phase 0 (audit and planning documents), Phase 1 (application
  foundation, configuration, quality baseline), Phase 2 (database schema,
  migrations, RLS and authorisation foundation), Phase 3 (luxury design system,
  shared layout and responsive navigation), Phase 4 (homepage composition from
  database sections), Phase 5 (catalogue and discovery), Phase 6 (product detail
  page), Phase 7 (wishlist and cart — see the scope note below).
- **Application code:** the Next.js 15 app shell exists — layout, health route,
  robots, sitemap, manifest and middleware — with the Supabase client modules,
  environment validation, error handling, logging and SEO helpers in place.
  Phase 3 added the design tokens, the component primitives, the shared public
  chrome (header, mega menu, mobile drawer, announcement bar, footer, age gate)
  under the `(site)` route group. Phase 4 replaced the root page with a
  database-driven composition (`src/lib/homepage/`, `src/components/homepage/`,
  `src/server/repositories/homepage-repository.ts`,
  `src/server/services/homepage-service.ts`) and added the catalogue repository
  and `src/lib/media.ts` for image resolution. Phase 5 built the catalogue
  surfaces (`/shop`, `/brands/[slug]`, `/collections/[slug]`, `/search`).
  Phase 6 replaced the `/products/[slug]` placeholder with the real detail
  template (`src/lib/product/`, `src/components/product/`,
  `src/server/services/product-service.ts`) and added the first server action,
  `submitEnquiry`. Phase 7 built the wishlist and the cart (`src/lib/cart/`,
  `src/lib/wishlist/`, `src/components/cart/`, `src/components/wishlist/`,
  `src/server/services/cart-service.ts`, `src/server/services/wishlist-service.ts`,
  `/cart`, `/wishlist`, the product wishlist toggle and the live header badges),
  then the order-request flow itself in its second pass (`src/lib/orders/`,
  `src/components/checkout/`, `src/server/actions/order-actions.ts`,
  `src/server/repositories/order-repository.ts`,
  `src/server/services/checkout-service.ts`, `/checkout` and `/order/[reference]`).
- **Database:** 48 tables, 14 enums, 97 RLS policies and 149 indexes across 13
  migrations, verified from an empty PostgreSQL 17 database. Authorisation proven
  by eight test suites; inventory safety proven by a five-scenario concurrency
  proof including a passing negative control. Phase 4 added migration
  `0009_public_availability.sql` (the `product_availability` RPC) and the demo
  homepage seed `supabase/seed/03_homepage_demo.sql`. Phase 5 added
  `0010_catalogue_browsing.sql` (the catalogue query layer). Phase 6 added
  `0011_product_detail.sql`, which also **closed a live column-level leak**:
  `anon` could read `products.cost_cents` and `compare_at_cents`, so the
  table-level `select` grant is revoked and the public read surface is granted
  column by column. Phase 7 added `0012_wishlist_and_cart.sql`
  (`discount_kind`, `discount_codes`, `carts.discount_code`, and the
  `cart_pricing` and `catalogue_by_ids` functions, plus the wishlist tables and
  the quantity and uniqueness constraints) and, in its second pass,
  `0013_order_request_submission.sql` (guest access-token hashes, idempotency,
  terms acknowledgement, discount evaluation and redemption,
  `enforce_rate_limit`, the redefined `submit_order_request` and
  `read_order_request`). Full reference in `DATABASE_SCHEMA.md`.
- **Test and verification status:** `npm run verify` green (lint, typecheck, 392
  unit tests, build). `scripts/db-verify.sh` green (13 migrations, 9 RLS suites,
  seeds re-applied for idempotency). `scripts/db-concurrency-matrix.py` green
  (5 of 5 scenarios behave as designed). `scripts/a11y-audit.mjs` green (44
  page/viewport combinations plus 2 age-gate passes, no critical or serious axe
  violations, no horizontal overflow). Lighthouse run against a production build:
  desktop 100/100/100/100, mobile 95–97 performance and 100
  accessibility/best-practices/SEO. CI runs the Node, database and browser-audit
  jobs on every push.
- **Next phase to run:** Phase 8, transactional email (Resend). The order-request
  flow — the second pass of Phase 7 — is complete; its confirmation copy is what
  Phase 8 will start sending by email once A3 (a Resend account) is resolved.
- **Blockers:** Phase 9 (authentication) needs a Supabase project (A1) to exercise
  real auth end to end; the schema itself is already applied and verified locally.
  Phase 8+ needs a Resend account (A3). Both are owner-side setup, documented in
  `.env.example` and `KNOWN_ISSUES.md`. The most significant open verification gap
  is G1: the RLS suites run against a shim rather than a real Supabase project.
  Phase 3 added G10: the chrome has no Supabase project to read from yet, so the
  database-driven navigation is exercised against the seed locally and the
  fixture is used in the deployed preview. Phase 3 also added G11 and G12, on the
  age gate and the placeholder routes. Phase 4 added G17–G19: the placeholder
  catalogue routes, the homepage demo seed and the mobile Lighthouse score.
  Phase 6 added G34–G41: the product route missing from the sitemap, the
  per-request rendering decision, the enquiry rate limit being per address rather
  than per IP, the absence of an email acknowledgement before Phase 8, the
  simplicity of the related-products ranking, the missing product photography
  (A4/A6), the untested-in-a-browser zoom dialog, and G41 (A1 still open). It also
  recorded D10, the closed `cost_cents` leak, which is the most significant
  security finding since Phase 2.


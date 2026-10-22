# Known Issues

Last updated: 2026-10-18 (Phase 8: transactional email and drawn product artwork)
Owner-visible register of everything unresolved. Kept honest on purpose: an issue is removed only
when it is genuinely fixed, and a phase is not marked complete while a critical item is open.

**Severity:** `critical` (blocks the build or is a security/data risk) · `high` · `medium` · `low`
**Status:** `open` · `in progress` · `resolved` · `accepted` (known and deliberately tolerated)

---

## A. Blocking setup the owner must complete

These are not code defects. They are configuration that cannot be done from inside the repository.
Until each is done, the dependent phase cannot be fully verified end to end.

| # | Issue | Severity | Status | Next action |
|---|---|---|---|---|
| A1 | **No Supabase project exists.** No `NEXT_PUBLIC_SUPABASE_URL`, anon key or service-role key is configured. | critical | open | Owner creates a Supabase project and supplies the values via the Vercel dashboard (and a local `.env.local`, which is gitignored). Blocks Phase 3 onward. |
| A2 | **No Supabase database to apply the schema to.** The migrations are authored and verified against a local PostgreSQL 17, but have not been applied to a real Supabase project, and `supabase db lint` has not been run. | high | open | Follows A1. Apply with `supabase db push`, then run the RLS suites against the real project (see G1). |
| A3 | **No Resend account or verified sending domain.** Transactional email cannot be delivered. | high | open | Owner creates a Resend account, verifies the sending domain, and supplies `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_ADMIN_EMAIL`. Blocks Phase 8 verification. |
| A4 | **No Supabase Storage bucket.** Product media upload and public image serving are not yet possible. Bucket policies are dashboard configuration, not part of the migrations. | high | open | Owner creates the buckets; Phase 10 wires upload, and the policies are documented in `ARCHITECTURE.md` §12. |
| A5 | **No Vercel project linked.** Deployment and preview QA are not yet possible. | high | open | Owner links the GitHub repo to a Vercel project and sets environment variables per environment. |
| A6 | **Business content is not supplied.** Legal/brand copy, logo, contact details, address, policies and licensed imagery must come from the owner. | high | open | Owner supplies branding, policy text and image licensing. Until then, seed/demo content is used and is clearly labelled as demo. |

---

## B. Reference-site access limitations

Recorded so no future phase claims to have verified something it did not.

| # | Issue | Severity | Status | Next action |
|---|---|---|---|---|
| B1 | `/account/login` returned an empty body (14 bytes) to a non-JS client; the Shopify account UI is app-rendered. Account, order-history and wishlist UX were **inferred**, not observed. | low | accepted | Design account UX from our own requirements; re-inspect with a JS-capable browser in Phase 9 if desired. |
| B2 | Only the **empty** cart state was observable. Line-item layout, quantity controls and drawer behaviour were inferred from markup and class names. | low | accepted | Confirm our own cart design in Phase 7 against usability testing, not against the reference. |
| B3 | Search results UI, mega-menu open state and filter result states are JS-rendered and were **not** observed. | low | accepted | Design from the captured link tree and `data-filters-*` attributes. |
| B4 | No device-emulated mobile rendering was performed; breakpoints come from published media queries only. | low | accepted | Verify real responsive behaviour with our own browser testing in Phase 4 onward. |
| B5 | Reference product sitemaps are split across 5 files; only the first was sampled. Total catalogue size is unknown and was not counted. | low | accepted | Not needed — our catalogue comes from our own database. |

---

## C. Repository and environment

| # | Issue | Severity | Status | Next action |
|---|---|---|---|---|
| C1 | `.example.env` existed at the repository root, 1 byte, empty, and misnamed — not read by any tool, and a setup trap. | medium | **resolved** | Deleted in Phase 1 and replaced by `.env.example` (15 variables, documented, no secrets). |
| C2 | Repository was greenfield: no `package.json`, no application code, no tests, no CI. | medium | accepted | Expected. Phase 1 scaffolded the application; the documented reason is recorded in `CHANGELOG.md`. |
| C3 | No `.gitignore`. Without it, `.env.local`, `node_modules/`, `.next/` and Supabase local artefacts risked being committed. | high | **resolved** | Added in Phase 1 **before** the first dependency install. Verified: no secret or build artefact is tracked. |
| C4 | No lockfile, so dependency resolution was unpinned and unreproducible. | medium | **resolved** | `package-lock.json` committed in Phase 1. Verified with a clean `npm ci` (431 packages). CI uses `npm ci`. |
| C5 | No automated secret scanning in CI. | medium | open | Partially mitigated: `tests/logger.test.ts` proves credential-shaped keys are redacted and never logged. A repository-level secret scan is still scheduled for Phase 13. |
| C6 | CI had not been observed green on GitHub when Phase 1 was written. | low | **resolved** | Confirmed green on `main` for commit `4e65779`. All ten steps passed: install, payment guard, format check, lint, typecheck, test and build, on Node 22. Run: `38985101969`. |
| C7 | Dependency versions are pinned conservatively and several are older than npm `latest` — ESLint 9 (10 unsupported by `eslint-config-next@15`), TypeScript 5.9 (latest is 7.x), Vitest 3.2 (latest is 5.x). | low | accepted | Deliberate compatibility choices, each recorded with a reason in `CHANGELOG.md`. Revisit when Next.js 16 is approved by the owner. |
| C8 | `overrides.postcss` pins `postcss@8.5.30` to work around `next@15.5.28` pinning the vulnerable `8.4.31`. | low | accepted | Remove the override once a Next 15.x release depends on a patched postcss, or when upgrading to Next 16. Re-verify with `npm audit` at that point. |

---

## D. Security items to track from the start

| # | Issue | Severity | Status | Next action |
|---|---|---|---|---|
| D1 | No RLS policies exist yet, because no schema exists. Until Phase 2 lands, **any** table created would be unprotected by default. | critical | **resolved** | Phase 2 enabled RLS on all 47 tables with 96 default-deny policies, and proved it with four test suites. Verified: zero tables in `public` have `relrowsecurity = false`. |
| D2 | `profiles.role` self-escalation must be impossible. A naive `update` policy on `profiles` would let a customer make themselves an admin. | critical | **resolved** | Phase 2 removed the column rather than guarding it: roles live in `user_roles`, which has no write policy for ordinary users. `30_role_escalation.sql` asserts the escalation is impossible. |
| D3 | Service-role key could leak into the client bundle if imported outside a `server-only` module. | critical | **mitigated** | Phase 1: `lib/supabase/admin.ts` and `lib/env.server.ts` both import `server-only`, so the build fails if either is pulled into a client bundle. Verified by scanning `.next/static/` for the key name and for `service_role`: nothing found. Phase 13 re-runs the scan as a standing check. |
| D4 | Public mutation endpoints (inquiry, contact, newsletter, order request, auth) have no rate limiting yet. | high | **partially resolved** | Phase 6 added the enquiry rate limit and Phase 7's second pass added order-request rate limiting (per address and global) plus a honeypot, both enforced inside Postgres. **Still open:** contact, newsletter and auth endpoints, and the `RATE_LIMIT_DRIVER` edge driver. Owned by Phase 13. |
| D5 | Security headers are configured; **Content-Security-Policy is deliberately not yet enforced.** | medium | open | Phase 1 shipped seven headers (nosniff, Referrer-Policy, Permissions-Policy incl. `payment=()`, X-Frame-Options, COOP, CORP, HSTS) and verified them at runtime. CSP is deferred by design: shipping a restrictive policy before the real asset graph is audited breaks the app, and one loosened under pressure provides no protection while creating false confidence. The intended policy and the three-step rollout (report-only → observe → enforce with nonce) are documented in `docs/SECURITY_HEADERS.md`. Owned by Phase 13. |
| D6 | Guest order lookup must not be authorisable by reference number alone. | high | **resolved** | Phase 7's second pass: `read_order_request` requires the reference **and** a 256-bit access token minted at submission and stored only as a SHA-256 hash, and the endpoint is rate-limited. A wrong token and a missing reference are indistinguishable, so the endpoint cannot enumerate references. The token is a per-request capability, never an authentication credential and never consulted by an RLS policy. |
| D7 | Order-request totals must be recomputed server-side; client-supplied prices must be ignored. | critical | **resolved** | Phase 2: `submit_order_request` re-reads every product and recomputes prices in the database, ignoring any client-supplied amount. The `order_requests_total_matches_parts` constraint re-verifies the arithmetic. Proven in `40_order_and_inventory.sql`. |
| D8 | No payment code must ever be introduced. This is an invariant, not a task. | critical | **mitigated** | **Done in Phase 1**, earlier than planned. `scripts/check-no-payment-providers.mjs` fails CI on a payment dependency, gateway host, card field, payment webhook or provider-named route, scanning both file content and file paths. It is itself covered by 9 behavioural tests that prove it rejects each violation class rather than merely passing on a clean tree. Phase 2 added a `payment-guard:allow` line marker for the two files that name card fields in order to forbid them; it is restricted to an explicit file allowlist and cannot suppress dependency, secret-key or webhook-route checks. |
| D9 | HSTS omits `preload`, so the domain is not submitted to the browser preload list. | low | accepted | `preload` is effectively irreversible. It is added only once the owner confirms every subdomain is HTTPS-only. Recorded rather than silently enabled. |
| D10 | **The `anon` role could read `products.cost_cents` and `products.compare_at_cents`** — the business's cost basis and comparison pricing — through PostgREST. RLS restricts rows, not columns, and the public-read policy is row-scoped, so both columns were readable by anyone holding the public anon key. Proven live before the fix: `GET /rest/v1/products?select=slug,price_cents,cost_cents` returned `{"slug":"priced-watch","price_cents":1250000,"cost_cents":4200000}`. | critical | **resolved** | Phase 6: migration `0011_product_detail.sql` revokes the table-level `select` grant from `anon` and `authenticated` and re-grants the public read surface column by column. The sensitive columns are now hard-denied (`401`, SQLSTATE `42501`) rather than filtered to an empty result, and a bare `select('*')` fails loudly instead of silently succeeding. Verified against the real client path in `supabase/tests/17_product_detail.sql` and `10_public_boundary.sql`. **A standing lesson for later phases: a new column on a publicly-readable table is exposed by default unless the grant list is updated with it.** |

---

## E. Quality, performance and platform risks

| # | Issue | Severity | Status | Next action |
|---|---|---|---|---|
| E1 | **Lighthouse 100/100 is a target, not a guarantee.** External factors (network conditions, third-party fonts, Lighthouse version, Vercel edge behaviour) can move the number. | medium | accepted | Phase 14: run real audits, fix what is fixable, and report the actual score plus the specific remaining constraint. Never fabricate a score. |
| E2 | Sitemap `<lastmod>` is a crawl **hint**; it cannot force Google to recrawl a page. | low | accepted | Documented in `ARCHITECTURE.md` §10 and Phase 12; correctness of the timestamp is what we control. |
| E3 | Vercel **Deployment Protection** may block automated inspection of preview URLs, which limits agent-side QA of previews. | medium | open | Owner either enables *Protection Bypass for Automation* and supplies the secret, or allows preview access. Until then, QA runs against a local build. |
| E4 | Supabase project region is not yet chosen, which affects latency for the primary audience. | low | open | Owner picks a region near the audience when creating the project (A1) and records it in `ARCHITECTURE.md`. |
| E5 | Third-party trademark use (Rolex, Audemars Piguet, Patek Philippe, Richard Mille) is factual product attribution only. | high | accepted | Never claim authorised-dealer status, affiliation or endorsement. Brand names are rendered as data attributes from our `brands` table, nothing more. |
| E6 | No licensed imagery is available. Seed/demo imagery must be clearly labelled and must not be presented as real stock. | medium | open | Owner supplies licensed or original imagery (A6). Until then, product media is original drawn artwork derived from each product's attributes and captioned as an illustration (G39), never a photograph presented as the real piece. |
| E7 | Seed/demo data must never be presented as real transactions. | medium | open | Phase 2 seeds all 4110 products as `draft`, so none is visible to the public until an administrator publishes it. Phase 15 documents how to purge the seed before go-live. |
| E8 | The reference's accessibility defects must **not** be reproduced: its viewport sets `maximum-scale=1.0, user-scalable=0`, which blocks pinch-zoom (WCAG 1.4.4). | high | accepted | Our viewport allows zoom; verified in Phase 4 and Phase 14. |
| E9 | Auto-rotating content (announcement bar, carousels) must be pausable to satisfy WCAG 2.2.2. | medium | open | Phase 4: pausable, dismissible, and `prefers-reduced-motion` aware. |

---

## F. Open questions for the owner

| # | Question | Impact |
|---|---|---|
| F1 | Which payment methods should be enabled at launch (bank transfer, mobile money/manual transfer, cash on pickup, other)? | Phase 7 UI and admin defaults |
| F2 | Which delivery options and fees apply, and is pickup at the showroom available? | Phase 7 |
| F3 | Is the age gate required, and what is the minimum age (18 or 21)? | Phase 4 |
| F4 | Which currencies and locales must be supported? USD only, or more? | Phases 2, 5, 7 |
| F5 | Are prices published for all products, or is the catalogue predominantly "price on request"? | Phases 5, 6, 12 |
| F6 | What is the business name, logo, address, phone, email and social handles for the new storefront? | Phases 4, 11 |
| F7 | Should Next.js be upgraded from 15 to 16, or stay on 15 as the binding decision states? Note: Next 15.5.28 pins a `postcss` version with a known advisory, currently worked around with an `overrides` entry. | Phase 1 (C7, C8) |
| F8 | Which analytics, if any, are required? (Affects Lighthouse and consent.) | Phase 14 |

---

## G. Database and schema items (raised in Phase 2)

| # | Issue | Severity | Status | Next action |
|---|---|---|---|---|
| G1 | **The RLS suites run against a shim, not Supabase itself.** `supabase/tests/00_supabase_shim.sql` emulates `auth.users`, `auth.uid()` and the API roles faithfully, but it is our reproduction of Supabase's behaviour, not Supabase. | high | open | Once A1 is done, run the same suites against the real project (or a Supabase local stack) and confirm the results match. This is the final confirmation of the authorisation model. |
| G2 | **The concurrency proof widens the race window deliberately.** `--slow-window` inserts a delay between the read and the write so overlap is certain rather than machine-speed dependent. | low | accepted | This is the correct way to test a lock — the alternative is a test that passes or fails depending on load. The consequence is that the measured timings are not production timings, and the numbers should not be read as benchmarks. |
| G3 | **`supabase db lint` has not been run.** It requires the Supabase CLI linked to a project (A1). | medium | open | Run after A1 and fix anything it reports. The migrations were authored with explicit `search_path` pinning and schema qualification to avoid the classes of issue the linter usually finds. |
| G4 | **Storage bucket policies are not in the migrations.** Bucket creation and its RLS are Supabase-dashboard configuration, so they cannot be version-controlled with the schema. | medium | open | Phase 10 wires uploads; the required bucket policies are documented in `ARCHITECTURE.md` §12. Consider a `storage`-schema migration once the bucket names are settled. |
| G5 | **The seed has no images, prose or prices.** All 4110 products are `price_on_request` with null descriptions and no `product_images` rows, because the reference site's photography and text are its own content. | medium | accepted | Deliberate. Real photography must be uploaded (A6) and prices set in the admin. Until then a seeded product page would render a specification table and no gallery. |
| G6 | **`product_condition` uses `unworn` where the reference uses `pre-owned`/`unworn`.** The seed maps source tags onto the enum. | low | accepted | A naming difference, not a data difference. Documented in `DATABASE_SCHEMA.md` §4. |
| G7 | **Full-text search relies on a single Postgres GIN index** over five text columns. It has no ranking beyond `ts_rank` defaults and no typo tolerance. | low | open | Sufficient for the current catalogue. If search quality proves inadequate in Phase 5, an external index will be needed; it is not planned for any current phase. |
| G8 | **The payment guard needed a line-level exemption.** Two files legitimately name card fields in order to assert their absence, which the content checks flagged. | low | **resolved** | Added a `payment-guard:allow` marker restricted to an explicit file allowlist and unable to suppress dependency, secret-key or webhook-route checks. Verified against adversarial fixtures: a marker cannot smuggle a `stripe` import or a secret key past the guard. |
| G9 | **`db-verify.sh` leaves test fixtures in the database.** The RLS suites and the concurrency harness insert their own products, brands and orders, and none of them wraps itself in a transaction, so a verified database accumulates 10 fixture products and a `Test Brand` on top of the seed's 4110 and 4. | low | accepted | Deliberate for now: the suites need to run against the same database the migrations were applied to, and rollback-per-suite would hide ordering effects between them. `scripts/db-reset.sh` returns to a clean state. The consequence to remember is that raw counts from a verified database are 4120 products and 5 brands, not 4110 and 4 — documented in `DATABASE_SCHEMA.md` §9 and `AGENTS.md` so it is not misread as a seed bug. Revisit if a suite ever asserts on absolute table counts. |

---

## H. Chrome, layout and accessibility items (raised in Phase 3)

| # | Issue | Severity | Status | Next action |
|---|---|---|---|---|
| G10 | **The chrome reads from the fallback fixture while Supabase is unconfigured (A1).** The database-driven navigation is exercised against the seed locally, but the deployed preview uses the fixture. | medium | open | Follows A1. Once the project exists and the seed is applied, the chrome reads the database automatically; `source` in the chrome payload reports which path was taken. |
| G11 | **The age gate is a legal affordance, not a security control.** It is bypassable by clearing `localStorage`, and its answer is not recorded server-side. | low | accepted | Deliberate and documented in the component. It must never be used to gate anything that matters. If a legally binding check is ever required, it needs a server-side verification flow, which no current phase plans. |
| G12 | **The age gate is not in the first paint.** Because the visitor's answer lives in `localStorage`, the server cannot know it, so the gate renders nothing until an effect has read storage. | low | accepted | Deliberate trade-off: rendering the gate in the initial HTML would show it to every returning visitor for a frame. The cost is that a first-time visitor sees the gate appear just after paint. Revisit only if a cookie-based server-readable flag is wanted. |
| G13 | **The `browser-audit` CI job is green on GitHub after the Phase 4 follow-up.** It failed on run 38999968219 with a navigation timeout on `/brands/rolex` (cause G23, a broken `/collections` link and its never-settling prefetch), and passed on run 39079548258 for commit `e68e445`. All three jobs passed: lint/typecheck/test/build, migrations/RLS/concurrency, and the accessibility and responsive audit. | medium | **resolved** | None. Recorded so the failure and its fix stay traceable. |
| G14 | **Lighthouse had not been run when Phase 3 closed.** No score is claimed for any Phase 3 template. | medium | **resolved** | Phase 4 ran Lighthouse against a production build of the homepage: desktop 100/100/100/100, mobile 95–97 performance with 100 accessibility, best practices and SEO. The remaining mobile gap is carried as G19. The Phase 0 target of 100/100 remains a target, not a guarantee, and the actual scores are reported honestly. |
| G15 | **The `(site)` layout sets `revalidate = 300`, so chrome changes are visible within five minutes rather than instantly.** | low | accepted | Deliberate: without it every public page would be dynamic and each request would pay for six navigation queries. Phase 10's admin must call `revalidatePath('/', 'layout')` when navigation or settings change, so an editor sees their edit immediately. |
| G16 | **The design-system page renders invented reference numbers and prices.** They are labelled on the page as illustrative and the page is `noindex` and unlinked. | low | accepted | Deliberate: the page is a token and typography reference. Real product cards arrive in Phase 5 and read every field from the database. The labelling was added in Phase 3 so the page cannot be mistaken for a catalogue. |

---

## I. Homepage and catalogue-surface items (raised in Phase 4)

| # | Issue | Severity | Status | Next action |
|---|---|---|---|---|
| G17 | **The catalogue routes are placeholders.** `/products/[slug]`, `/brands/[slug]` and `/collections/[slug]` validate the slug against the database and 404 honestly, but they render a "planned for Phase 5" panel rather than the real page. | medium | **partially resolved** | Phase 5 replaced `/brands/[slug]` and `/collections/[slug]` with real scoped listings, and added `/shop` and `/search`. `/products/[slug]` is still the placeholder and is Phase 6. |
| G18 | **The homepage is verified against the demo seed, not against the owner's content.** `supabase/seed/03_homepage_demo.sql` creates 17 `homepage_sections` rows plus the inventory and `collection_products` rows the rails need, all clearly labelled demo content, because the owner's editorial copy and imagery do not exist yet (A6). The five brands the homepage renders are the catalogue seed's four plus the `Test Brand` that `db-verify.sh` leaves behind (see G9). | medium | open | Follows A6. The section rows are real `homepage_sections` rows and will be edited in the Phase 10 admin, so the mechanism is proven; only the copy is demo. |
| G19 | **Mobile Lighthouse performance is 95–97, not 100.** LCP is 2.3–2.9 s, CLS is 0 and TBT is 80–120 ms. The remaining cost is simulated CPU time on the first hero paint, not a measurable defect: no render-blocking resource, no layout shift, no oversized image, and fonts are self-hosted and load at 65–82 ms. | low | open | Phase 14. The Phase 0 target of 100/100 remains a target, not a guarantee. Desktop is 100/100/100/100. The honest limitation is that a simulated slow mobile CPU cannot reach 100 on a hero-text LCP without removing the hero, which would be the wrong trade. |
| G20 | **Font preload hints are not emitted.** `next/font` populates `.next/server/next-font-manifest.json` with the three `.p.woff2` files, but the rendered head contains no `<link rel="preload" as="font">`. The fonts still load at 65–82 ms, immediately after the document, so this is not currently a bottleneck. | low | accepted | Left alone deliberately: the observed waterfall shows the hint would save nothing measurable. Revisit in Phase 14 if a real-network measurement disagrees. |
| G21 | **The accessibility audit's detector version had drifted from the lockfile, which hid a real defect from CI.** `axe-core` was declared `^4.11.0`, so the lockfile pinned `4.11.0` and CI's `npm ci` installed it, while the local `node_modules` had resolved `4.14.0`. `4.14.0` detects `label-content-name-mismatch` for a link whose `aria-label` omits its visible text; `4.11.0`–`4.13.0` do not, at any of the four viewports. The logo link therefore failed on every page while CI reported green. | high | **resolved** | Fixed in two parts. The logo link no longer uses `aria-label` (it uses `sr-only` text), and `axe-core` is pinned exactly at `4.14.0` so `npm ci` and local installs cannot diverge again. Two jsdom regression tests in `tests/chrome.test.tsx` assert the accessible name contains the visible text, because axe skips that rule under jsdom (it needs layout). Verified by bisecting the rule across all four versions. |
| G22 | **The not-found page's primary CTA failed WCAG AA colour contrast.** `src/app/not-found.tsx` painted the button with `bg-accent` — the brand gold `gold-500` (`#a18040`), documented as safe only for large text — under a normal-size white label, about 3.4:1 against a 4.5:1 requirement. The same defect existed on the route error boundary (`src/app/error.tsx`). | high | **resolved** | Both now use the shared `Button` primary variant / `bg-gold-700` (`#806428`, 5.6:1). A source-level guard in `tests/design-tokens.test.ts` fails if any file reintroduces `bg-accent`; verified by reintroducing the bug and watching the test fail. The not-found template is also audited explicitly via `/this-page-does-not-exist`, so it can no longer be missed in the no-database configuration CI runs. |
| G23 | **The not-found page linked to `/collections`, which is not a route.** The catalogue is served at `/collections/all` and `/collections/[slug]`; the bare path has no page. The link 404'd for a visitor, and its `next/link` prefetch never settled, which made the browser audit's `networkidle` wait time out on any page that rendered the 404 template. | high | **resolved** | Corrected to `/collections/all` in `src/app/not-found.tsx`. This was the actual cause of the failing CI audit job (run 38999968219): the audit navigated to `/brands/rolex`, which falls back to the not-found template when no database is configured, and the stuck prefetch exceeded the navigation timeout. |
| G24 | **The sandbox's git-ignored `.env.local` and its local PostgreSQL/PostgREST stack were lost when `/tmp` was cleared between sessions.** `.env.local` is not tracked, so it could not be restored from git; the Docker container that held the local database is also gone. | low | accepted | No secret was lost — the file held only local development values and is recreated from `.env.example`. The real database verification for this phase was done with Supabase unconfigured, which is the stricter case. Recreate `.env.local` and the PostgREST proxy (AGENTS.md, "Verifying against a real database") when a local database is needed again. |

---

## J. Catalogue and discovery items (raised in Phase 5)

| # | Issue | Severity | Status | Next action |
|---|---|---|---|---|
| G25 | **`/shop` is the canonical listing; `/collections/all` is a 308.** The reference uses `/collections/all` for "everything", and the project's own earlier docs (G23) assumed that address. Two live URLs for one grid would split canonical signal, so `/shop` is the indexable one and `/collections/all` permanently redirects to it. | low | accepted | If the owner prefers the reference's address as canonical, the redirect reverses and `/shop` becomes the 308. One-line change in `next.config.ts` plus the listing base path. |
| G26 | **Availability is a tri-state (`any` / `available` / `reserved`), not a boolean.** A reserved watch is genuinely spoken for, and the database already distinguishes it through `is_product_available`. Collapsing it to "hide unavailable" would discard a distinction the data carries and that a buyer needs. | low | accepted | Recorded as a deliberate modelling decision. The reference's own filter attributes distinguish reserved from sold, so this matches observed behaviour rather than inventing it. |
| G27 | **Facet counts exclude the dimension being counted.** Selecting a brand must not zero every other brand, or the filter list becomes one-way and a visitor cannot switch brand without clearing the filter first. `p_exclude` on `catalogue_filtered` implements this. | low | **resolved** | Implemented in migration `0010` and verified against real data: with `brand=rolex` selected, the other three brands still render with their own counts. | 
| G28 | **Filtered, searched and sorted listings are `noindex, follow` and canonicalise onto the clean listing.** The decision is made by `isIndexableListing`, not by comparing the canonical path to the listing base. Filtering preserves the base path, so that comparison would have been true for a clean listing and a filtered one alike, and every permutation would have been indexable. | high | **resolved** | Verified at runtime: `/shop` renders `index, follow`; `/shop?brand=rolex` renders `noindex, follow` with `canonical` pointing at the clean `/shop`. The same rule is applied to the brand and collection routes. |
| G29 | **Search has no ranking beyond `ts_rank` defaults and no typo tolerance** (previously G7). Phase 5 wired real database search across title, SKU, reference number, brand and model, but did not add fuzzy matching. | low | open | Sufficient for the current catalogue size. If result quality proves inadequate, a trigram index or an external index would be the next step; neither is planned in a current phase. |
| G30 | **The seed has almost no priced products, so the price sort and price band filter are verified against a small sample.** G5 stands: the seed is `price_on_request` throughout, and the test fixtures add only a handful of priced rows. | low | accepted | Consequence of G5 and A6, not a defect in the query layer. The sort was verified to match the database's own ordering on the rows that do have prices. |
| G31 | **A card's wishlist and add-to-cart controls are not present in Phase 5.** The whole card is a single link to the product. | low | accepted | Phase 7 (cart) and Phase 9 (wishlist). A control that appeared interactive but discarded the click would be worse than its absence, so it is omitted rather than stubbed. |
| G32 | **Phase 5 was verified against a local PostgreSQL + PostgREST stack, not a real Supabase project** (A1 still open). The `supabase-js` client path and RLS were exercised for real; what is unverified is Supabase's own platform behaviour. | high | open | Follows A1 and G1. Re-run the same checks against the real project once it exists. |
| G33 | **`/brands/[slug]` and `/collections/[slug]` are indexable but absent from `sitemap.xml`.** Phase 5 made these routes real and they render `index, follow` with a self-canonical, yet the sitemap still lists only `/` and `/shop`. The database-driven sitemap is Phase 12, so this is a deliberate ordering rather than an oversight, but until Phase 12 a crawler can only reach a brand or collection page by following a link. | medium | open | Phase 12. The brand and collection rows already carry `updated_at`, so the entries can be added with a real `<lastmod>` rather than a build-time fallback. `/shop` itself uses a build-time `lastmod` for the same reason and should be revisited in the same pass. |

---

## K. Product detail items (raised in Phase 6)

| # | Issue | Severity | Status | Next action |
|---|---|---|---|---|
| G34 | **`/products/[slug]` is indexable but absent from `sitemap.xml`.** Phase 6 made the route real and it renders `index, follow` with a self-canonical, yet the sitemap still lists only `/` and `/shop`. This is G33 extended to products, and it is the same deliberate ordering: the database-driven sitemap is Phase 12. Until then a crawler reaches a product page only by following a link, and the dynamic product `lastmod` timestamps the project requires are not yet emitted. | medium | open | Phase 12. `products.updated_at` and `published_at` are already selected by the repository, so the entries can carry a real `<lastmod>` rather than a build-time fallback. |
| G35 | **The product detail page is server-rendered per request, not prerendered.** `generateStaticParams` returns `[]` and the route carries `export const dynamic = 'force-dynamic'` by design: prerendering would freeze price, stock and `lastmod` into the deployment. The consequence is that every product view hits the database, and the page cannot be served from the CDN edge as static HTML. | medium | accepted | Revisit in Phase 12 with ISR (`export const revalidate`) once the sitemap and cache-invalidation story exists, so a stale price and a stale sitemap timestamp are handled together rather than separately. |
| G36 | **The enquiry rate limit is per email address, not per IP.** `submit_product_question` counts submissions for the same address inside a window. Someone willing to vary the email address can submit more, and there is no IP-level throttle because the application cannot see a trustworthy client IP behind Vercel's proxy without extra configuration. | medium | open | Add an IP- or session-level limit in Phase 7, where the order-request flow needs the same protection and the trusted-header question has to be settled once for both. |
| G37 | **The enquiry form has no email-verification step and no spam challenge beyond a honeypot.** A honeypot plus the database rate limit stops naive bots, but nothing stops a determined sender, and no enquiry is confirmed to the sender by email until Phase 8 (Resend). | medium | open | Phase 8 sends the acknowledgement and the admin notification. Reassess whether a stronger challenge is warranted once real traffic exists; adding one now, with no traffic data, would trade conversion for an unmeasured risk. |
| G38 | **Related products are drawn from model, brand and case material only.** `catalogue_similar` has no notion of price proximity, era or collection, so a piece with no model and no brand — as several seed fixtures are — returns an empty related set and the section is correctly omitted. On a sparse catalogue the section can therefore be empty more often than a visitor expects. | low | accepted | The ranking is deliberately simple and explainable, and an empty section is omitted rather than padded. If the owner wants a fuller related row, the next signals would be collection membership and price band. |
| G39 | **A product with no images renders original drawn artwork rather than photography.** The seed catalogue carries no image URLs at all (a licensing decision, A6), so most products show a drawn watch built from their own `dial_color` and `case_material`, captioned "Illustration · photography to follow". The artwork is ours, not a stock photo and not the reference site's, and it invents no detail the product row does not record — but it is still not the real piece, so the storefront is not finished. Media that is not a product (heroes, editorial sections) still shows the plain labelled placeholder. | high | open | Follows A4 and A6: the owner supplies licensed photography and the Storage bucket exists, then Phase 10 wires upload. A real `product_images` row always wins over the drawing. |
| G40 | **The gallery zoom dialog was verified by markup and keyboard wiring, not by a real browser interaction.** The Radix dialog supplies focus trapping, Escape-to-close and focus restoration, and the thumbnail strip uses a roving-tabindex tab pattern, but no automated browser test exercises them. The shell-level axe check covers the page, not the open dialog. | low | open | Add a component test with a real DOM once a browser-test harness exists. Not a blocker: the primitives are Radix's, and the wiring is standard. |
| G41 | **Phase 6 was verified against a local PostgreSQL + PostgREST stack, not a real Supabase project** (A1 still open). The `supabase-js` client path, RLS and the column grants were exercised for real; what is unverified is Supabase's own platform behaviour, including whether the dashboard's generated types match the hand-maintained `database.types.ts`. | high | open | Follows A1 and G1. Re-run the same checks against the real project, and regenerate `database.types.ts` with `supabase gen types` — it was hand-edited here because the CLI install timed out in this environment. |
| G42 | **A database-backed page that reads cookies is misclassified as SSG unless it declares `force-dynamic`, and the failure appears only in a production build.** Phase 6 hit this: `/products/[slug]` exported `generateStaticParams` while reading through the cookie-aware Supabase server client, so `next start` returned a 500 for every product with "Page changed from static to dynamic at runtime". `next dev` and `next build` both passed, so it was invisible to the normal loop. | high | **resolved** | Fixed with `export const dynamic = 'force-dynamic'`, and recorded in `AGENTS.md` as a standing pitfall with the way to catch it (request the real routes against `next start`, not only `next dev`). The underlying risk is not gone for future routes: any new database-backed page has the same shape. |

## L. Wishlist and cart items (raised in Phase 7)

| ID | Finding | Severity | Status | Resolution or next step |
|---|---|---|---|---|
| G43 | **`aria-pressed` on a catalogue filter link failed WCAG and the browser audit.** Every filter row is an `<a>` that navigates; `aria-pressed` is not permitted on a link, so axe reported `aria-allowed-attr` and `npm run audit:a11y` failed on `/collections/all` at desktop width, where the filter panel is expanded rather than folded into a drawer. It was invisible below `md`, where the same filters live in a drawer. | high | **resolved** | This was a Phase 5 defect, not a Phase 7 one: it reproduced on a clean checkout of the previous commit and was red in CI on `main` (run `39125597185`). The selected state now uses `aria-current`, which is the attribute that means "current item in a set of links". `tests/catalogue-params.test.ts` guards it at source level, because jsdom does not run `aria-allowed-attr` — the same layout gap that hid the Phase 3 and Phase 4 defects. Verified by reintroducing the attribute and watching the guard fail. |
| G44 | **Submitting an order request from the cart is not built.** The cart's primary control is rendered disabled with a `title` explaining that the next step is unbuilt, rather than a button that navigates nowhere or silently does nothing. | medium | **resolved** | Phase 7's second pass. The cart's control is now a live link to `/checkout`; the order-request form validates on the server and calls `submit_order_request`, which re-derives every monetary value. `cart_pricing` and the order path still agree by construction, because both are applied in Postgres. |
| G45 | **The guest cart is identified by an httpOnly cookie, so it does not survive a cleared cookie jar or a private window.** A guest who clears cookies loses the cart; there is no server-side way to recover it, because the token was the only link. | low | accepted | Deliberate. The alternative — an identifier the browser could read or forge — would let one visitor reach another's cart. A signed-in cart is unaffected, because it is keyed by `user_id`. |
| G46 | **Phase 7 was verified against a local PostgreSQL + PostgREST stack, not a real Supabase project** (A1 still open). The `supabase-js` client path, RLS and the column grants were exercised for real, including the new `cart_pricing` and `catalogue_by_ids`. What is unverified is Supabase's own platform behaviour. | high | open | Follows A1, G1, G32 and G41. Re-run the same checks against the real project once it exists. |
| G47 | **The sign-in merge runs on the first visit to `/wishlist` rather than at the moment of sign-in.** The sign-in flow is a later phase and does not exist yet, so a merge hooked into it would never run. Hooking it to the wishlist page means the merge happens at the earliest point at which both a session and a browser list exist at once, and it is idempotent — the browser copy is cleared only on a successful merge, so a failure retries. | low | open | Revisit when the sign-in flow is built. The merge action is already written to be callable from there; only the trigger point moves. |
| G48 | **A discount code has no per-customer usage limit and no redemption counter.** `discount_codes` carries an enabled flag and a validity window, but nothing counts how many times a code has been used, so a customer can apply the same code to every request they submit. | medium | **partially resolved** | Phase 7's second pass records a redemption inside `submit_order_request` via `redeem_discount_code`, which takes a row lock and increments `discount_codes.times_redeemed` against `usage_limit`; a rejected or cancelled request returns the use (`release_discount_code`, idempotent). **Still open:** the limit is **per code**, not per customer — one customer can still redeem a code more than once while uses remain. Decide a per-customer limit (and the identity to key it on) before relying on promotions for margin. |
| G49 | **A cart line's `unit_price_cents` is a display snapshot and is never trusted.** It is written when a line is added and can therefore be stale, which is deliberate: the order path recomputes from `products.price_cents`. The risk is that a future reader treats the snapshot as authoritative. | low | accepted | Documented in the column comment and in §8a. `cart_pricing` ignores the snapshot entirely and re-reads the product, so the snapshot cannot influence a displayed or submitted total today. |
| G50 | **The reservation timing was misdescribed in the cart and product copy and in `ARCHITECTURE.md`.** They said a piece is held only once an administrator confirms the request, but `submit_order_request` calls `reserve_inventory` inside the submission transaction, so submitting the form is what holds the piece. | medium | **resolved** | Phase 7's second pass. The copy in the checkout form, the order summary, the cart and the purchase actions, and the reservation sentences in `ARCHITECTURE.md` and `DATABASE_SCHEMA.md`, were corrected to say the pieces are held when the request is submitted and released if it is declined or cancelled. `tests/cart-components.test.tsx` asserts the wording. The database behaviour was already correct; only the description was wrong, which is exactly the kind of error the "no false claims" rule exists to catch. |
| G51 | **A guest order request is only reachable with the exact confirmation link.** The reference and the 256-bit access token are both in the URL, and the token is shown exactly once. A guest who loses the link cannot recover the request. The confirmation email now carries that link (`orderUrl` in `notifyOrderRequestSubmitted`), which is the recovery path the issue asked for — but the email only sends when Resend is configured, and A3 is still open, so on the deployed site the link is still shown only on the confirmation page. | low | open | Closes when A3 is resolved and the confirmation email is delivering. The token is a capability and is deliberately kept out of the administrator's copy, so an administrator can look the request up but cannot hand the customer their link back. |
| G52 | **Order-request submission, like the rest of Phase 7, is verified against a local PostgreSQL + PostgREST stack, not a real Supabase project** (A1 still open). The `submit_order_request` and `read_order_request` RPCs, the guest token path and the RLS boundary were exercised for real; Supabase's own platform behaviour is not covered. | high | open | Follows A1, G1 and G46. Re-run the SQL suites and the client path against the real project once it exists. |
| G53 | **A limited discount code has no per-customer limit.** `usage_limit` and `times_redeemed` bound a code globally, but nothing stops one customer redeeming a multi-use code repeatedly. | medium | open | Deliberate second-pass scope. The redemption is recorded and returned correctly (G48); a per-customer cap needs an identity to key it on, which arrives with accounts in Phase 9. Revisit then. |
| G54 | **The browser audit exercises `/checkout` only in its empty state.** With A1 still open the store is unconfigured, so the audit sees the empty cart rather than a populated order summary and form. A contrast or overflow defect inside a filled cart is therefore not caught by the audit yet. | low | open | The component tests cover the markup and axe under jsdom; the geometry-dependent rules still need a browser. **Partly narrowed:** `npm run preview` now serves a real database, so running `npm run audit:a11y` against it walks real product rows rather than the fallback fixture. The populated checkout is still unaudited, because the audit starts with a fresh browser context and no cart; closing it needs the audit to add an item before walking `/checkout`. |
| G55 | **No email has ever been sent through Resend from this repository.** A3 (no Resend account or verified sending domain) is still open, so the transport's success path — the POST, the response handling and the provider's acceptance — is unexercised. What is verified is the rendered message (`tests/email.test.ts`), the request shape and the no-key path (`tests/email-transport.test.ts`); the send path is covered only by reading it. | high | open | Resolves A3, then send one real request end to end and confirm both messages arrive. The transport returns a result rather than throwing, so a first failure will be logged as `email.send_failed` rather than surfacing to the customer — check the logs, not the page. |
| G56 | **The drawn product artwork is not visually audited in a browser.** `npm run audit:a11y` runs with A1 open, so the catalogue it walks is the fallback fixture; and the artwork is a decorative SVG whose contrast axe does not evaluate. The caption beside it is text and is covered by `design-tokens.test.ts` and the audit, but nothing asserts that the drawing itself is legible against its panel, or that it does not overflow a narrow card. | low | open | **Partly narrowed:** `npm run preview` now serves real product rows, so running `npm run audit:a11y` against it does exercise the artwork at four viewports, and that run is currently green. What remains unverified is the drawing's own legibility against its panel — axe does not evaluate a decorative SVG — so the geometry claim is now covered and the contrast claim is not. |

**Phase 7 added section L and closed one defect that predated it.** The cart and
wishlist are now real: a cart is priced by `cart_pricing` from ids and quantities
only, a discount is recomputed from its code rather than accepted as an amount, a
duplicate wishlist row is impossible by constraint, and a guest's list is merged
into the account once with the database as the source of truth afterwards. The
finding worth carrying forward is G43: the `aria-pressed`-on-a-link defect was a
Phase 5 mistake that CI had been reporting red, and it was found by running the
browser audit locally rather than by reading the code — the same lesson as Phase 3
and Phase 4, that the geometry- and rule-dependent checks are the ones that catch
what a jsdom run cannot see.

**Phase 7's second pass (the order-request flow) resolved G44 and D6, and partly
closed G48 and D4.** The order-request step is now built: the cart links to
`/checkout`, the form validates on the server, and `submit_order_request` re-prices
every line, re-checks availability and records the request transactionally. A guest
reads their request back with a reference **and** an access token (D6), submission
is rate-limited with a honeypot (D4), and a discount redemption is counted under a
row lock and returned on cancellation (G48, per-code only). G46 still stands: this
phase, like Phases 4–6, was verified against a local PostgreSQL + PostgREST stack
because A1 is still open. The one correction this pass made to earlier writing is
the reservation timing — the database holds stock **on submission**, not on
confirmation — and the copy and docs were brought in line with it.

**Phase 6 closed a critical security item (D10).** The `anon` role could read
`products.cost_cents` and `products.compare_at_cents`, the business's cost basis,
through PostgREST. Migration 0011 revokes the table-level `select` grant and
re-grants only the public read surface column by column, so the sensitive columns
are hard-denied (`401`, SQLSTATE `42501`) rather than filtered to an empty result.
This is recorded as D10 and was proven against the real client path before and after
the fix.

## M. Authentication and account items (raised in Phase 9)

| ID | Finding | Severity | Status | Resolution or next step |
|---|---|---|---|---|
| G57 | **Registration, confirmation, sign-in, sign-out and password reset have never been run against a real Supabase project** (A1 still open). The pages render, the guard redirects, the schemas validate and the build is clean, but no session has ever been created. | high | open | Follows A1, G1, G46 and G52. Register a throwaway account, confirm the email, sign in, sign out, and run one reset, then record the result here. |
| G58 | **The `/account/*` pages are not in the browser audit.** They redirect a signed-out visitor to `/login`, so the audit cannot reach them without a seeded session. Their chrome and tokens are covered through the public pages, but a contrast or overflow defect in an account page's own content would not be caught. | medium | open | Needs the audit to sign in first, or a seeded session injected as a cookie. Until then the account pages are covered only by jsdom component tests, which do not evaluate geometry. |
| G59 | **A customer can save more than one address but there is no notion of a default, and no reuse of a saved address at checkout.** `addresses` rows are listed and edited; nothing marks one as preferred and the order-request form does not offer them. | low | open | Deliberate: the order-request form was built in Phase 7, before addresses existed. Adding a default flag and a picker is a small change, but it touches `submit_order_request`'s address handling, so it belongs with Phase 10's admin work or a later pass. |
| G60 | **Email-address changes are not supported.** `profiles` and the auth user carry the address, and Supabase requires a confirmation round trip to change it, so the profile form does not offer the field. | low | open | The form says the address is managed by sign-in rather than showing a disabled input with no explanation. Revisit if customers ask for it. |
| G61 | **The account overview's order count and the order list read the customer's own rows through RLS, but there is no test that a *second* customer cannot see the first customer's orders.** The policy exists (`order_requests` is scoped to `user_id`) and is exercised by the RLS suites from Phase 7, but the account repository's queries have not been run as a second, different signed-in user. | medium | open | Needs A1 or a seeded local session for two users. Add a two-customer test to the RLS suite when the local auth fixture exists. |
| G62 | **A signed-out visitor who reaches `/account` is redirected, but the redirect drops any query string on the requested path.** `x-pathname` carries the pathname only, not the search, so a customer heading for `/account/orders?page=2` returns to page 1. | low | open | Harmless while no account route paginates. If one does, forward `nextUrl.search` alongside the pathname and extend the guard's `startsWith('/account')` check to cover the search. |
| G63 | **Password-change re-authentication signs the user back in but does not rotate the session on the other devices.** Supabase's `updateUser` changes the password; sessions already issued elsewhere stay valid until they expire. | low | accepted | The default Supabase behaviour. A global sign-out after a password change would be the stronger posture; it is a product decision rather than a defect, and it would sign the customer out of the tab they are using. |
| G64 | **The sign-in form's `next` value round-trips through a hidden field, so it is sanitised twice by design and the second sanitisation is what protects the redirect.** The first runs when the page renders the field; the action re-validates before navigating. Removing either would not be caught by the page test alone. | low | accepted | Deliberate defence in depth. `tests/auth-redirect.test.ts` covers the guard and `scripts/a11y-audit.mjs` walks `/login?next=/account/orders`; the action's own re-validation is exercised end to end only when a real sign-in can run, which is G57. |
| G65 | **Migration `0014_account_portal.sql` and the four SQL suites it touches were never executed.** The environment this phase was built in has no local Postgres 17 and no usable Docker daemon, so `./scripts/db-verify.sh` could not run — the first phase in this project where that is true. The migration revokes the table-level `select` grant on the customer-facing tables and re-grants the public columns, which is the same class of change as the Phase 6 fix that a reading of the policies had missed. | high | open | Run `./scripts/db-reset.sh && ./scripts/db-verify.sh` and record the result. The static cross-check (every selected column is granted, no `select('*')` on a restricted table, the guest item read uses the RPC) found no mismatch, but it is a reading, not a proof. |

**Phase 9 added section M.** Authentication and the account area are implemented and
verified as far as an unconfigured Supabase project allows: the guard runs in the
layout, every protected route redirects to `/login?next=<that route>`, the
open-redirect guard is covered by 13 unit tests and was exercised through the running
production build, and the browser audit is green including the new auth pages. The
three defects fixed during the phase — a deprecated Zod email validator that ignored
its message, an optional-text helper that rejected whitespace, and a missing
`revalidatePath` — were all found by tests and by looking at the running build, not by
reading the code. The one design error found by running the server was G62's cause: the
guard sent every protected route to `/account` until middleware forwarded the pathname.

---

## Summary

| Severity | Count | Open |
|---|---|---|
| critical | 7 | 1 |
| high | 24 | 13 |
| medium | 29 | 17 |
| low | 41 | 11 |

"Open" counts only items with status `open` or `in progress`. `resolved`, `mitigated` and `accepted`
items are excluded, which is why the open column is smaller than the count.

**Phase 1 resolved C1, C3, C4 and C6, and mitigated D3 and D8.** The repository has a
`.gitignore`, a committed lockfile, a documented `.env.example`, a `server-only` guard on every
privileged module, a CI guard that fails the build if a payment integration is ever introduced, and
a CI pipeline observed green on `main`.

**Phase 2 resolved D1, D2 and D7, and added section G.** RLS is enabled on all 47 tables with 96
policies and proven by four test suites; role self-escalation is structurally impossible because
roles live in a table with no write policy; and order totals are computed inside the database rather
than trusted from the client. The nine new items in section G are limitations of the verification
method, not defects in the schema — the most significant is G1, that the suites run against a shim
rather than Supabase itself.

**Phase 3 added section H and resolved two real defects that no earlier check could see.** The
media-frame placeholder failed WCAG AA (4.17:1 against a 4.5:1 minimum) and the header overflowed
horizontally at 320px, from three separate causes. Both were found by `scripts/a11y-audit.mjs`
driving real Chromium, because jsdom cannot lay out a document and therefore skips every
geometry-dependent axe rule, colour contrast above all. The lasting lesson is recorded in
`AGENTS.md`: a green jsdom axe run says nothing about contrast or overflow, so the browser audit is
not optional. Section H's open items are G10 (the fixture is in use until A1 is resolved) and G14
(Lighthouse is Phase 14). G11, G12, G15 and G16 are deliberate, documented trade-offs rather than
defects, and G13 was closed once the new browser-audit job was confirmed green in CI.

**Phase 5 added section J.** The catalogue is now real: `/shop` is the one canonical "everything" listing (with `/collections/all` a 308 to it), `/brands/[slug]` and `/collections/[slug]` are scoped listings that 404 an unknown slug, and `/search` reuses the same query layer rather than a second pipeline. The two findings worth carrying forward are G28, where the `noindex` decision had been derived from a comparison that was true for clean and filtered listings alike, and G27, where facet counts had to exclude their own dimension or the filter list became one-way. Both were caught by checking rendered output against the database rather than by reading the code. G17 is now partially closed, with `/products/[slug]` remaining for Phase 6, and G32 records that this phase, like Phase 4, was verified against a local PostgREST stack because A1 is still open.

**Phase 4 added section I and closed the Lighthouse question for the homepage.** The home page is
now assembled from `homepage_sections` rather than a hardcoded array, every card value is read from
the database, and the catalogue links resolve against real rows: a draft, archived or invented slug
404s instead of rendering. Verification was run against a real PostgreSQL database through
PostgREST — the first time in this project that the actual `@supabase/supabase-js` client path,
including RLS, has been exercised end to end rather than against a shim. Lighthouse was run against
a production build and the real scores are recorded: desktop 100/100/100/100, mobile 95–97
performance with 100 accessibility, best practices and SEO. The mobile shortfall is recorded as G19
rather than rounded up; the diagnosis is in the entry, and the honest conclusion is that a
simulated slow CPU cannot reach 100 on a hero-text LCP without deleting the hero. G17 and G18 are
the remaining open items — the placeholder catalogue routes and the demo homepage seed — and both
are closed by Phase 5 and A6 respectively.

**Phase 4 also found a defect that CI's own detector was too old to see, which is the more useful
lesson.** The logo link failed WCAG 2.5.3 on every page and at every viewport, and it was visible
locally but not in CI. The cause was not the fallback/database chrome split, as first suspected: it
was `axe-core` version drift. The manifest declared `^4.11.0`, so the lockfile pinned `4.11.0` and
`npm ci` installed that in CI, while the local `node_modules` had resolved `4.14.0`. Bisecting the
rule across `4.11.0`, `4.12.0`, `4.13.0` and `4.14.0` showed the older three do not flag this
markup at any viewport and `4.14.0` does, so the bug was always in the source and CI was running a
detector that could not see it. The fix is twofold — the link no longer overrides its contents, and
`axe-core` is now pinned exactly so the two environments cannot diverge — and two jsdom regression
tests assert the invariant directly, because axe skips that rule without layout. Recorded as G21.
The general lesson, added to `AGENTS.md`, is that a caret range on an audit tool means CI and local
runs can disagree about what counts as a violation, so the detector itself must be pinned.

**The single remaining open critical is A1**, owner-side setup: no Supabase project exists yet. Every
critical security property that could be proven without a Supabase account has been proven. A2 and
G1 are the two items that need A1 resolved before they can be closed.

**Phase 6 found and closed a critical leak that had been live since Phase 2: `products.cost_cents`
and `products.compare_at_cents` were readable by the `anon` role.** RLS restricts rows, not columns,
and the public-read policy on `products` was row-scoped, so the business's cost basis was exposed to
anyone holding the public anon key. It was proven against the real client path — `select=slug,
price_cents,cost_cents` returned `cost_cents: 4200000` — before the fix, and the fix was proven the
same way after it. Migration `0011` revokes the table-level `select` grant and re-grants only the
public read surface column by column, so the sensitive columns are now hard-denied rather than
filtered to an empty result, and a bare `select('*')` fails loudly instead of silently succeeding.
Recorded as D10, and it carries a lesson for every later phase: on a publicly-readable table, a new
column is exposed by default unless the grant list is updated with it. This is the second defect of
this kind the project has found by testing against real infrastructure rather than trusting a
reading of the policies, which is why that practice is kept.

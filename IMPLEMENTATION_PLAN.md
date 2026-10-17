# Implementation Plan — Luxury Watch E-commerce Platform

Last updated: 2026-10-17 (end of Phase 1)
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
| 2 | Supabase project, database schema, migrations, RLS, generated types | not started | 1 |
| 3 | Authentication, profiles, roles, protected routes | not started | 2 |
| 4 | Design system, global chrome (top bar, announcement, header, mega menu, footer, age gate) | not started | 1, 2 |
| 5 | Catalogue: brands, models, collections, product listing, filters, sort, search | not started | 2, 4 |
| 6 | Product detail page, media gallery, specs, related/recently viewed, wishlist | not started | 5 |
| 7 | Cart, manual order-request flow, payment-method selection, delivery/pickup, confirmation | not started | 5, 6 |
| 8 | Resend transactional email, templates, admin notifications | not started | 7 |
| 9 | Customer account area (orders, wishlist, profile, addresses) | not started | 3, 7 |
| 10 | Admin platform (products, brands, models, collections, inventory, orders, inquiries, media, pages, announcements, payment methods, settings) | not started | 2, 3, 7 |
| 11 | Service flows (sell/trade, sourcing, repair), contact, CMS pages, FAQ, testimonials | not started | 4, 8, 10 |
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

## Phase 2 — Database schema, migrations and RLS

**Goal:** the real Supabase schema, versioned, with row-level security from the start.

**Scope**
- Supabase local dev config (`supabase/config.toml`) and `supabase/migrations/*.sql`
- Every table from `ARCHITECTURE.md` §5, with FKs, constraints, indexes, `updated_at` triggers
- Enum types: `product_status`, `order_request_status`, `inquiry_type`, `inquiry_status`,
  `user_role`, `collection_kind`, `condition`
- RLS **enabled on every table**, default deny, with explicit policies:
  - anonymous: read published products, active brands/models/collections, published pages, published
    FAQs, active announcements, active payment methods and delivery options
  - customer: manage own cart, own wishlist, own order requests, own inquiries, own profile
  - admin: full access, via `security definer` `public.is_admin()`
- Trigger + policy preventing `profiles.role` self-escalation
- `order_requests.reference` generator (human-readable, unique)
- Generated TypeScript types → `lib/database.types.ts` (regenerated by script, not hand-edited)
- `DATABASE_SCHEMA.md` documenting every table, column, policy and invariant
- Seed script producing **clearly labelled demo data** (never presented as real transactions)

**Acceptance criteria**
- Migrations apply cleanly to a fresh database and are idempotent-safe by versioning
- `supabase db lint` clean
- RLS verified by real tests: anonymous cannot read drafts; a customer cannot read or modify another
  customer's order request, cart or wishlist; a customer cannot write products; only admin can
  change `order_request_status` to `paid_offline`
- Schema contains **no** payment credential, card or gateway field anywhere

---

## Phase 3 — Authentication, profiles and roles

**Scope**
- Supabase Auth with `@supabase/ssr` cookie-based sessions, middleware-refreshed
- `/login`, `/register`, `/forgot-password`, `/reset-password`, email confirmation
- `profiles` row auto-created on signup via trigger; role defaults to `customer`
- `/admin` guarded server-side by role; unauthorised users get a real 403, not a redirect loop
- Account menu reflecting real auth state
- Server-side Zod validation on every auth action; generic error messages that do not leak whether
  an email exists

**Acceptance criteria**
- Register → confirm → login → logout works end to end against real Supabase
- A `customer` cannot reach any `/admin` route or mutation
- Session refresh works; no auth flash-of-wrong-state
- Tests cover the role guard on both route and service level

---

## Phase 4 — Design system and global chrome

**Scope**
- Component primitives (button, input, select, textarea, dialog, sheet, accordion, badge, card,
  breadcrumb, skeleton) built on shadcn/ui + Tailwind tokens
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
- Home page composition matching the reference's section order, database-driven

**Acceptance criteria**
- Every card value comes from the database; no hardcoded product
- Filters and sort work against real data and are reflected in the URL
- Empty states are honest and actionable
- Facet permutations are not indexable; clean collection URLs are canonical

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

---

## Phase 7 — Cart and manual order-request flow

**Goal:** the commerce path — with **no payment processing anywhere**.

**Scope**
- Cart: add/update/remove, quantity, guest cart via session token, merge on login, server-side
  re-pricing on every read and write
- Cart drawer + `/cart` page sharing one state source
- `/order-request`: collect name, email, phone, fulfilment (delivery or pickup), delivery address
  when applicable, **payment method chosen from admin-enabled methods**, customer note
- Server-side validation, rate limiting, honeypot
- Totals recomputed from the database — client totals are ignored
- `order_requests` + `order_request_items` + `order_request_events` written transactionally
- Confirmation page with reference number, explicit "request received / payment arranged offline"
  language
- Guest lookup by reference **+ email**
- Stock is **not** decremented on submission; admin confirmation reserves stock

**Acceptance criteria**
- End-to-end: browse → add to cart → order request → confirmation, against real Supabase
- **Zero** payment gateway, SDK, card field, iframe or provider reference anywhere in the codebase
- Confirmation copy never claims payment was made
- Totals cannot be manipulated by tampering with client payloads (tested)
- Disabled payment methods cannot be selected (tested)

---

## Phase 8 — Transactional email (Resend)

**Scope**
- `lib/email/resend.ts` transport with a no-key fallback that logs instead of sending
- Templates: order request received (customer), new order request (admin), status changed
  (customer), inquiry received (admin), inquiry reply (customer), welcome, newsletter confirmation
- Send from services after the database write succeeds; email failure must not roll back data
- Delivery/failure logging surfaced in admin

**Acceptance criteria**
- Emails send in a configured environment and are logged in an unconfigured one
- Every template states offline payment clearly and never claims payment
- No API key in the repo or the client bundle

---

## Phase 9 — Customer account area

**Scope**
- `/account` overview, `/account/orders` (own order requests with status timeline), order detail
- `/account/wishlist`, `/account/profile`, address book
- Honest empty states; no invented orders

**Acceptance criteria**
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
- `robots.txt` route disallowing `/admin`, `/account`, `/cart`, `/order-request`, `/api`, and
  filtered/sorted permutations
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

- **Completed:** Phase 0 — audit and planning documents.
- **Application code:** none. Repository contains documentation and `.env.example` only.
- **Next phase to run:** Phase 1 — Foundation.
- **Blockers:** none for Phase 1. Phases 2+ need a Supabase project; Phases 7+ need a Resend account.
  Both are owner-side setup steps documented in `.env.example` and `KNOWN_ISSUES.md`.

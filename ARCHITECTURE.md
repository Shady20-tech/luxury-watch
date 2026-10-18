# Architecture — Luxury Watch Storefront & Administration Platform

Status: **Phase 0 (planning)**. No application code exists yet.
Last updated: 2026-10-16

This document is the authoritative architecture reference. Every phase must conform to it, or amend
it with a recorded reason in `CHANGELOG.md` and `IMPLEMENTATION_PLAN.md`.

---

## 1. Binding decisions

| Area | Decision |
|---|---|
| Framework | **Next.js 15** (App Router), React, TypeScript |
| Styling | Tailwind CSS; shadcn/ui selectively; Lucide icons |
| Rendering | Server Components **by default**; Client Components only where interaction requires |
| Data | **Supabase PostgreSQL** |
| Auth | **Supabase Auth** |
| Files | **Supabase Storage** |
| Authorisation | **Row Level Security (RLS)** on every table |
| Validation | **Zod**, shared between server and client |
| Forms | React Hook Form where it materially helps |
| Email | **Resend** (transactional only) |
| Hosting | **Vercel** |
| Payments | **None.** No gateway, no online processing, no provider abstraction, no webhooks, no card data |
| Order model | **Manual order request** reviewed offline by an administrator |

Business logic lives in **server-side services and repositories**. Visual components do not query
the database directly.

### 1.1 Framework version note

The binding decision names **Next.js 15**. At audit time npm `latest` is 16.4.2. We stay on the
**latest stable 15.x** (15.5.x line) as instructed and pin it in `package.json`. Upgrading to 16 is
a decision for the project owner, not a silent change.

### 1.2 Package manager

The repository has **no lockfile** and **no `package.json`** at Phase 0. This is a greenfield
repository, so there is no existing package manager to respect. We standardise on **npm**
(`package-lock.json`), which is present in the runtime environment (`npm 11.19.1`) and is the
Vercel default. This choice is recorded here rather than changed silently later.

---

## 2. Repository audit result (Phase 0)

```
luxury-watch/
├── .git/
└── .example.env      # 1 byte — empty file, no variables
```

- Commits: **1** (`c658c2b Create .example.env`)
- Branch: `main`, tracking `origin/main` (`github.com/Shady20-tech/luxury-watch`)
- No `package.json`, no `src/`, no `app/`, no migrations, no tests, no CI, no `vercel.json`
- **Conclusion: greenfield.** There is no existing application to preserve, so "scaffold a new app"
  is legitimate here. This is the documented reason required by the phase rules.

Because there is no prior work to preserve, Phases 1+ build the application in place in this
repository. `.example.env` is superseded by `.env.example` and should be removed in Phase 1 (it is
empty and misnamed, which is a setup trap).

---

## 3. System context

```
        ┌──────────────────────────────────────────────┐
        │            Browser (public + admin)          │
        └───────────────┬──────────────────────────────┘
                        │ HTTPS
        ┌───────────────▼──────────────────────────────┐
        │  Vercel — Next.js 15 App Router              │
        │  ┌────────────────┐  ┌─────────────────────┐ │
        │  │ Server         │  │ Route Handlers /    │ │
        │  │ Components     │  │ Server Actions      │ │
        │  │ (read paths)   │  │ (mutations)         │ │
        │  └───────┬────────┘  └──────────┬──────────┘ │
        │          │  services / repositories          │
        │          ▼                                    │
        │  ┌──────────────────────────────────────────┐ │
        │  │ Supabase clients                          │ │
        │  │  • request-scoped (anon + user JWT)       │ │
        │  │  • service-role (server-only, admin ops)  │ │
        │  └──────────────────────────────────────────┘ │
        └───────┬─────────────────────┬─────────────────┘
                │                     │
      ┌─────────▼─────────┐  ┌────────▼─────────┐  ┌──────────────┐
      │ Supabase Postgres │  │ Supabase Storage │  │ Resend       │
      │ + Auth + RLS      │  │ (product media)  │  │ (email)      │
      └───────────────────┘  └──────────────────┘  └──────────────┘
```

There is **no payment provider in this diagram, by design**.

---

## 4. Route architecture

### 4.1 Public storefront

| Route | Template | Rendering |
|---|---|---|
| `/` | Home | Server Component, ISR |
| `/collections/[slug]` | Collection / PLP | Server Component, ISR + `searchParams` facets |
| `/brands/[slug]` | Brand landing | Server Component, ISR |
| `/products/[slug]` | Product detail | Server Component, ISR + `generateStaticParams` |
| `/search` | Search results | Server Component, dynamic |
| `/cart` | Cart page | Client-heavy island, server shell |
| `/wishlist` | Wishlist | Auth-aware, dynamic |
| `/pages/[slug]` | CMS pages (about, policies, FAQs…) | Server Component, ISR |
| `/services/sell-trade` | Service flow | Server shell + form island |
| `/services/sourcing` | Service flow | Server shell + form island |
| `/services/repair-restoration` | Service flow | Server shell + form island |
| `/contact` | Contact | Server shell + form island |
| `/order-request` | Order request submission | Server shell + form island |
| `/order-request/[reference]` | Request confirmation | Dynamic, no cache |
| `/account`, `/account/orders`, `/account/orders/[id]`, `/account/wishlist`, `/account/profile` | Customer account | Auth-gated, dynamic |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Auth | Dynamic |
| `/sitemap.xml`, `/robots.txt`, `/sitemap-products.xml` etc. | SEO | Route handlers, revalidated |
| `/api/revalidate` | Cache/sitemap invalidation | Route handler, signed |

### 4.2 Admin

All under `/admin`, all gated by an `is_admin` authorisation check enforced **server-side and in
RLS** — never by client-side conditionals alone.

`/admin` (dashboard) · `/admin/products` · `/admin/products/new` · `/admin/products/[id]` ·
`/admin/brands` · `/admin/models` · `/admin/collections` · `/admin/inventory` · `/admin/orders` ·
`/admin/orders/[id]` · `/admin/inquiries` · `/admin/payment-methods` · `/admin/announcements` ·
`/admin/pages` · `/admin/media` · `/admin/settings` · `/admin/seo`

---

## 5. Data model (target)

Full DDL lands in Phase 2 as versioned SQL migrations under `supabase/migrations/`.

> **As of Phase 2 this section is the design intent, not the reference.**
> `DATABASE_SCHEMA.md` is authoritative for every table, column, constraint, enum
> and policy, because it was written by reading the schema back from a running
> database. This section is kept because it explains *why* the model is shaped the
> way it is, and it is updated wherever Phase 2 diverged from it — but if the two
> disagree, believe `DATABASE_SCHEMA.md`.

### 5.1 Catalogue

- `brands` — id, name, slug, description, logo_url, hero_image_url, seo_*, is_active, sort_order
- `models` — id, brand_id → brands, name, slug, description, is_active, sort_order
  *(the Brand → Model two-level taxonomy observed in the reference)*
- `products` — id, sku, slug, title, brand_id, model_id, reference_number, description, short_description,
  condition (`new`/`pre_owned`/`vintage`), year, case_size_mm, case_material, movement, dial_color,
  bracelet_material, waterproof_m, box_and_papers, **price_cents**, **currency**,
  **price_on_request** (bool), cost_cents, status (`draft`/`published`/`archived`), is_featured,
  published_at, seo_title, seo_description, seo_keywords, og_image_url, created_at, updated_at
- `product_images` — id, product_id, storage_path, alt_text, width, height, sort_order, is_primary
- `product_specs` — id, product_id, label, value, sort_order *(flexible spec pairs)*
- `collections` — id, title, slug, description, kind (`taxonomy`/`merchandising`/`featured`/`novelty`),
  hero_image_url, seo_*, is_active, sort_order
- `collection_products` — collection_id, product_id, sort_order *(curated merchandising sets)*
- `inventory` — id, product_id, quantity, reserved_quantity, low_stock_threshold, location, updated_at

### 5.2 Commerce (no payments)

- `payment_methods` — id, code, label, description, instructions, is_enabled, sort_order
  *(admin-controlled list: bank transfer, mobile money/manual transfer, cash on pickup)*
- `delivery_options` — id, code (`delivery`/`pickup`), label, description, fee_cents, is_enabled, sort_order
- `carts` — id, user_id (nullable for guests), session_token, currency, discount_code (nullable),
  created_at, updated_at
- `cart_items` — id, cart_id, product_id, quantity, unit_price_cents (snapshot at add time)
- `discount_codes` — id, code, label, kind (`percentage`/`fixed_amount`/`free_delivery`), value,
  min_subtotal_cents, max_discount_cents, is_enabled, starts_at, ends_at. No public read policy.
- `order_requests` — id, reference (human-readable, unique), user_id (nullable), customer_name,
  customer_email, customer_phone, fulfilment_type, delivery_address jsonb (nullable), pickup_location,
  payment_method_code, customer_note, admin_note, subtotal_cents, delivery_fee_cents, total_cents,
  currency, status (`submitted`/`under_review`/`confirmed`/`awaiting_payment`/`paid_offline`/
  `fulfilled`/`cancelled`/`rejected`), settled_offline_at, settled_offline_by, ip_hash, user_agent,
  created_at, updated_at
- `order_request_items` — id, order_request_id, product_id (nullable if product later deleted),
  product_title_snapshot, sku_snapshot, unit_price_cents, quantity
- `order_request_events` — id, order_request_id, actor, from_status, to_status, note, created_at

**Critical invariant:** `order_requests.status` has **no** `paid` value that the customer can cause.
`paid_offline` can only be set by an administrator after payment is verified outside the website.
Nothing in the schema stores card numbers, CVV, or any payment credential.

**Cart pricing lives in the database, not in the application (Phase 7).** The cart's numbers come
from `cart_pricing(lines, discount_code, currency)`, which takes product **ids and quantities** and
re-reads every product. There is no parameter through which a price or a stock count could arrive,
so a tampered request has nothing to tamper with. This is the same reasoning as
`submit_order_request`: one implementation of "what does this line cost", used by the cart, the
drawer and the order path, rather than an application copy that can drift from the order path's
copy. The TypeScript mapper (`src/lib/cart/pricing.ts`) formats the payload and does no arithmetic.
A discount is stored as a **code reference**, never as an amount, and is valued from the code row on
every read.

**A cart does not reserve stock.** `cart_pricing` is read-only and never touches `inventory`,
`inventory_reservations` or `inventory_transactions`. It reports availability as booleans and never
returns a stock count, so the result cannot be used to probe the business's inventory position. The
piece is held only when an order request is submitted and an administrator confirms it.

**Guest ownership is not expressible in a policy.** A signed-in cart is owner-scoped by RLS. A guest
cart has no policy at all, because there is no way to prove ownership of a guest row from inside a
policy; it is handled exclusively server-side with the service-role client, with the session token
in an httpOnly cookie. The wishlist follows the same split — a signed-in list in the database, a
guest list in `localStorage` merged once on sign-in.

### 5.3 Service inquiries

- `inquiries` — id, type (`sell_trade`/`sourcing`/`repair`/`general`/`product_question`),
  product_id (nullable), name, email, phone, message, metadata jsonb (e.g. brand/model/year/condition
  for sell-trade), status (`new`/`in_review`/`responded`/`closed`), created_at, updated_at
- `inquiry_replies` — id, inquiry_id, admin_id, body, sent_at

### 5.4 Content & config

- `pages` — id, slug, title, content (rich structure), seo_*, status, published_at, updated_at
- `faqs` — id, question, answer, category, sort_order, is_published
- `announcements` — id, message, link_label, link_url, is_active, sort_order, starts_at, ends_at
- `testimonials` — id, quote, author, location, rating, is_published, sort_order
- `site_settings` — singleton: business name, logo, address, phone, email, socials, WhatsApp URL,
  default currency, age-gate enabled, age-gate minimum age
- `navigation_items` — id, location (`header`/`footer`/`topbar`), parent_id, label, href, sort_order, is_active

### 5.5 Accounts & auth

- Supabase `auth.users` is the identity source.
- `profiles` — id (= auth.users.id), email, full_name, phone, avatar_url,
  marketing_opt_in, created_at, updated_at. Created by the `on_auth_user_created`
  trigger.
- `user_roles` — id, user_id → profiles, role (`staff_role`), granted_by,
  granted_at, expires_at. **Roles are deliberately not a column on `profiles`.**

  > Phase 0 planned `profiles.role` with values `customer`/`staff`/`admin`. Phase 2
  > changed this, and the change is worth understanding rather than glossing over.
  >
  > A customer must be able to edit their own profile. RLS cannot restrict
  > *columns*, only rows, so a policy allowing `UPDATE` on your own profile allows
  > updating every column of it — including `role`. The usual mitigations (a
  > `WITH CHECK` comparing against the old value, or a trigger rejecting role
  > changes) both work, but both are single points of failure guarding the most
  > valuable column in the schema. Moving roles to a separate table with no write
  > policy removes the writable surface altogether: there is nothing to protect
  > because there is nothing a customer can write.
  >
  > This also replaced the three-value `role` with a seven-value `staff_role`,
  > which is what the admin permission model actually needs — see
  > `DATABASE_SCHEMA.md` §6 for the full reasoning and the permission map.

- `wishlists` — id, user_id, is_default, created_at, updated_at
- `wishlist_items` — id, wishlist_id, product_id, created_at
- `newsletter_subscribers` — id, email, is_confirmed, confirmed_at, token,
  created_at

---

## 6. Data access pattern

### 6.1 Two Supabase clients

| Client | Key | Used for | Never used for |
|---|---|---|---|
| **Request-scoped** | `anon` key + the caller's JWT from cookies | All user-facing reads/writes; RLS evaluates the real user | — |
| **Service-role** | `SUPABASE_SERVICE_ROLE_KEY` | Admin operations that must bypass RLS, sitemap generation, email dispatch, guest order lookup by reference | Anything on a path an unauthenticated visitor can influence |

Rules:
- `SUPABASE_SERVICE_ROLE_KEY` is imported **only** inside `lib/supabase/admin.ts` guarded by
  `import 'server-only'`. It must never be referenced from a Client Component.
- Every service-role call re-checks authorisation in application code. Bypassing RLS does not
  bypass authorisation.
- Public reads of published content may use the request-scoped client; RLS already restricts rows to
  `status = 'published'` for anonymous callers.

### 6.2 Layering

```
app/**            (routes, layouts, page composition — no SQL)
  └─ components/** (presentational + interactive islands)
  └─ lib/validation/** (Zod schemas — shared with forms)
  └─ server/services/** (business rules, orchestration, email, revalidation)
        └─ server/repositories/** (SQL / Supabase queries, no business rules)
              └─ lib/supabase/** (clients)
```

Server Actions and Route Handlers are thin: parse → Zod validate → call service → shape response.
Visual components never import a repository.

---

## 7. Security boundaries

1. **RLS on every table.** Default deny. Explicit policies for anonymous, authenticated customer,
   staff and admin.
2. **Authorisation is server-side.** The `role` on `profiles` is checked in services and mirrored in
   RLS via a `security definer` helper such as `public.is_admin()`.
3. **`profiles.role` is not self-writable.** A customer cannot promote themselves; the column is
   protected by policy and by a trigger, not by UI.
4. **Never trust client input.** All mutation inputs pass Zod on the server even when the client
   already validated them.
5. **Secrets.** No secret is committed. `.env.example` lists names only. `NEXT_PUBLIC_*` is reserved
   for values that are genuinely public (Supabase URL, anon key, site URL).
6. **Service-role key** is server-only, never logged, never sent to the client.
7. **Guest order lookup** requires the exact `reference` **and** the email used, rate-limited; a
   reference alone is not sufficient authorisation.
8. **Rate limiting** on public mutation endpoints (inquiries, contact, newsletter, order requests,
   auth) via a Postgres-backed counter or an edge-compatible limiter — no third-party payment or
   CAPTCHA provider is required, but a honeypot plus server-side rate limit is mandatory.
9. **Spam and abuse.** Inquiry and order-request forms include a honeypot field and server-side
   validation; submissions are stored, not emailed raw to a public address.
10. **Audit trail.** `order_request_events` records every status transition with actor and note.
11. **Headers.** CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS in
    `next.config.ts`. CSP must allow Supabase and Supabase Storage origins only.
12. **Uploads.** Admin-only, MIME- and size-validated, written to Storage under an admin-only bucket
    policy. Public read is granted per-object for published product media only.
13. **No payment surface at all** — no card fields, no iframes, no provider SDKs. This removes an
    entire class of PCI scope by construction.

---

## 8. Order-request flow (the core commerce path)

```
Customer                Next.js (server)                 Supabase                 Resend
   │                          │                             │                       │
   │ add to cart              │                             │                       │
   ├─────────────────────────►│ upsert cart + cart_items ──►│                       │
   │                          │                             │                       │
   │ open /order-request      │                             │                       │
   ├─────────────────────────►│ read enabled              ─►│ payment_methods       │
   │                          │ delivery_options            │                       │
   │◄─────────────────────────┤                             │                       │
   │ choose method +          │                             │                       │
   │ fulfilment, submit       │                             │                       │
   ├─────────────────────────►│ Zod validate                │                       │
   │                          │ rate-limit + honeypot       │                       │
   │                          │ re-price server-side from   │                       │
   │                          │   current product prices     │
   │                          │   (never trust client totals)│                       │
   │                          ├─ insert order_request ─────►│                       │
   │                          ├─ insert items + event ─────►│                       │
   │                          ├─ email customer ────────────┼──────────────────────►│
   │                          ├─ email admin ───────────────┼──────────────────────►│
   │◄─────────────────────────┤ redirect to confirmation    │                       │
   │                          │                             │                       │
   │        ── payment happens OUTSIDE the website ──        │                       │
   │                          │                             │                       │
   │                    admin reviews /admin/orders          │                       │
   │                          ├─ transition status ─────────►│                       │
   │                          ├─ optional email ────────────┼──────────────────────►│
```

**Honesty requirements for this flow:**
- Confirmation copy states the request was **received** and that payment will be arranged offline.
- It never says "payment successful", "paid", or "order complete".
- Stock is **not** decremented on submission alone; an admin confirms the request, and confirmation
  performs the reservation. This avoids silently overselling.
- Totals are recomputed server-side from the database. Client-supplied prices are ignored.

---

## 9. Email flow (Resend)

Transactional only, sent from server services, never from the browser.

| Trigger | Recipient | Purpose |
|---|---|---|
| Order request submitted | Customer | "Request received — reference #, items, chosen method, next steps, payment arranged offline" |
| Order request submitted | Admin | New request notification with admin link |
| Order request status changed | Customer | Status update (confirmed, awaiting payment, fulfilled, cancelled) |
| Inquiry submitted | Admin | New inquiry notification |
| Inquiry replied | Customer | Admin reply |
| Account registered | Customer | Welcome |
| Password reset | Customer | Reset link (Supabase Auth template or Resend) |
| Newsletter signup | Customer | Confirmation / double opt-in |

Implementation notes:
- `lib/email/resend.ts` wraps the SDK; `lib/email/templates/*` holds React Email-style templates.
- Sending is **best-effort and non-blocking**: a failed email must not roll back a stored order
  request. Failures are logged and surfaced in admin.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are server-only.
- In local/preview environments without a key, the transport logs the rendered payload instead of
  sending, so flows remain testable without a real key.

---

## 10. SEO architecture

| Concern | Approach |
|---|---|
| Metadata | `generateMetadata` per route from database SEO fields, with sensible fallbacks |
| Canonicals | Absolute URLs from `NEXT_PUBLIC_SITE_URL`; filtered/paginated variants self-canonicalise or `noindex` |
| Faceted navigation | Filter permutations that multiply URLs get `noindex, follow`; only the clean collection URL is canonical |
| Sitemap | `/sitemap.xml` index → products, collections, brands, pages, blog; every product entry uses its **real `updated_at`** as `<lastmod>` |
| Sitemap freshness | Publish / edit / unpublish / archive / delete triggers `revalidateTag('sitemap')` and the relevant product/collection tags |
| Structured data | `Organization`, `LocalBusiness`, `WebSite` + `SearchAction`, `BreadcrumbList`, `Product` (+ `Offer` **only** when a real price is published), `FAQPage` where Q&A is visible |
| Product schema honesty | `brand` is the actual manufacturer from `brands`. No `offers` when `price_on_request` is true |
| Robots | Explicit `Disallow` for `/admin`, `/account`, `/cart`, `/order-request`, `/api`, filtered and sorted collection permutations |
| Images | `next/image`, explicit dimensions, descriptive `alt` from `product_images.alt_text`, AVIF/WebP |
| Crawl hints | We document that `<lastmod>` is a hint; we do not claim it forces a recrawl |

---

## 11. Performance & Lighthouse strategy

Target: **100/100** in Performance, Accessibility, Best Practices and SEO on the key public
templates (home, collection, product, a CMS page, contact) **where technically achievable**.

Levers:
- Server Components by default; ship JS only for real interaction
- `next/image` with `sizes` and priority only on the LCP element
- Font strategy: self-hosted display serif + body sans with `font-display: swap` and `next/font`
  preloading, subset
- Streaming and Suspense boundaries; no blocking client waterfalls
- ISR for catalogue reads; tag-based revalidation on admin writes
- Zero third-party scripts by default; any analytics added must be deferred and consented
- Explicit width/height everywhere to keep CLS at 0
- Accessibility: zoomable viewport, skip link, focus-visible rings, `aria-modal` dialogs with focus
  traps, pausable carousels, `prefers-reduced-motion`, AA contrast verified for the gold accent on
  both light and dark surfaces
- Best Practices: no console errors, correct `Content-Type`s, HTTPS, no deprecated APIs, CSP without
  `unsafe-eval`

We will run real audits and report actual scores plus evidence. We will not fabricate scores, and we
will record any remaining limitation honestly in `KNOWN_ISSUES.md`.

---

## 12. Vercel deployment assumptions

- **Project root:** repository root (single app, no monorepo workspace at Phase 0).
- **Build:** `next build`; install via `npm ci`.
- **Node runtime:** 20.x or 22.x on Vercel.
- **Environment variables** are set in the Vercel dashboard per environment (Production, Preview,
  Development). `.env.example` documents names only.
- **Regions:** default; Supabase region should be chosen near the primary audience and recorded.
- **Preview deployments:** Deployment Protection may be enabled, which blocks automated inspection of
  preview URLs. Where that blocks QA, the owner must either enable *Protection Bypass for Automation*
  and supply the secret, or allow preview access. This is recorded in `KNOWN_ISSUES.md`.
- **No separate VPS path.** No Dockerfile, no docker-compose, no nginx config for deployment.
- **Migrations** are applied via the Supabase CLI or the Supabase SQL editor — not at Vercel build
  time. A build must never mutate production schema.
- **ISR and sitemap cache** rely on `revalidateTag`; a shared revalidation secret protects
  `/api/revalidate` so only our own server can trigger it.

### 12.1 Required environment variables (names only)

```
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL                 # migrations / CLI only, never used at runtime
RESEND_API_KEY
RESEND_FROM_EMAIL
RESEND_ADMIN_EMAIL
REVALIDATION_SECRET
NEXT_PUBLIC_DEFAULT_CURRENCY
NEXT_PUBLIC_ENABLE_AGE_GATE
```

---

## 13. Testing strategy

| Layer | Tool | Scope | Status |
|---|---|---|---|
| Types | `tsc --noEmit` | whole project | **active** |
| Lint | ESLint (`next/core-web-vitals` + `next/typescript` + `prettier`) + explicit `jsx-a11y` rules | whole project | **active** |
| Format | Prettier `--check` | whole project | **active** |
| Policy guard | `scripts/check-no-payment-providers.mjs` | payment integration, card fields, payment webhooks, provider-named routes | **active** |
| Unit | Vitest | env validation and graceful degradation, log redaction, error non-leakage, schema.org honesty, sitemap `lastmod` honesty, design-token contrast (computed from the real WCAG formula) | **active** — 106 tests |
| Integration | Vitest against a local Supabase instance | repositories + RLS policies (customer cannot read another's order request; customer cannot read drafts; non-admin cannot write products) | Phase 2 |
| E2E | Playwright | browse → product → cart → order request → confirmation; login/register; admin CRUD; age gate; a11y smoke | Phase 15 |
| A11y | axe via Playwright | home, collection, product, contact, cart, order request | Phase 14/15 |
| Perf | Lighthouse CI | key public templates | Phase 14 |
| Migrations | `supabase db lint` / migration dry-run | schema integrity | Phase 2 |

Mocks are avoided. RLS and repository tests run against a **real** local Postgres/Supabase.

**Implemented in Phase 1.** `tests/` holds 7 suites and 106 assertions. Notably, the
payment guard is tested *behaviourally*: each suite creates a temporary fixture tree
containing a violation and asserts the guard exits non-zero with the right rule name, rather
than only asserting it passes on the current clean tree. Design-token contrast is computed
from the WCAG relative-luminance formula over the tokens parsed out of `globals.css`, with
CSS comments stripped first so an assertion cannot pass by matching the comment that
documents it.

---

## 13a. Application foundation as built (Phase 1)

| Concern | Module | Note |
|---|---|---|
| Public env | `src/lib/env.ts` | Lazy, never throws at import, collects all issues, reports presence as booleans |
| Server env | `src/lib/env.server.ts` | `import 'server-only'`; `requireServiceRoleKey()` throws at point of use |
| Browser data | `src/lib/supabase/browser.ts` | anon key only; RLS is the protection |
| Server data (read) | `src/lib/supabase/server.ts` | Server Components; cookie writes swallowed because Next forbids them there |
| Server data (write) | `src/lib/supabase/server.ts` | Server Actions and Route Handlers; cookie writes persisted |
| Privileged data | `src/lib/supabase/admin.ts` | `import 'server-only'`; bypasses RLS, so callers must still authorise |
| Session refresh | `src/middleware.ts` | The only place a refreshed token can actually be persisted |
| Errors | `src/lib/errors.ts` | Internal message, cause and stack never cross to the client |
| Logging | `src/lib/logger.ts` | Single-line JSON, recursive credential redaction, depth- and length-capped |
| SEO | `src/lib/seo/*` | Metadata, schema.org, sitemap entries and cache tags |
| Boundaries | `src/app/{not-found,error,global-error}.tsx` | Show a correlation digest, never an internal message |

### Why there are two server Supabase clients

Next.js permits cookie writes only in a Server Action or a Route Handler. If a Server
Component refreshes an auth token, the new token cannot be persisted, and the user is
silently signed out when the old one expires. The read-only client therefore swallows that
write error deliberately, and `src/middleware.ts` performs the refresh where the response
can be written. `getUser()` is used rather than `getSession()`, because only `getUser()`
validates the token against the auth server.

---

## 14. Explicit non-goals

- No payment gateway, no online payment processing, no card/PayPal/Stripe integration, no payment
  webhooks, no payment-provider abstraction, no storage of card details.
- No claim of authorised-dealer status or manufacturer affiliation.
- No VPS/Docker deployment path.
- No hardcoded fake catalogue in the storefront.
- No fake dashboards, placeholder CRUD, dead buttons or fabricated statistics.
- No copying of reference source code, theme assets or long text passages.

---

## 15. Document map

| File | Purpose |
|---|---|
| `REFERENCE_ANALYSIS.md` | What the reference site does, and how we improve on it |
| `ARCHITECTURE.md` | This file — the technical contract |
| `DATABASE_SCHEMA.md` | Full table/column/RLS reference — written in Phase 2, verified against the running database |
| `IMPLEMENTATION_PLAN.md` | Phase-by-phase plan, current state, dependencies |
| `CHANGELOG.md` | What changed, when |
| `KNOWN_ISSUES.md` | Honest open issues, severity, next action |
| `docs/SEO.md` | SEO approach, Google's official AI-search guidance, sitemap `lastmod` policy |
| `docs/SECURITY_HEADERS.md` | Active security headers and the planned CSP rollout |
| `README.md` | Local setup, scripts, environment variables, Vercel deployment |
| `.env.example` | Environment variable names and setup notes (no secrets) |

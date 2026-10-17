# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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

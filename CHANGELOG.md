# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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

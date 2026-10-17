# Known Issues

Last updated: 2026-10-17 (end of Phase 1)
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
| A1 | **No Supabase project exists.** No `NEXT_PUBLIC_SUPABASE_URL`, anon key or service-role key is configured. | critical | open | Owner creates a Supabase project and supplies the values via the Vercel dashboard (and a local `.env.local`, which is gitignored). Blocks Phase 2 onward. |
| A2 | **No Supabase database exists to migrate.** Schema, RLS and generated types cannot be verified against a real database. | critical | open | Follows A1. Migrations are authored in Phase 2 and applied with the Supabase CLI. |
| A3 | **No Resend account or verified sending domain.** Transactional email cannot be delivered. | high | open | Owner creates a Resend account, verifies the sending domain, and supplies `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_ADMIN_EMAIL`. Blocks Phase 8 verification. |
| A4 | **No Supabase Storage bucket.** Product media upload and public image serving are not yet possible. | high | open | Created by migration/policy in Phase 2 and Phase 10. |
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
| D1 | No RLS policies exist yet, because no schema exists. Until Phase 2 lands, **any** table created would be unprotected by default. | critical | open | Phase 2: enable RLS on every table with default-deny policies, and prove it with tests. |
| D2 | `profiles.role` self-escalation must be impossible. A naive `update` policy on `profiles` would let a customer make themselves an admin. | critical | open | Phase 2: protect the `role` column by policy and trigger; Phase 3: add an escalation test. |
| D3 | Service-role key could leak into the client bundle if imported outside a `server-only` module. | critical | **mitigated** | Phase 1: `lib/supabase/admin.ts` and `lib/env.server.ts` both import `server-only`, so the build fails if either is pulled into a client bundle. Verified by scanning `.next/static/` for the key name and for `service_role`: nothing found. Phase 13 re-runs the scan as a standing check. |
| D4 | Public mutation endpoints (inquiry, contact, newsletter, order request, auth) have no rate limiting yet. | high | open | Phase 7 and Phase 13: server-side rate limiting plus honeypots. `RATE_LIMIT_DRIVER` is already reserved in `.env.example`. |
| D5 | Security headers are configured; **Content-Security-Policy is deliberately not yet enforced.** | medium | open | Phase 1 shipped seven headers (nosniff, Referrer-Policy, Permissions-Policy incl. `payment=()`, X-Frame-Options, COOP, CORP, HSTS) and verified them at runtime. CSP is deferred by design: shipping a restrictive policy before the real asset graph is audited breaks the app, and one loosened under pressure provides no protection while creating false confidence. The intended policy and the three-step rollout (report-only → observe → enforce with nonce) are documented in `docs/SECURITY_HEADERS.md`. Owned by Phase 13. |
| D6 | Guest order lookup must not be authorisable by reference number alone. | high | open | Phase 7: require reference **and** matching email, rate-limited. |
| D7 | Order-request totals must be recomputed server-side; client-supplied prices must be ignored. | critical | open | Phase 7: server re-pricing with a tamper test. |
| D8 | No payment code must ever be introduced. This is an invariant, not a task. | critical | **mitigated** | **Done in Phase 1**, earlier than planned. `scripts/check-no-payment-providers.mjs` fails CI on a payment dependency, gateway host, card field, payment webhook or provider-named route, scanning both file content and file paths. It is itself covered by 9 behavioural tests that prove it rejects each violation class rather than merely passing on a clean tree. Phase 13 keeps it wired into CI. |
| D9 | HSTS omits `preload`, so the domain is not submitted to the browser preload list. | low | accepted | `preload` is effectively irreversible. It is added only once the owner confirms every subdomain is HTTPS-only. Recorded rather than silently enabled. |

---

## E. Quality, performance and platform risks

| # | Issue | Severity | Status | Next action |
|---|---|---|---|---|
| E1 | **Lighthouse 100/100 is a target, not a guarantee.** External factors (network conditions, third-party fonts, Lighthouse version, Vercel edge behaviour) can move the number. | medium | accepted | Phase 14: run real audits, fix what is fixable, and report the actual score plus the specific remaining constraint. Never fabricate a score. |
| E2 | Sitemap `<lastmod>` is a crawl **hint**; it cannot force Google to recrawl a page. | low | accepted | Documented in `ARCHITECTURE.md` §10 and Phase 12; correctness of the timestamp is what we control. |
| E3 | Vercel **Deployment Protection** may block automated inspection of preview URLs, which limits agent-side QA of previews. | medium | open | Owner either enables *Protection Bypass for Automation* and supplies the secret, or allows preview access. Until then, QA runs against a local build. |
| E4 | Supabase project region is not yet chosen, which affects latency for the primary audience. | low | open | Owner picks a region near the audience when creating the project (A1) and records it in `ARCHITECTURE.md`. |
| E5 | Third-party trademark use (Rolex, Audemars Piguet, Patek Philippe, Richard Mille) is factual product attribution only. | high | accepted | Never claim authorised-dealer status, affiliation or endorsement. Brand names are rendered as data attributes from our `brands` table, nothing more. |
| E6 | No licensed imagery is available. Seed/demo imagery must be clearly labelled and must not be presented as real stock. | medium | open | Owner supplies licensed or original imagery (A6). Until then, placeholders are labelled as demo data. |
| E7 | Seed/demo data must never be presented as real transactions. | medium | open | Phase 2 seeds are labelled; Phase 15 documents how to purge them before go-live. |
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

## Summary

| Severity | Count | Open |
|---|---|---|
| critical | 6 | 3 (D3 and D8 are now mitigated; D8 is also an accepted standing invariant) |
| high | 10 | 8 |
| medium | 11 | 7 |
| low | 8 | 2 |

**Phase 1 resolved C1, C3, C4 and C6, and mitigated D3 and D8.** The repository now has a
`.gitignore`, a committed lockfile, a documented `.env.example`, a `server-only` guard on every
privileged module, a CI guard that fails the build if a payment integration is ever introduced, and
a CI pipeline observed green on `main`.

No critical item is a defect in shipped code. The three remaining criticals are owner-side setup
(A1, A2) and policies that Phase 2 and Phase 7 must implement by construction (D1, D2, D7).

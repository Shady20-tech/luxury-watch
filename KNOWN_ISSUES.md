# Known Issues

Last updated: 2026-10-16 (end of Phase 0)
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
| C1 | `.example.env` exists at the repository root, is 1 byte, empty, and misnamed — it is not read by any tool and is a setup trap. | medium | open | Removed in Phase 1 and replaced by `.env.example`. |
| C2 | Repository is greenfield: no `package.json`, no application code, no tests, no CI, no `vercel.json`. | medium | accepted | Expected; Phase 1 scaffolds the application. Recorded as the documented reason for scaffolding rather than refactoring. |
| C3 | No `.gitignore`. Without it, `.env.local`, `node_modules/`, `.next/` and Supabase local artefacts risk being committed. | high | open | Added in Phase 1 **before** any dependency install. |
| C4 | No lockfile, so dependency resolution is currently unpinned and unreproducible. | medium | open | `package-lock.json` committed in Phase 1; CI uses `npm ci`. |
| C5 | No automated secret scanning in CI. | medium | open | Add a secret scan to the Phase 1 workflow and a repository scan in Phase 13. |

---

## D. Security items to track from the start

| # | Issue | Severity | Status | Next action |
|---|---|---|---|---|
| D1 | No RLS policies exist yet, because no schema exists. Until Phase 2 lands, **any** table created would be unprotected by default. | critical | open | Phase 2: enable RLS on every table with default-deny policies, and prove it with tests. |
| D2 | `profiles.role` self-escalation must be impossible. A naive `update` policy on `profiles` would let a customer make themselves an admin. | critical | open | Phase 2: protect the `role` column by policy and trigger; Phase 3: add an escalation test. |
| D3 | Service-role key could leak into the client bundle if imported outside a `server-only` module. | critical | open | Phase 1: `lib/supabase/admin.ts` guarded by `import 'server-only'`; Phase 13: audit and bundle scan. |
| D4 | Public mutation endpoints (inquiry, contact, newsletter, order request, auth) have no rate limiting yet. | high | open | Phase 7 and Phase 13: server-side rate limiting plus honeypots. |
| D5 | Security headers and CSP are not configured. | high | open | Phase 1 scaffold; completed and verified in Phase 13. |
| D6 | Guest order lookup must not be authorisable by reference number alone. | high | open | Phase 7: require reference **and** matching email, rate-limited. |
| D7 | Order-request totals must be recomputed server-side; client-supplied prices must be ignored. | critical | open | Phase 7: server re-pricing with a tamper test. |
| D8 | No payment code must ever be introduced. This is an invariant, not a task. | critical | accepted | Phase 13: add an automated check that fails CI if a payment provider dependency or card field appears. |

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
| F7 | Should Next.js be upgraded from 15 to 16, or stay on 15 as the binding decision states? | Phase 1 |
| F8 | Which analytics, if any, are required? (Affects Lighthouse and consent.) | Phase 14 |

---

## Summary

| Severity | Count | Open |
|---|---|---|
| critical | 6 | 5 (D8 is an accepted standing invariant) |
| high | 10 | 8 |
| medium | 10 | 7 |
| low | 6 | 1 |

**No critical item is a defect in shipped code — there is no application code yet.** Every critical
item is either owner-side setup (A1, A2) or a policy that Phase 2 and Phase 7 must implement by
construction (D1, D2, D3, D7).

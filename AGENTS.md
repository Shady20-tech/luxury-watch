# AGENTS.md — working notes for this repository

Luxury-watch storefront and admin platform. Next.js 15 App Router, TypeScript,
Tailwind, Supabase (Postgres + Auth + Storage + RLS), Resend for email, deployed
on Vercel. **No online payments** — customers submit an order _request_ and an
administrator settles payment offline.

This file holds the operational knowledge that is expensive to rediscover. Read
it before starting work, and keep it current when something here stops being true.

## Where the truth lives

| Question                         | Read                                 |
| -------------------------------- | ------------------------------------ |
| What is the schema, exactly?     | `DATABASE_SCHEMA.md` — authoritative |
| Why is it built this way?        | `ARCHITECTURE.md`                    |
| What phase are we in?            | `IMPLEMENTATION_PLAN.md`             |
| What is broken or unverified?    | `KNOWN_ISSUES.md`                    |
| What changed, and when?          | `CHANGELOG.md`                       |
| What does the reference site do? | `REFERENCE_ANALYSIS.md`              |

`ARCHITECTURE.md` section 5 describes design _intent_ and has been corrected
where it drifted; `DATABASE_SCHEMA.md` is what the migrations actually build.
Trust the schema doc when the two disagree.

## Commands

```bash
npm run verify        # payment guard, format, lint, typecheck, tests, build
npm run dev           # dev server

./scripts/db-reset.sh            # drop and recreate the test database
./scripts/db-verify.sh           # migrations + RLS suites
./scripts/db-concurrency-matrix.py   # inventory oversell proof

# Accessibility and layout. Needs a server already listening:
#   npm run build && npm run start
npm run audit:a11y
CHROMIUM_PATH=/path/to/chrome npm run audit:a11y   # reuse a local Chromium
```

`npm run verify` runs the same steps in the same order as CI. If you add a check
to CI, add it to `verify` in the same commit — these diverging is exactly what
caused a green local run and a red CI run in Phase 2.

## Accessibility and layout — read this before trusting a green test run

`tests/a11y-shell.test.tsx` runs axe under jsdom, which **cannot lay out a
document**. axe silently skips every geometry-dependent rule there, and colour
contrast is the most important one it skips. A green jsdom axe run therefore says
nothing about contrast or horizontal overflow.

`npm run audit:a11y` drives real Chromium against a real production build and is
the only check that catches those defects. It found both Phase 3 defects: a
4.17:1 contrast failure on the media placeholder and a 320px header overflow
caused by three separate things. Run it after any change to tokens, chrome or
layout. It also audits the age gate with the modal open, and asserts the dialog
actually opened, so that pass cannot succeed vacuously.

**Pin the audit tool exactly.** In Phase 4 the logo link failed WCAG 2.5.3
(`label-content-name-mismatch`) on every page, and CI reported green. The cause
was `axe-core` version drift: the manifest said `^4.11.0`, so the lockfile pinned
`4.11.0` and `npm ci` installed that, while local `node_modules` had resolved
`4.14.0`. `4.14.0` detects that violation; `4.11.0`–`4.13.0` do not, at any
viewport. So the defect was real the whole time and CI simply could not see it.
`axe-core` is now pinned exactly. Before concluding that a local audit failure is
a local artefact, check `npm ls axe-core` against the lockfile: if the detector
versions differ, the "passing" run is the one to distrust. A green audit is only
as trustworthy as the version of the tool that produced it.

**Never let an `aria-label` drop visible text.** An `aria-label` _replaces_ the
name computed from an element's contents. If the element also shows text, the
accessible name must still contain that text or WCAG 2.5.3 fails — a
speech-input user cannot say what they can see. Add the extra wording as
`sr-only` text inside the element instead. axe needs layout to check this rule,
so jsdom will not catch it; `tests/chrome.test.tsx` asserts the invariant
directly for the logo link.

## Text colour rule

`ink-400` is **not** a text token. It is 4.17:1 on `surface-100`, below the 4.5:1
WCAG AA minimum for normal text. Use `ink-500` (5.27:1) for secondary text. The
only permitted exception is the dropdown's `disabled` state, where WCAG exempts
disabled controls and the lower contrast is the signal.

`tests/design-tokens.test.ts` asserts this and scans `src/` for
`text-ink-400`, so the class cannot be reintroduced by copy-paste. If that test
fails, change the class rather than the test.

## The chrome and its cache

`src/app/(site)/layout.tsx` sets `revalidate = 300`. Public pages are prerendered
and the header/footer data refreshes at most every five minutes, which is why a
navigation edit is not instantly visible. That is deliberate — the alternative is
six navigation queries on every request. When the admin is built (Phase 10),
editing navigation or settings must call `revalidatePath('/', 'layout')` so the
editor sees their change immediately.

`getChrome()` degrades in three documented states and reports which one it took
in `source` (`database` or `fallback`). While Supabase is unconfigured (A1) the
deployed site uses the fallback fixture; this is recorded as G10, not a bug.

## Database

The verification scripts are dual-mode: they use a direct `psql` connection when
`PGHOST` is set (how CI reaches its service container) and Docker otherwise.
`db-verify.sh` fails loudly if `PGHOST` is set but `psql` is missing, rather than
silently falling back to a Docker daemon that CI does not have.

To verify locally the way CI does:

```bash
PGHOST=127.0.0.1 PGPORT=55432 PGUSER=postgres PGPASSWORD=postgres \
  PGDATABASE=postgres ./scripts/db-verify.sh
```

Postgres 17 is used deliberately, matching Supabase. Test migrations against it,
not against whatever version happens to be installed.

### Verifying against a real database, not a shim

The RLS suites prove the policies, but they run against a SQL shim. To exercise
the **real client path** — `@supabase/supabase-js`, its `/rest/v1` routing, and
RLS as actually applied — run a PostgREST instance against the verified database
and point the app at it:

```bash
# 1. PostgREST listening on 3001 against the local database.
# 2. Strip the /rest/v1 prefix, exactly as Kong does in a real project:
node scripts/dev-postgrest-proxy.mjs --port 3002 --target http://127.0.0.1:3001

# 3. .env.local points the app at the proxy, not at PostgREST directly:
#    NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3002
#    NEXT_PUBLIC_SUPABASE_ANON_KEY=<the anon JWT PostgREST accepts>
```

Without the proxy every request 404s, because `supabase-js` requests
`/rest/v1/<table>` while a bare PostgREST serves at `/`. The proxy is a
development and verification tool only; Vercel talks to the Supabase project URL
directly. This is how Phase 4 verified that the homepage renders real rows, that
`product_availability` returns a real `false` for a reserved piece, and that a
draft or archived slug 404s through RLS rather than through application code.

### Things that will bite you

- **`db-verify.sh` leaves fixtures behind.** The RLS suites and the concurrency
  harness insert their own rows. A database that has run `db-verify.sh` shows
  **4120 products and 5 brands**, not the seed's 4110 and 4. This is expected, not
  a seed bug. Counts on a clean database: 4110 products, 4 brands, 41 models,
  8785 specs.
- **`supabase/tests/00_supabase_shim.sql` is a test fixture, not a deployment
  artifact.** It fakes `auth.users`, `auth.uid()` and the API roles so the
  policies can be tested outside Supabase. Never apply it to a real project.
- **Roles live in `user_roles`, not `profiles.role`.** RLS restricts rows, not
  columns, so a role column on a self-editable profile row is one policy mistake
  away from privilege escalation. Do not add one back.
- **`admin_audit_logs` has no write policy at all.** Not even `SUPER_ADMIN` can
  insert through the API. Writes are expected to go through a `SECURITY DEFINER`
  function. If a feature needs to write an audit row, write that function.
- **Role helper functions are `SECURITY DEFINER` with `set search_path = ''`.**
  Keep fully qualified references inside them; an unqualified name there is
  redirectable by a hostile `search_path`.
- **`submit_order_request` recomputes totals from product rows.** Never trust a
  client-supplied price. The arithmetic is re-checked by a constraint.

## Content and licensing

The seed carries factual attributes only — brand, reference number, case size,
movement, dial, and so on. It deliberately excludes the reference site's
photography, marketing prose and prices, and claims no authorised-dealer status.
Do not add those back from the reference site; it is not our content.

## Payments

There is no payment gateway, no card handling, and no provider abstraction. A CI
guard (`scripts/check-no-payment-providers.mjs`) enforces this. If it flags a
line that names a card field in order to forbid it, add the file to
`ALLOWED_FILES` in that script with a comment explaining why — do not weaken or
delete the check.

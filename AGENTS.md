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

### RLS restricts rows, not columns — grant the public surface explicitly

A row-level policy decides which rows a role may see. It says nothing about which
columns of those rows are visible. The table-level `select` grant does that, and
by default it covers every column.

Phase 6 found this the expensive way: `products` had a correct row-scoped
public-read policy and `anon` could still read `cost_cents` and `compare_at_cents`
— the business's cost basis — through PostgREST. Nothing was misconfigured; the
policy simply does not speak about columns.

`products` now revokes the table-level grant and re-grants the public read surface
column by column (migration `0011_product_detail.sql`). The sensitive columns are
hard-denied (`401`, SQLSTATE `42501`) rather than filtered to an empty result, and
a bare `select('*')` fails loudly.

**The standing obligation:** on any table with a public-read policy, a new column
is readable by `anon` by default unless you add it to the grant list. When you add
a column to `products` or any publicly-readable table, decide explicitly whether
it belongs in the public surface, then update the grant list **and**
`supabase/tests/17_product_detail.sql`. Test it through the real client path, not
only in SQL — a policy that reads correctly can still leak a column.

### A cookie-reading page must be explicitly dynamic, or production 500s

The Supabase server client (`lib/supabase/server.ts`) is cookie-aware, because it
is shared with the session-bearing routes. Reading cookies makes a route dynamic.
If such a page also exports `generateStaticParams`, Next.js classifies the route
as SSG, then fails **at request time in a production build** with:

```
Error: Page changed from static to dynamic at runtime /products/<slug>, reason: cookies
```

The request returns a **500**. `next dev` does not reproduce it, so the page looks
fine locally and breaks only under `next start`. This bit the product detail page
in Phase 6.

The fix is `export const dynamic = 'force-dynamic'` on the page. `generateStaticParams`
can stay — it is still the right extension point for a future ISR decision — but it
must not be the only signal, because it says "static" while the data layer says
"dynamic".

**How to catch it:** after `npm run build`, run `next start` and request the real
routes. `next build` alone does not fail. The `●` marker in the build output means
SSG; if the page reads cookies, that combination is the bug.

### The migration that last defines a function is the one that governs

`create or replace function` means a later migration can redefine an earlier
one. `cart_pricing` is created in `0012_wishlist_and_cart.sql` and **redefined in
`0013_order_request_submission.sql`** to delegate discount evaluation. A change
made to the 0012 body is dead code: it applies, then is overwritten, and the
database suite still passes because it only ever sees the final definition.

Before editing a function, `grep -n 'create or replace function public.<name>'
supabase/migrations/*.sql` and edit the **last** one. The payload-contract comment
in 0012 is still the document of record for the shape, so update it too — but the
behaviour belongs in 0013.

### Email

`src/lib/email/transport.ts` calls Resend over its HTTPS API with `fetch`, not the
SDK. `sendEmail` returns a result and **never throws**, so a mail outage cannot
turn a placed order into an error page; the caller logs and carries on. With no
`RESEND_API_KEY` it logs the recipient and subject — never the body, which can
hold a customer's address and phone number — and reports `skipped`.

Templates are plain functions returning `{ subject, text, html }` in
`src/lib/email/orders.ts`. The text part is written first and is complete on its
own. **No template may claim a payment was taken**; `tests/email.test.ts` scans
every rendered message for such a claim and fails if one appears, so this is
enforced rather than reviewed. A new template that mentions money must be added
to that test's fixture.

Every figure an email quotes is read back from the committed row, never from the
browser payload. The guest's access token goes in the customer's message and no
other — it is a capability, and copying it into the admin mailbox widens who holds
it for no benefit.

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
- **`cart_pricing` takes ids and quantities, never prices.** It is the only source
  of a cart's numbers and the only place a discount is valued. The browser's copy is
  display data. Do not add a price parameter to it, and do not compute a subtotal,
  a discount or a total in TypeScript — `src/lib/cart/pricing.ts` maps the payload
  and does no arithmetic, deliberately.
- **`aria-pressed` is not allowed on a link.** It failed the browser audit on the
  catalogue filter rows (`aria-allowed-attr`), which are `<a>` elements that
  navigate. Use `aria-current` for "the current item in a set of links", and
  `aria-pressed` only on a real `<button>`. jsdom does not run this rule, so the
  audit is what catches it.
- **A guest cart is server-side only.** `carts` and `cart_items` have no policy
  that can prove a guest owns a row, so an anonymous caller cannot touch them
  through the API. Guest carts go through the service-role client with the token
  in an httpOnly cookie. Do not add a public policy to "make the guest cart work".
- **`pkill -f "next start"` does not kill a running Next.js server.** Next.js
  renames its process to `next-server`, so the pattern never matches and the old
  server keeps serving the previous `.next` build on that port. Restarting with
  `npx next start -p <port>` then fails to bind or, worse, the audit silently
  measures a stale build and reports failures that do not exist in the current
  code (and vice versa). Kill by port or by working directory instead:
  `for pid in $(pgrep -f next-server); do [ "$(readlink /proc/$pid/cwd)" = "$PWD" ] && kill $pid; done`,
  and confirm the port is free before starting a new server.
- **The browser audit needs a fresh build and a free port.** Rebuild before
  auditing, and never audit while a second server for this repo is still
  listening; the results are meaningless and inconsistent between runs.

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

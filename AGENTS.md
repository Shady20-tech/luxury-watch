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

# Serve a preview against the real local database (PostgREST + proxy + app):
npm run preview          # public URL printed on success
npm run preview:stop

# End-to-end browser suite. Needs the preview listening on 12000.
./scripts/e2e-seed-checkout-fixtures.sh   # required after db-reset.sh, see below
npx playwright test
```

### The E2E suite needs fixtures that `db-reset.sh` deletes

`./scripts/db-reset.sh` returns the database to the seed, and the seed leaves
`payment_methods` and `delivery_options` **empty** on purpose (F1: which manual
methods the owner wants at launch is a business decision). With both empty,
`/checkout` cannot reach its submit path, so
`e2e/commerce.spec.ts › order request is saved as pending review` fails on a
disabled button. That is a missing fixture, not a regression.

Run `./scripts/e2e-seed-checkout-fixtures.sh` after any `db-reset.sh` and before
`npx playwright test`. It is idempotent, and it also releases stock held by
earlier runs — the suite places real order requests, and each reserves a piece,
so without the release the twelve published seed pieces are exhausted after a
dozen runs and the suite starts failing for a reason unrelated to the code.

The suite itself runs against the preview on port 12000, not `next start`: the
catalogue tests need real rows through PostgREST (see "A preview needs PostgREST,
not just `next start`"), and several assert on the rendered order of real
products. `playwright.config.ts` defaults `baseURL` to `http://127.0.0.1:12000`
and honours `LW_BASE_URL` if the preview is somewhere else.

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

## Product detail page

`src/app/(site)/products/[slug]/page.tsx` is `force-dynamic` and its
`generateStaticParams` returns `[]`. Both are load-bearing. The page reads
through the cookie-aware server client, so Next.js would otherwise classify the
route as SSG and fail **at request time in a production build** with "Page
changed from static to dynamic at runtime". `next build` does not fail, and
`next dev` does not reproduce it. The `●` marker in the build output is not a
bug here: with no generated params there are no static instances to serve.

Three states, and the distinction between the last two is deliberate:

- found → renders from the database;
- `not_found` → `notFound()`. Unknown, draft and archived slugs are
  indistinguishable, so the route cannot be used to probe for drafts;
- `unavailable` → a **200** with a clear message. A database outage is not a
  missing watch, and saying it was would invite a crawler to drop a valid URL.

**The buying-assurance panel reads the owner's policy pages, and that is the
point.** `TrustPanel` renders each entry from its own published `pages` row —
title and excerpt — and links to the full page. Do not replace it with
hand-written warranty or returns copy: that would be a contractual claim made by
source code, and it would contradict the warranty page the first time the owner
edited it. An unpublished policy is omitted rather than placeholdered (G67).
The reading order is `PRODUCT_POLICY_ORDER` in `lib/product/assemble.ts`, and a
policy read failure degrades to no panel instead of losing the product.

`Product` JSON-LD emits `offers` only when a real price exists. A
price-on-request piece makes no price claim, which is why the visible price and
the structured data come from the single `priceMinor === null` decision in
`toProductDetail`.

### The audit now covers a product page, and it is discovered, not hardcoded

`scripts/a11y-audit.mjs` reads a product link out of `/shop` at runtime. A
hardcoded slug would 404 against any other seed and the audit would then pass
while measuring the not-found template — the vacuous-pass failure this file
keeps warning about. The sitemap is not used as the source yet because it does
not list products (G34, Phase 12).

Prove the coverage is real before trusting it. Setting the panel's excerpt to a
genuinely low-contrast colour fails the audit at all four viewports; that
experiment was run, so the pass is known not to be vacuous. Note that
`ink-400` on **white** measures 4.54:1 and passes, while the 4.17:1 figure in
the text-colour rule above is on `surface-100` — so a passing audit with
`text-ink-400` somewhere is not automatically a false negative. The design-token
test still forbids it as a text token; keep it that way.

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

### A cached metadata route needs its own `revalidatePath`

`src/app/sitemap.ts` sets `revalidate = 3600`. That window is not refreshed by
`revalidatePath('/', 'layout')`, by `revalidatePath('/shop')` or by anything else
you might reasonably assume: the sitemap is its own route with its own cache
entry, and only `revalidatePath('/sitemap.xml')` clears it.

Phase 14 found this the expensive way. No admin action invalidated the sitemap,
so a piece published through the admin stayed absent from it for up to an hour
and an archived piece stayed advertised for the same hour. Reproduced against a
production build: publish a draft, re-fetch `/sitemap.xml`, still absent; call
`revalidatePath('/sitemap.xml')`, re-fetch, present. The paths now live in
`productRevalidationPaths()` in `src/lib/seo/sitemap.ts`, which every product
mutation imports and which includes `SITEMAP_PATH`. Page saves call
`revalidatePath(SITEMAP_PATH)` directly. If you add a brand or collection editor,
give it the same treatment rather than trusting the hourly window.

**The lesson is about the shape of the test, not the fix.** Nine hundred tests
were green throughout, because every one of them asserted what an action
_returned_ and none asserted what it _revalidated_. A cached document is
invisible to a unit test unless something asserts the invalidation explicitly.
`tests/sitemap-revalidation.test.ts` drives the real action with `next/cache`
mocked and asserts the path is passed; it was mutation-tested, and removing
`SITEMAP_PATH` fails three of its five cases. When you add a mutation that can
change what a cached route serves, write that test, and check it fails without
the fix.

Related trap: a folder under `src/app` whose name starts with `_` is **private**
and is not routed. A probe route named `src/app/api/__probe-revalidate` returned
404 and quietly proved nothing.

### The dark cap, and why the header is glass

Every page opens on a dark band, the way the reference does. Interior templates
get it from `src/components/layout/page-hero.tsx` (`PageHero`); the homepage gets
it from its own black hero. A new page should use `PageHero` rather than writing
another eyebrow-and-`h1` block, or it will open white and break the rhythm.

The header is the **one deliberate deviation from the reference**, which uses a
solid bar: ours is `glass-panel-night` — `rgba(8,8,8,0.8)` with
`backdrop-filter: blur(12px) saturate(1.5)` — so the hero shows through it. That
makes the header the hardest contrast case on the site, because it sits over the
black hero at the top of the page and over white body content as you scroll. Its
contrast is therefore asserted in the browser audit, not inferred from one
background. If you change the header's translucency, re-run `npm run audit:a11y`
before believing the result.

`PageHero` must stay the only `h1` on its page. Replacing an existing title
header with it is correct; adding it above one that already has an `h1` is not,
and the audit will not catch that.

## Database

### A preview needs PostgREST, not just `next start`

`npm run start` alone renders an **empty catalogue**. The seed rows live in
Postgres and the app reaches them through `supabase-js` → PostgREST → Postgres, so
without PostgREST every product query fails and the pages fall back to the fixture
or to nothing. That is not a bug in the page — it is the documented A1/G10
degradation — but it makes a bare `next start` useless for showing catalogue, cart
or wishlist work.

`npm run preview` brings up the three processes a real preview needs (PostgREST on
3001, the `/rest/v1` proxy on 3002, the app on 12000) and prints the public URL.
It also mints an anon JWT signed with a secret it controls, because the seed anon
key is signed with a secret we do not hold; the key is only ever forwarded to
PostgREST, so a locally-generated one behaves identically. It backs up `.env.local`
before rewriting the Supabase URL and key.

Two consequences worth knowing:

- **`NEXT_PUBLIC_*` is inlined at build time**, so the script must rebuild after
  repointing the app. Editing `.env.local` and restarting `next start` alone has no
  effect on an existing build.
- **`npm run audit:a11y` should run against the preview**, not a bare `next start`.
  Against the fallback it only ever sees empty states, which is exactly the gap
  recorded as G54. Against the preview it sees real rows.

**The guest cart and wishlist need a real `service_role` key.** They are handled
server-side with the service-role client (`src/lib/cart/session.ts`), because the
session token must never be forgeable from the browser. Point that key at an anon
token and the failure is silent and misleading: the action logs `cart.add_failed`,
the `lw_cart_session` cookie is still set, and `/cart` still renders its empty
state. The app looks fine and the cart looks empty, so the fault reads as a cart
bug rather than a misconfigured environment. `npm run preview` mints both an `anon`
and a `service_role` token for this reason. When a preview cart will not fill, check
`/tmp/lw-preview/next.log` for `cart.add_failed` before suspecting the cart code.

The verification scripts are dual-mode: they use a direct `psql` connection when
`PGHOST` is set (how CI reaches its service container) and Docker otherwise.
`db-verify.sh` and `db-reset.sh` both fail loudly if `PGHOST` is set but `psql`
is missing, rather than silently falling back to a Docker daemon that CI does not
have. `db-reset.sh` was Docker-only until Phase 11, so the reset was impossible
anywhere Postgres is a service rather than a container — CI never hit it, because
a service container starts empty, but a developer verifying the way CI does would
have. Use it after a suite leaves fixtures behind.

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

### An image credit belongs on every surface that shows the image

The seed photography is CC BY 4.0 and CC BY-SA 4.0. Both require the author to be
credited wherever the work is displayed, and CC BY-SA also requires the licence to
be named. The `credit`, `licence` and `licence_url` columns exist for that, and
`product_images_licence_complete_check` refuses a row that claims a licence without
them, so the data could not be incomplete.

The display still was. Phase 5 found that only the product detail gallery returned
those columns: `catalogue_search`, `catalogue_by_ids` and `catalogue_similar` — the
three functions behind every `CatalogueCard` — returned just the image path and alt
text. So the busiest surfaces (`/shop`, every collection, brand and model page,
`/search`, `/wishlist`, and the product page's own related rail) showed Commons
photographs with nobody credited. Nothing failed, because the columns existed and
one surface read them.

**The standing obligation:** a card is a display. Any new RPC that feeds a card
must return the credit columns from the _same_ lateral that picks the image it
shows — not from a separate join, or the card credits one photograph and displays
another. Render the credit only when both author and licence are present; half an
attribution does not satisfy CC BY-SA. `supabase/tests/65_catalogue_image_attribution.sql`
and `tests/catalogue-card-attribution.test.ts` guard this, and both were
mutation-tested.

Do not put the card credit in a link. It would add one outbound tab stop per card
on a 48-card grid, and the licence requires attribution, not a clickable one. The
product page links it to the source.

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

This bit again in Phase 5. `catalogue_filtered` is created in `0010` and
**redefined in `0016_catalogue_search_collections.sql`** to add collection-title
search. A new migration that copied the 0010 body to add a scope silently dropped
that search from every catalogue query. `19_catalogue_search.sql` caught it — a
collection title stopped being findable — which is the only reason it was not
shipped. When you copy a function body to extend it, copy the **last** definition,
then diff your copy against it: the diff should be exactly the change you meant.

### A model slug is not unique; the URL must carry the brand

`models` is unique on `(brand_id, slug)`, not on `slug` alone. The seed holds 41
models across 38 distinct slugs — `other` appears four times, once per brand. A
route keyed on the model slug alone would resolve to four brands' stock and look
perfectly normal while showing the wrong watches, which is the kind of defect a
page-level test never sees.

So a model is addressed as `/brands/<brand>/models/<model>`, and the catalogue
scope slug is the composite `<brand-slug>/<model-slug>`. When you touch anything
model-related, keep both halves: `catalogueBasePath`, the sitemap row
(`fetchModelSitemapRows` returns a composite `scopeSlug`), the navigation
assembler, and `catalogue_suggest`'s href. A bare `/models/<slug>` is always a
bug, not a shortcut.

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

**The mail identity has two sources and they are not interchangeable.**
`src/lib/email/identity.ts` resolves the `from` header. The sending _address_ is
`RESEND_FROM_EMAIL` and nothing else: it has to match a domain verified with
Resend, which a database value cannot do, and an editable `from` is a phishing
primitive — whoever could write it could send mail as the store from a domain it
does not own. What an administrator edits at `/admin/settings/email` is
presentation only: the display name beside the address and the reply-to. Those
live in `email_settings`, a table with RLS enabled and no public grant.

The display name is interpolated into a header, so it is quoted and stripped of
quotes, backslashes and newlines by `displayFrom`. Do not pass an unquoted name
through: a comma or an angle bracket left raw reads as a second address.

### A table with policies is not a table with row security

`email_settings` was created in Phase 13 with an `is_admin()` read policy and no
`alter table ... enable row level security`. The policy existed, applied to
nothing, and the `SELECT` grant was the whole access model — a signed-in customer
could read the store's mail settings. Review did not catch it because the policy
text is correct; it is the _absence_ of an enable statement that is wrong.

`supabase/tests/64_notifications_and_email.sql` caught it by asserting the
customer sees zero rows and finding one. Every new table needs both halves, and a
suite that asserts a count against a real row is what proves the second half is
there. A table that refuses everything also passes a "customer cannot read it"
test, so assert that a _staff_ read returns the row as well.

### `notify_user` takes the recipient, so its grant is the security model

`notifications` has no insert policy and cannot have one — there is no
request-shaped proof of "this person is entitled to be told this". The only
writer is `notify_user`, `SECURITY DEFINER`, granted to `service_role` alone. If
that grant is ever widened to `authenticated`, any customer can post a
notification to any other customer with the store's name on it. The grant is
asserted in `64_notifications_and_email.sql`, not assumed.

`link_url` becomes an `href` in the customer's inbox, so the function refuses
anything that is not site-relative or `https`. Keep it that way: a stored
`javascript:` there is stored XSS on the customer's own account page.

Dedupe is on `(user_id, dedupe_key)` under a partial unique index, and the key
names the _event_ (`order:<uuid>:<status>`), not the moment. A repeated dispatch
returns `null` rather than raising, because a retry is the normal case the key
exists for. **Test it with two calls, not one** — a single call in a single
request is unique by construction and can never see a collision.

### An audit write is best-effort, which is how a broken one stayed invisible

`writeAudit` logs `admin.audit_write_failed` and the action reports success. That
is deliberate — a content edit must not fail because the audit insert did — but
it means an audit write that fails _every time_ looks exactly like one that works.
`writeAudit` passed the literal `'singleton'` as `p_entity_id` while the column is
a `uuid`, so every settings save went unrecorded for several phases and nothing
surfaced it.

Pass `null` for a singleton and let `entity_type` name what changed. The
regression is locked down in `64_notifications_and_email.sql` by asserting the
record is written and findable by `entity_type`. When a best-effort write has a
shape that can be wrong, assert the shape against the real database — a unit test
with a mocked RPC cannot see a cast failure.

### Storage policies assume a signed-in uploader; the forms do not

The two photo buckets are private and their insert policies are `to authenticated`
with the folder keyed on `auth.uid()`. Both service forms are guest-submittable and
neither page requires sign-in, so a guest is `anon`, matches no policy, and would be
refused — with no user id to name a folder with in the first place. That is G76.

The policy is correct for a signed-in customer and should not be widened to `anon`:
a public insert policy on a bucket of customers' personal photographs defeats the
reason the bucket is private. The decision to make is whether a photograph requires
sign-in, or whether a guest upload goes through the service-role client with a
server-issued token the way the guest cart already does. Do not wire an upload
control until that is settled and the path can be exercised against real Storage
(G77) — an upload form that has never stored a byte is exactly the green-test
pattern this project keeps paying for.

### The admin application

`src/app/admin/` is a separate application inside the same Next.js project. It has its own
layout, its own guard and its own navigation, and none of it is reachable without a staff role.

**Every write goes through the session client, never the service-role client.**
`src/server/actions/admin-actions.ts` uses `createSupabaseServerClientWritable` throughout. This
is not a style preference. The service-role client carries no user, so `auth.uid()` is null, so
`admin_write_audit_log` refuses with "must be attributable to a signed-in user" — every action
would fail in the browser. It is also the wrong security posture: the service-role client
authenticates the _call_ but not the _caller_, and bypasses the policies that scope what a staff
member may write. The service-role client is used in the admin **only** for reads that need
`cost_cents`, which is deliberately outside the staff-readable column grant. The failure mode is
worth remembering because it is silent in testing: the database suites call the functions
directly as a simulated user and stay green while the client the app uses cannot authenticate.

**The RPCs are a second gate, not a bypass.** `0020_admin_operations.sql` defines
`admin_adjust_stock`, `admin_set_product_status`, `admin_transition_order` and
`admin_write_audit_log`. Each is `SECURITY DEFINER`, derives the actor from `auth.uid()` and
re-checks the permission internally. The action checks permission too; that redundancy is
deliberate, because the action's check can be bypassed by posting to it directly and the
function's check cannot.

**A form field the browser does not submit is _absent_, not empty.** `Object.fromEntries(formData)`
omits an unchecked checkbox entirely and omits any input left blank. A Zod field for such an input
must be `.optional()` (or preprocessed to `undefined`); `z.string()` and `z.coerce.boolean()` both
reject `undefined` and will fail the save on a field the administrator never touched. This is why
`tests/admin-validation.test.ts` parses the _minimal_ payload a browser produces rather than a
tidy object assembled by hand. Every optional field in `src/lib/admin/validation.ts` is built on
the `optionalInt`/`checkbox` helpers for this reason.

**`inventory` is read-only to `anon` and `authenticated`.** `0021_inventory_write_lockdown.sql`
revoked `INSERT/UPDATE/DELETE`; the balance is derived from `inventory_transactions` by a trigger
and every legitimate writer is `SECURITY DEFINER`. Do not re-grant write to make something work:
write a ledger row instead. `61_admin_write_paths.sql` fails if the grant is reopened.

**Permissions are strings in `user_roles`, checked through functions.** The keys are
`catalog.read/write`, `inventory.read/write`, `orders.read/write/settle`, `inquiries.read/write`,
`content.read/write`, `customers.read`, `audit.read`. A role resolves them through
`current_admin_permissions()`; `SUPER_ADMIN` holds `'*'` and the resolver expands it. A typo in a
key fails closed — the page or action simply refuses — so a "permission denied" that should not
be is almost always a misspelled key, not a policy problem.

### The CMS, the media library and the bucket that was missing

`/admin/settings` edits the copy the storefront renders: homepage sections, pages, FAQs,
testimonials, navigation, announcements, payment methods, delivery options and the business's own
details. Every save is a server action in `src/server/actions/content-actions.ts` that calls
`requirePermission('content.write')`, writes through the session client, writes an audit row, and
then calls `revalidateContent()`.

**A content save must revalidate the root layout, not the page it edited.** The chrome is
prerendered with `revalidate = 300` (`src/app/(site)/layout.tsx`). Editing a navigation label and
revalidating only `/admin/settings/navigation` leaves the public header showing the old label for
up to five minutes, which reads as a failed save. `revalidateContent()` calls
`revalidatePath('/', 'layout')` for exactly this reason; do not replace it with a narrower path.

**`site_settings` is a singleton keyed by a boolean `id`.** There is one row and its primary key is
`id = true`. So `writeAudit(..., 'site_settings', 'site_settings', ...)` passes a constant as the
record id — there is no `data.id` to pass. An action that assumes an integer id writes `undefined`
and the audit row fails.

**`media` is a table beside a storage bucket, and the bucket is part of the schema.** `media` has
existed since Phase 2, but the public `media` bucket was not created until
`0022_cms_media_library.sql`, so every upload failed at the storage step with a message that reads
like an authorisation error while the table looked perfectly correct. A schema document lists
tables, not buckets, so this gap survived every review. When you add a table that stores objects,
create the bucket in the same migration, pin its `allowed_mime_types` to the table's own check
constraint, and document it beside the table.

**Deleting an asset is guarded by a reference scan, not a foreign key.** `src/lib/admin/media-references.ts`
matches the asset's URL against `product_images`, `products`, pages, homepage sections and
`site_settings.logo_url` before allowing the delete, and the refusal names where it is used. It is
a scan: a URL stored in a column nobody listed would not be seen. It is a better guard than
nothing and a worse guard than a real foreign key (H8).

**Uploads go through a route handler, not a server action.** `src/app/api/admin/media/upload/route.ts`
is the only place a `File` is read; it checks the declared type, the file's magic bytes and the
size, refuses SVG, computes a SHA-256 checksum and writes with the admin client. The checksum is
what lets the library recognise the same image uploaded twice.

**Two content editors are honest about what they cannot do.** The page editor takes JSON and
validates it against the renderer's own parser, so an unknown block is rejected rather than saved
and silently dropped. The homepage editor warns when a section key is not one the renderer knows,
because such a section would render nothing. Do not "fix" either by accepting anything: a saved
block that does not appear is worse than a refusal that explains itself.

### Things that will bite you

- **A card that shows the brand twice passes every test that checks one field at a time.** The catalogue and homepage cards render `brandName` as their own line and then print `title`, and every seeded title already begins with the brand — so each card read "Patek Philippe / Patek Philippe Cubitus …" on every listing. Both components were individually correct, the seed was correct, and the tests asserted each field in isolation. It survived a visual pass because it reads like a deliberate caption-plus-title design. `titleWithoutBrand` (`src/lib/product/title.ts`) strips the prefix at a word boundary only, so `Rolexford 100` keeps its name, and both mappers call it. When a component prints two fields that can overlap, assert on the rendered text as a whole, not on each field.
- **A validated parameter is not a stored value.** `submit_sell_trade_request`
  checked `p_transaction_type` against `('sell','trade')` and then inserted
  without it, and the table had no column for it either. A customer who chose
  "trade" was persisted as a sell request; the only trace of their real intent
  was the notification email. Five more fields the forms collected had the same
  fate (material, movement, trade-in target; sourcing condition/box/material;
  repair budget) until `0019_service_intake_fields.sql` added them.

  This is the third instance of one mistake: a control that _looks_ like it
  decides something but is not the thing that does. Phase 6 had a row policy
  that did not restrict columns; Phase 11 had a function that validated a
  parameter it discarded. The reliable assertion is the same every time — **read
  back what the consumer will read, not what the producer was handed.** A test
  that asserts the parsed object or the function argument proves nothing about
  the row staff will later open.

  When adding a field end to end, walk it in one direction and do not stop at
  the first green step: form → schema → action → RPC argument → function
  signature → **table column** → grant list → read path. Any of those can be
  absent while every earlier one looks correct.

- **An allowlist of friendly errors is not a guarantee that any caller produces
  them.** `SAFE_DATABASE_MESSAGES` in `src/lib/service/validation.ts` decides
  which database messages reach the visitor verbatim; everything else becomes a
  generic failure. That makes the list a contract with the SQL, and nothing
  enforces the SQL half. "That time has just been taken" sat in the list, with a
  unit test asserting it was there, while `request_appointment` let the raw
  `unique_violation` from `appointments_slot_start_key` escape — so the one case
  the message existed for showed the customer a constraint name and the slot
  time. When you add a friendly message, add the `raise` that produces it in the
  same change, and assert the message text in a database test. `assert_raises`
  is not enough: it passes on any error.
- **A check-then-insert is not a constraint.** `request_appointment` validates
  the slot against `appointment_availability` before inserting, and that check is
  still worth having because it can explain _why_ a time is wrong. It cannot
  prevent a double booking: two callers can both pass it before either inserts.
  The partial unique index is the actual guarantee, so the insert must handle its
  violation rather than assume the check caught everything.
- **A product has no `inventory` row until its first count.** `products` and
  `inventory` are 1:1 by intent, but nothing creates the row: `createProductAction`
  writes `products` and publishes through `admin_set_product_status`, and neither
  touches `inventory`. The row is created lazily by
  `apply_inventory_transaction` when a ledger row is inserted for a product that
  has none. `is_product_available` therefore reports a never-counted product as
  unavailable, and the card badges it "Reserved" — the same word it uses for a
  piece that is genuinely spoken for (G83, G84). `admin_adjust_stock` now creates
  the row on the first positive adjustment (0026); it refuses a negative first
  adjustment, because that is a mis-specified delta rather than a correction. If
  you add a product-creation path, decide whether it should seed stock; do not
  assume the row exists.
- **Never derive a customer-facing identifier from the clock.** The service
  reference was `extract(epoch from now()) % 1000000`, which looks unique and is
  not: two submissions in the same second get the same string, so a customer
  quoting a reference cannot be matched to one row. `order_reference_seq` exists
  precisely to avoid this; `service_reference_seq` now does the same for service
  submissions. The lesson is in the _shape_ of the test as much as the fix: one
  submission per test can never see a collision, because a single call in a single
  second is unique by construction. Any uniqueness claim needs a loop.
- **A green single-submission test says nothing about uniqueness.** This is why
  the defect above survived to the browser stage while `50_service_flows.sql` was
  green. When you assert that something is unique, produce several of them in the
  smallest interval the system can distinguish, not one.
- **A test that asserts a URL round-trips is testing the router, not the
  feature.** The catalogue's only sort test navigated to `?sort=price-asc` and
  checked the URL still said `price-asc`. The enum value is `price_asc` (an
  underscore), so the parser rejected it and fell back to `featured` — the page
  rendered the default order and the assertion passed anyway, because a URL
  echoes whatever it was given. Sorting had never been exercised at all, and the
  phase's claim that it worked rested on that test. When you test a control that
  changes what is rendered, assert the rendered consequence (the selected value
  read back, the order of the rows), and confirm the test fails when the feature
  is broken. A silent fallback is what makes this class of test vacuous, and
  every parser here has one: an unknown sort, page or facet value must render
  the default rather than error, which is right for a visitor and invisible to a
  test that only looks at the URL.
- **A migration that skips its own body is a migration nothing tests.** `0015`,
  `0022` and `0023` all guard their bucket and storage-policy blocks on
  `information_schema.schemata` containing `storage`, so the migrations still
  apply to a plain Postgres. The verification database has no `storage` schema,
  so on it those blocks create nothing — and the policies they define were
  executed by no test at all, while reading correctly. This is the same shape of
  gap as the column-grant leak: the SQL is right and nothing proves it.
  `supabase/tests/63_profile_avatars.sql` closes it for `0023` by building the two
  `storage` tables and `storage.foldername` the policies need, re-applying the
  policy SQL, and asserting behaviour with real JWTs. Any new bucket needs the
  same suite; a policy asserted nowhere is a policy you are trusting.
- **Assert the statement shape the code actually sends.** Two separate inserts
  and one insert with a repeated row are different tests. `mergeGuestWishlist`
  hands the whole id list to supabase-js as a single `upsert`, so a tampered
  `localStorage` value produces a repeated row _inside one statement_ — the case
  suite 18 covered last, in block 4b2, long after it covered two separate
  inserts. Postgres collapses the repeated row under `on conflict do nothing`,
  so the outcome is correct either way; the test only has value if it reproduces
  the shape the client can really send.
- **A test can pass for a reason the code does not implement.** The first
  `mergeWishlistSchema` test asserted deduplication, which the schema never did
  — the database unique constraint is what prevents a duplicate row. A test that
  asserts a guarantee no layer makes is worse than no test: it fails when the
  code is correct, and if it ever passed it would be passing on some other
  property. Assert the contract the layer under test actually owns.
- **`db-verify.sh` leaves fixtures behind.** The RLS suites and the concurrency
  harness insert their own rows. A database that has run `db-verify.sh` shows
  **4126 products and 6 brands**, not the seed's 4110 and 4. This is expected, not
  a seed bug. Counts on a clean database: 4110 products, 4 brands, 41 models,
  8785 specs.
  **The leftovers are publicly visible.** `10_public_boundary.sql` and
  `50_service_flows.sql` insert a _published_ product under their own brand
  (`Test Brand` / `test-brand`, `Service Brand` / `service-brand`) and never
  remove it, so `/brands`, the brand facet and `/sitemap.xml` all offer them as
  stock. Run `./scripts/db-reset.sh` before `npm run preview` if the catalogue is
  going to be looked at or audited. This is G66, and the naive fix — deleting the
  fixtures at the end of each suite — breaks suites `21` and `40`, which depend on
  the `bank_transfer` payment method that suite `10` inserts.
- **`supabase/tests/00_supabase_shim.sql` is a test fixture, not a deployment
  artifact.** It fakes `auth.users`, `auth.uid()` and the API roles so the
  policies can be tested outside Supabase. Never apply it to a real project.
- **Roles live in `user_roles`, not `profiles.role`.** RLS restricts rows, not
  columns, so a role column on a self-editable profile row is one policy mistake
  away from privilege escalation. Do not add one back.
- **`admin_audit_logs` has no write policy at all.** Not even `SUPER_ADMIN` can
  insert through the API. Writes are expected to go through a `SECURITY DEFINER`
  function. If a feature needs to write an audit row, write that function.
- **A role change is a function call, never a table write.** `user_roles` has an
  `ALL` policy for `SUPER_ADMIN`, so a direct insert would pass RLS and still be
  wrong: a row policy cannot set `granted_by` to the real actor, cannot re-check
  that the actor still holds `SUPER_ADMIN` at the moment of the write, cannot
  write the audit row, and cannot refuse the two things that must be refused —
  self-elevation and removing the last unexpired `SUPER_ADMIN`.
  `admin_grant_role`/`admin_revoke_role` (migration `0033`) are the only paths.
- **Write the audit row before a destructive step that changes the actor's own
  authority.** `admin_write_audit_log` refuses a non-staff caller, so a super
  administrator revoking their own last staff role ceases to be staff the instant
  the row is deleted. `admin_revoke_role` therefore writes the audit row first;
  the transaction makes the pair atomic either way. This was caught by the test,
  not by review — the ordering looked harmless.
- **Product removal is an archive, not a delete.** `products` is referenced by
  `order_request_items`, `cart_items`, `wishlist_items`, `inventory` and the
  service tables, so `DELETE` cascades order history away. `admin_remove_product`
  sets `status = 'archived'`, which every public query and the sitemap already
  exclude. Do not "clean up" archived rows.
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
- **Catalogue query parameters are camelCase, and a snake_case spelling is
  silently ignored.** `priceMode`, `boxAndPapers`, `yearMin`, `caseMax`,
  `pageSize` are the real names; `?price_mode=priced` is not read at all, so the
  listing stays clean, stays indexable, and looks like a broken filter or a
  robots bug when it is neither. This cost a false alarm in the Phase 5
  re-audit. When testing a filter through the URL, take the parameter name from
  `buildCatalogueHref` in `src/lib/catalogue/params.ts`, not from the SQL
  argument name — the RPC uses `p_price_mode` and neither of the other two
  spellings works. `priceMin`/`priceMax` are the same trap in a different
  dimension: the URL carries **major units** and `parseCatalogueParams` converts
  them with `toMinorUnits` to the **cents** the RPC expects. A URL value and a
  database value are not the same number, so do not compare them directly.
- **`aria-pressed` is not allowed on a link.** It failed the browser audit on the
  catalogue filter rows (`aria-allowed-attr`), which are `<a>` elements that
  navigate. Use `aria-current` for "the current item in a set of links", and
  `aria-pressed` only on a real `<button>`. jsdom does not run this rule, so the
  audit is what catches it.
- **`pointer-events-none` is not a disabled control.** A zero-count facet row
  rendered as an `<a class="pointer-events-none">` cannot be clicked, but it stays
  in the tab order and still navigates on `Enter` — so a keyboard user reaches an
  empty grid a mouse user cannot. Render a `<span aria-disabled="true">` instead:
  not focusable, announced as unavailable, and still in place so the panel does
  not jump as counts change. Keep the current selection clickable; it is the way
  back out of a filter.
- **A validating parser's allowlist must contain everything the database can
  produce, or the filter silently does nothing.** The facet-value pattern once
  excluded apostrophes and underscores, which dropped `gender=Men's` and
  `condition=pre_owned` — the two most useful facets on a pre-owned catalogue. A
  dropped value is not an error, so the page rendered all twelve products and
  looked like a filter that matched everything. `tests/catalogue-params.test.ts`
  now parses every value the seed stores.
- **A listing's address is not always derivable from its scope.** `/search` has
  scope `all`, and scope `all` means `/shop`, so every facet link, sort
  submission, pagination link and its canonical pointed into the shop.
  `CatalogueParams.basePath` carries the listing's own path where the scope does
  not imply it, and is `null` on the scope-derived routes. A new listing route
  with its own URL must set it, or it will link into `/shop`.
- **A green browser audit against a nearly empty database is evidence about the
  empty states, not about the pages.** `/brands/[slug]/models/[model]` failed
  WCAG 1.4.1 (`link-in-text-block`) on a hand-rolled breadcrumb that used bare
  `/` separators, and the audit had never seen it because no seeded product
  belonged to a model page. Publishing 72 rows to exercise pagination made the
  cards render and the defect appeared at once. Use the shared `Breadcrumbs`
  component — it renders an `<ol>`, so no link shares a text block with prose.
- **A heading that is `display:none` is not in the accessibility tree, so it
  cannot carry heading order.** The catalogue's cards are `h3`, and the only
  `h2` above them was the filter sidebar's "Filter" — which is `hidden lg:block`.
  On a wide screen the order was `h1 → h2 → h3` and the audit passed; on a
  narrow screen the sidebar is gone, so the cards followed the `h1` directly and
  `heading-order` failed **on mobile only**. The grid now owns its own `sr-only`
  `h2` (`CatalogueGrid`, opt out with `headingId={null}` where a caller already
  renders a heading above it, as the product page's related-products section
  does). `TrustRow` had the same skip and its items are now `h2`.
  `tests/catalogue-heading-order.test.tsx` asserts the level and the document
  order directly, because jsdom can check _that_ even though it cannot check the
  rule. When a heading passes on desktop and fails on mobile, look for a
  responsive `hidden` on the heading itself or on an ancestor.
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
- **A running server and `npm run build` cannot share `.next`.** `npm run verify`
  ends in `next build`, which rewrites `.next` while a preview is serving it. The
  server keeps its in-memory route manifest, so it answers the _old_ hashed asset
  URLs while the files on disk are the new ones — `/_next/static/css/<old>.css`
  returns the HTML 404 page, the browser refuses it as a stylesheet, and the
  audit reports a page with no CSS. The symptoms are convincing and wrong: every
  page suddenly fails `target-size` and `errors-in-console`, accessibility drops
  from 100 to 96, and it looks like a layout regression in the last commit. The
  console entry `Refused to apply style … MIME type ('text/html')` is the tell.
  Restart the preview (`npm run preview` rebuilds and rebinds) before trusting any
  audit that follows a `verify`, and confirm one `/_next/static/css/*.css` request
  returns `text/css` before reading the scores.

- **A green audit of a `404` proves nothing, so a route is discovered, not
  hardcoded.** `axe` audits whatever document it is given, and the not-found
  template is perfectly accessible — a URL that no longer exists scores "ok".
  `auditPage` therefore records an `http-error` for any non-`2xx` response
  (except the deliberate `/this-page-does-not-exist`), and the product and model
  paths are read out of the served HTML at runtime. Hardcoding a seed slug is how
  an audit silently stops measuring anything while still reporting success.

- **Indexable is not the same as reachable.** A model page was indexable, listed
  in `sitemap.xml`, and linked from the header's mega-menu — but that menu is a
  Radix panel that mounts on interaction, so it contributed **no anchors to the
  served HTML**. The crawlable path was zero. `/search` linked models, but to the
  `noindex` `?model=` facet. When you add a route, check that something in the
  served HTML is an ordinary `<a href>` to it; assert the anchor in a test
  (`tests/search-landing.test.tsx`), because a sitemap entry will not tell you.

### Authentication and the account area

**A layout cannot see the URL it is rendering.** The `/account` guard lives in
`src/app/(site)/account/layout.tsx`, so it runs for every route beneath it —
including ones added later. But a layout receives no pathname, so it cannot know
which page the visitor was heading for, and it will send everyone to the same
place after sign-in unless told otherwise. `src/middleware.ts` forwards it as the
`x-pathname` request header. Two traps there: the header must be built once and
reused for _every_ `NextResponse.next()` — the Supabase cookie callback rebuilds
the response and a bare rebuild drops it — and the header is attacker-influenced
in principle, so the guard checks `startsWith('/account')` before using it and the
sign-in action validates it again.

**The open-redirect guard is one module, and it must stay one.** `safeRedirectPath`
in `src/lib/auth/redirect.ts` is used by the sign-in action, the sign-in page and
`/auth/callback`. A security check copied into three places is one that will
eventually be fixed in only one of them. It rejects absolute URLs,
protocol-relative `//host` (a single-leading-slash check accepts this, which is the
classic way the guard is written wrongly), backslash variants browsers normalise
to a slash, and non-http schemes. It always returns a usable path, never `null`, so
a caller cannot mistake "rejected" for "no redirect".

**One map decides who may enter a section, and it lives in `src/lib/admin/sections.ts`.**
The admin layout (to refuse), the sidebar (to decide which links to render) and
the overview (to choose where a role lands) all ask the same pure module. When
each held its own copy the drift was invisible: a link that renders but refuses,
or a route that opens with no link to it. Three things in that map are easy to
get wrong:

- **A section requirement is a permission _or_ a role, not always a permission.**
  `/admin/staff` is the screen that _grants_ permissions, so gating it on
  `customers.read` would let an `ADMIN` promote themselves by editing roles — the
  check would be circular. It requires `SUPER_ADMIN`, exactly as its page does.
  A permission-only map admitted a plain `ADMIN` to the layout and then let the
  page throw behind it: a 500 for an ordinary refusal.
- **Match on a path boundary, never a bare prefix.** `/admin/ordersomething` must
  not be read as `/admin/orders`.
- **The refusal is presentation, not the security boundary.** Next.js renders a
  layout and its page segment _concurrently_, so returning a panel instead of
  `children` does not stop the page function running — it still executed and threw
  in the log even while the panel was shown. What actually denies access is each
  page's own `requirePermission`, which every admin page calls **before reading a
  row**. The layout's refusal exists so the caller gets a clean in-shell "not
  available" panel with their own navigation, instead of the generic 500.

**A single-section manager has no dashboard, and must not be sent to one.** The
overview at `/admin` reports across every section — orders, enquiries, stock, the
audit trail — which is an administrator's page. A manager is redirected from it
to their own section by `landingSectionFor`, which prefers the section's _write_
permission so an inventory manager lands on Inventory rather than on the order
queue they may merely read. `maySeeOverview` is `identity.isAdmin`, not "holds
any permission": holding a permission to read a figure is not the same as the
overview being that person's page, and letting a manager sit on it is exactly the
"another person's dashboard" the role split exists to prevent. The Dashboard nav
entry and the dashboard's own counts are scoped by the same rule, so a manager
never sees a figure from a section they do not run.

**Roles are read through functions, never a column.** `authorization-service.ts`
calls the `SECURITY DEFINER` helpers `is_staff()`/`is_admin()`/`has_permission()`,
which derive the user from `auth.uid()` inside the database and take no user
argument, so there is no parameter a caller could forge. They fail closed. There is
still deliberately no `role` column on `profiles`: a customer can update their own
profile row, so a role there would be one policy mistake away from self-promotion.

**Use the anon client, not the service-role client, for anything a customer does.**
`auth-repository.ts` uses the request-scoped cookie-aware anon client throughout.
The service-role client authenticates the _call_ but not the _caller_: it would
bypass the RLS policies that make a customer's own rows the only rows they can
reach.

**The logger redacts keys, not values.** A log call that passes an email address as
a value writes it in clear, whatever the key is named. Pass an event name and
counts, not identifiers.

**`public.messages` is staff-to-staff, and a customer is filtered to zero rows, not
refused.** The policy is `messages_staff_only`, written as `is_staff() and (...)`,
so a customer's query succeeds and returns nothing rather than raising `42501` —
the table-level grant exists because the shim mirrors Supabase's default
privileges. Both outcomes keep the data safe, but a test that asserts the wrong
one fails for the wrong reason and would keep passing if the mechanism changed.
Assert zero rows. The customer-facing conversation is `inquiries` +
`inquiry_replies`, where `is_internal` rows are withheld even on a thread the
customer owns.

**A guard in a layout is proven by the redirect, not by the page list.** The
`/account` guard lives in the layout, so it runs for every route beneath it. The
browser audit must not put those routes in `PAGES`: it would follow the redirect to
`/login` and report a clean pass for the sign-in page — the same trap as auditing a
404 template. `scripts/a11y-audit.mjs` has a separate `GUARDED_PATHS` pass that
asserts each route lands on `/login` with a `next` naming it. If you add an account
page, add it there, and confirm the pass still fails when pointed at a public path.

## Catalogue and discovery

### One rule decides what may be indexed, and the sitemap applies the same one

`src/lib/catalogue/params.ts` owns the decision, and **one function answers both
halves of it**: `listingSeo(params, total, scopeIsEligible)` returns the canonical
path and whether the page may be indexed. Every listing route — `/shop`, a brand,
a collection, a model — calls it, so they cannot drift apart. A clean listing is
indexable with a self-canonical; a filtered, searched or sorted one is
`noindex, follow` and canonicalises onto the clean listing. The full table is in
`docs/SEO.md`, and `tests/catalogue-params.test.ts` pins it.

**Indexability is not a function of the query string alone.** `isIndexableListing()`
reads only the parameters, so it said "pagination is a genuine series" and
indexed `?page=999` on a one-page listing — a soft 404, self-canonical, and one of
ten thousand possible addresses competing with the real page. The answer needed a
fact the query string does not carry: whether the requested page exists, which
only the loaded listing knows. If you add a rule about a listing's crawlability,
pass it the result count too, and go through `listingSeo` rather than composing
`isIndexableListing` and `canonicalListingPath` at the call site.

The scoped half is separate because it needs a database number rather than only
the query string: a brand or collection page holding **zero published pieces** is
`noindex, follow` and is omitted from `sitemap.xml`. Both sides read
`published_product_counts()` / `published_collection_counts()`, so they cannot
reach different answers. If you add another page type with a countable body, give
it an aggregate rather than counting rows in the component — a client-side count
is how the page and the sitemap start disagreeing.

**`robots.txt` deliberately has no query-string rules.** A disallowed URL is never
fetched, so its `noindex` and canonical are never read — blocking the crawl does
not suppress the URL, it only stops the page saying where it belongs.
`tests/robots.test.ts` asserts no query-string pattern comes back.

**The sitemap reads with the cookie-free client** (`lib/supabase/public.ts`), not
the cookie-aware one. Reading a cookie makes the route dynamic, and a crawler's
repeated fetch would become a repeated database query. `sitemap-repository.ts`
exists for this reason; do not "simplify" it into `catalogue-repository.ts`.

**Product entries are paged, and membership is RLS's decision.** `products` is
read 1000 rows at a time because PostgREST caps a single response — a one-shot
query would silently truncate the catalogue at the cap and the sitemap would look
complete while missing most of it. The query applies no status filter of its own:
the public-read policy already restricts it to published rows, so adding a second
filter here would be a second rule that can disagree with the page. If a product
entry goes missing, check the policy before adding a `where` clause.

### `/search` is a query surface, never a document

`/search` is `noindex` unconditionally — including the blank page. With no term
and no filters it renders an index of collections, brands and model families with
real counts (`search-landing.tsx`), not the shop grid. Rendering the grid there
made `/search` a second `/shop`: identical rows in identical order under a second
URL. Do not restore that to "fill the page".

Search reuses the listing pipeline — the same RPC, facets and cards. A second
result pipeline is how search results and the catalogue start looking different.

## Content and licensing

The seed carries factual attributes only — brand, reference number, case size,
movement, dial, and so on. It deliberately excludes the reference site's
photography, marketing prose and prices, and claims no authorised-dealer status.
Do not add those back from the reference site; it is not our content.

**Seed copy that reaches a page is page content, not filler.** `brands.description`
is printed in the hero and in `<meta name="description">` of `/brands/[slug]`,
which is indexable and self-canonical, so a placeholder there is a thin-content
defect on a ranking page — not a harmless stub. All four brands once carried the
same `'Reference brand seeded for development.'`, and each page passed the
published-count check and appeared in the sitemap because a count asks "is there
anything to show?", never "is there anything to say?" (G78).

The trap is that placeholder data is _worse_ than missing data: `page.tsx` falls
back to a generated sentence naming the brand, but only when `description` is
null, so a populated placeholder defeats code written to handle the gap.
`tests/seed-copy.test.ts` guards the seed — no placeholder phrasing, no two brands
alike, each description long enough to add something a template could not say.

Two mechanics to remember when changing seeded copy:

- **The `on conflict` clause must name the column you changed.** The brand seed
  updated only `name`, `is_active` and `sort_order`, so re-running it against an
  existing database left the old description in place. Editing the `insert` alone
  fixes a fresh database and nothing else.
- **Edit the seed with a byte-level tool, not a text round-trip.** `01_catalogue.sql`
  contains stray CR characters in a handful of spec strings; a naive read/write in
  Python strips them and turns a four-line change into an unrelated multi-line
  diff. Use `git diff` on the seed and expect only your own lines.

## Site photography

The editorial photography — the pictures in `PageHero`, the homepage carousel and
the mid-page bands — is not the product catalogue. It is licensed stock chosen
for a dark, editorial register, and it lives under `public/site-photography/`.

`src/lib/images/site-photography.ts` is the **single registry**. Every file has
its recorded dimensions, author, licence and licence URL there, and
`tests/site-photography.test.ts` verifies the dimensions against the real files
on disk. `SITE_PHOTOGRAPHY` is for components that know which picture they want;
`resolveSitePhotograph()` is for a path that came out of the database and returns
`null` for anything not in the registry, so an administrator's upload falls
through untouched rather than being forced into the seed's catalogue.

**The licence rule is a test, not a convention.** `tests/seed-photography.test.ts`
requires a licence matching `^CC BY(-SA)? [0-9.]+$` — so `CC BY-SA 4.0` and
`CC BY 2.0` pass, while `CC0` (wrong shape entirely) and `CC BY-SA 3.0 fr` (a
locale suffix the pattern does not allow) are rejected. Both were hit in
practice; one picture was dropped rather than the pattern widened. When a new
picture is rejected, pick another — do not loosen the test to make it pass.

**A `priority` image is downloaded even when CSS hides it.** `priority` emits
`<link rel="preload">`, and a preload ignores `display: none`. `PageHero` hides
its photograph below `lg`, so marking that image `priority` made every interior
page download a hero it never painted — 14.7 KB per pageview at 320px, competing
with the `h1`, which is the real LCP element. The image is `loading="lazy"` with
no preload instead: a hidden lazy image is never fetched, and on desktop it is in
the initial viewport so the loader fetches it immediately. `tests/page-hero.test.tsx`
pins this. The general rule: **never put `priority` on an image a breakpoint can
hide.**

**`MediaFrame` is for products, not for atmosphere.** It letterboxes on a white
panel with `object-contain`, because a watch is tall and `cover` would crop the
lugs. An editorial hero wants the opposite — `object-cover`, filling its frame.
Reaching for `MediaFrame` out of habit is how an editorial photograph ends up
floating in a white box.

**A static file added after the dev server starts is a 404.** Next.js serves
`public/` from the build manifest, so adding a webp and refreshing the running dev
server shows a broken image. Restart the server, and rebuild before auditing a
production build.

## Payments

There is no payment gateway, no card handling, and no provider abstraction. A CI
guard (`scripts/check-no-payment-providers.mjs`) enforces this. If it flags a
line that names a card field in order to forbid it, add the file to
`ALLOWED_FILES` in that script with a comment explaining why — do not weaken or
delete the check.

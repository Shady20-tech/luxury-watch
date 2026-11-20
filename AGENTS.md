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

`src/lib/catalogue/params.ts` owns the decision: `isIndexableListing()` and
`canonicalListingPath()`. A clean listing is indexable with a self-canonical; a
filtered, searched or sorted one is `noindex, follow` and canonicalises onto the
clean listing. The full table is in `docs/SEO.md`, and
`tests/catalogue-params.test.ts` pins it.

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

## Payments

There is no payment gateway, no card handling, and no provider abstraction. A CI
guard (`scripts/check-no-payment-providers.mjs`) enforces this. If it flags a
line that names a card field in order to forbid it, add the file to
`ALLOWED_FILES` in that script with a comment explaining why — do not weaken or
delete the check.

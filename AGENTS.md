# AGENTS.md — working notes for this repository

Luxury-watch storefront and admin platform. Next.js 15 App Router, TypeScript,
Tailwind, Supabase (Postgres + Auth + Storage + RLS), Resend for email, deployed
on Vercel. **No online payments** — customers submit an order *request* and an
administrator settles payment offline.

This file holds the operational knowledge that is expensive to rediscover. Read
it before starting work, and keep it current when something here stops being true.

## Where the truth lives

| Question | Read |
| --- | --- |
| What is the schema, exactly? | `DATABASE_SCHEMA.md` — authoritative |
| Why is it built this way? | `ARCHITECTURE.md` |
| What phase are we in? | `IMPLEMENTATION_PLAN.md` |
| What is broken or unverified? | `KNOWN_ISSUES.md` |
| What changed, and when? | `CHANGELOG.md` |
| What does the reference site do? | `REFERENCE_ANALYSIS.md` |

`ARCHITECTURE.md` section 5 describes design *intent* and has been corrected
where it drifted; `DATABASE_SCHEMA.md` is what the migrations actually build.
Trust the schema doc when the two disagree.

## Commands

```bash
npm run verify        # payment guard, format, lint, typecheck, tests, build
npm run dev           # dev server

./scripts/db-reset.sh            # drop and recreate the test database
./scripts/db-verify.sh           # migrations + RLS suites
./scripts/db-concurrency-matrix.py   # inventory oversell proof
```

`npm run verify` runs the same steps in the same order as CI. If you add a check
to CI, add it to `verify` in the same commit — these diverging is exactly what
caused a green local run and a red CI run in Phase 2.

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

### Things that will bite you

- **`db-verify.sh` leaves fixtures behind.** The RLS suites and the concurrency
  harness insert their own rows. A database that has run `db-verify.sh` shows
  **4119 products and 5 brands**, not the seed's 4110 and 4. This is expected, not
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

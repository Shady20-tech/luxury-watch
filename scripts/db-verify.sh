#!/usr/bin/env bash
# =============================================================================
# Verify the database layer against a real Postgres server.
#
# Applies the Supabase environment shim, then every migration in order, then the
# RLS/authorisation test suite. Stops at the first failure and reports which file
# broke, so a broken migration is caught before it reaches a real project.
#
# Two ways to reach Postgres, chosen automatically:
#
#   1. A local Docker container (the development path). Pass the container name.
#   2. A server reachable over TCP (the CI path). Set PGHOST/PGPORT/PGUSER/
#      PGPASSWORD/PGDATABASE and the plain `psql` client is used instead.
#
# Usage:
#   scripts/db-verify.sh [container-name]      # Docker
#   PGHOST=... scripts/db-verify.sh            # direct psql
# =============================================================================
set -uo pipefail

CONTAINER="${1:-lw-pg-test}"

# Prefer a direct psql connection when the standard libpq variables are set,
# because that is how CI reaches the service container. Falling back to Docker
# in that case would be wrong: CI has no daemon, so a silent fallback would turn
# a missing client into a confusing connection error. Fail loudly instead.
if [ -n "${PGHOST:-}" ]; then
  if ! command -v psql >/dev/null 2>&1; then
    echo "PGHOST is set but the psql client is not installed." >&2
    exit 1
  fi
  MODE="direct"
  PSQL=(psql -v ON_ERROR_STOP=1)
elif docker info >/dev/null 2>&1; then
  MODE="docker"
  PSQL=(docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1)
elif sudo -n docker info >/dev/null 2>&1; then
  MODE="docker"
  PSQL=(sudo -n docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1)
else
  echo "No Postgres access: set PGHOST (with psql installed), or run a Docker container." >&2
  exit 1
fi

if ! "${PSQL[@]}" -q -c 'select 1' >/dev/null 2>&1; then
  echo "Postgres is not reachable (mode: $MODE)." >&2
  exit 1
fi

LOGDIR="$(mktemp -d)"
trap 'rm -rf "$LOGDIR"' EXIT

fail() {
  echo
  echo "FAILED: $1" >&2
  exit 1
}

echo "=== Supabase environment shim ==="
"${PSQL[@]}" -q < supabase/tests/00_supabase_shim.sql >"$LOGDIR/shim.log" 2>&1 \
  || { cat "$LOGDIR/shim.log"; fail "shim"; }
echo "    ok"

echo
echo "=== Migrations ==="
for f in supabase/migrations/*.sql; do
  printf '    %-52s ' "$(basename "$f")"
  if "${PSQL[@]}" -q < "$f" >"$LOGDIR/migrate.log" 2>&1; then
    echo "ok"
  else
    echo "FAILED"
    cat "$LOGDIR/migrate.log"
    fail "$(basename "$f")"
  fi
done

echo
echo "=== RLS and authorisation tests ==="
# Each suite runs inside a transaction that is rolled back, so a suite leaves no
# rows behind. That matters because the suites insert published products and
# brands to have something real to leak, and those rows were reaching the public
# catalogue and the sitemap of any preview built on the verified database (G66).
#
# Wrapping is per suite, not around the whole run, for two reasons. A failure
# must stop at the suite that failed and leave the earlier suites' effects
# available for inspection, which a single outer transaction would not do. And a
# suite that aborts its own transaction (any uncaught `raise exception`) would
# otherwise poison the connection for every suite after it; here each suite gets
# its own.
#
# This is safe only while no suite contains its own transaction control or a
# statement Postgres refuses inside a transaction (CREATE INDEX CONCURRENTLY,
# VACUUM). `scripts/check-test-suite-isolation.mjs` asserts that, so a suite that
# breaks the assumption fails in CI rather than at the next `db-verify.sh`.
for f in supabase/tests/[0-9][0-9]_*.sql; do
  # The shim is applied above, not as a test.
  case "$(basename "$f")" in 00_*) continue ;; esac
  printf '    %-52s ' "$(basename "$f")"
  # ON_ERROR_STOP is already on `PSQL`, so a failing assertion stops the run. The
  # explicit begin/rollback is used rather than `-1`, because `-1` opens its own
  # transaction and then tries to COMMIT it — which would commit the very rows
  # the rollback exists to discard.
  if { echo 'begin;'; cat "$f"; echo 'rollback;'; } \
       | "${PSQL[@]}" -q >"$LOGDIR/test.log" 2>&1; then
    echo "ok"
  else
    echo "FAILED"
    cat "$LOGDIR/test.log"
    fail "$(basename "$f")"
  fi
done

echo
echo "=== Seed data ==="
# Seeds are applied last, on purpose. They insert fixed demo rows, and running
# them before the RLS suites would change the row counts those suites assert
# against. Applying them after proves two things the RLS suites cannot: that
# every seed file is valid SQL against the real schema, and that re-running it
# is idempotent.
for f in supabase/seed/*.sql; do
  printf '    %-52s ' "$(basename "$f")"
  if "${PSQL[@]}" -q < "$f" >"$LOGDIR/seed.log" 2>&1; then
    echo "ok"
  else
    echo "FAILED"
    cat "$LOGDIR/seed.log"
    fail "$(basename "$f")"
  fi
done

echo
echo "    re-applying to prove idempotency"
for f in supabase/seed/*.sql; do
  printf '    %-52s ' "$(basename "$f") (re-run)"
  if "${PSQL[@]}" -q < "$f" >"$LOGDIR/seed.log" 2>&1; then
    echo "ok"
  else
    echo "FAILED"
    cat "$LOGDIR/seed.log"
    fail "$(basename "$f") on re-run: seeds must be idempotent"
  fi
done

# Assert the content the chrome depends on actually landed. Without this the
# script would pass even if a seed file were emptied.
printf '    %-52s ' "expected content rows"
CONTENT_COUNTS=$("${PSQL[@]}" -tA -c "
  select
    (select count(*) from public.navigation_items where location = 'header') || '/' ||
    (select count(*) from public.navigation_items where location = 'footer') || '/' ||
    (select count(*) from public.announcements) || '/' ||
    (select count(*) from public.site_settings) || '/' ||
    (select count(*) from public.pages where status = 'published' and is_system = false) || '/' ||
    (select count(*) from public.faqs where is_published and id::text like '00000000-0000-4000-8000-0000000004%');
" 2>"$LOGDIR/counts.log") || { cat "$LOGDIR/counts.log"; fail "content count query"; }

# header/footer/announcements/settings. Navigation counts are minimums because
# the seed is not the only writer; settings and announcements are exact.
#
# `pages` counts only non-system published rows, because migration 0006 creates
# system pages as drafts and the seed publishes five of them (about, faq,
# shipping, terms, warranty); a `is_system = false` filter isolates the ones the
# seed writes. It was 6 until the suites were isolated: the sixth was a published
# page an RLS suite inserted and never removed (G66), so this floor was calibrated
# against leaked data. The `faqs` filter is on the seed's
# fixed id namespace for the same reason: the RLS suite inserts its own FAQ rows
# with generated ids, so filtering to the `…0000000004xx` block counts the seed's
# rows and nothing else. (A `…045%` prefix would have missed `…0460`.)
HEADER_MIN=8
FOOTER_MIN=12
ANNOUNCEMENT_MIN=1
SETTINGS_MIN=1
PAGES_MIN=5
FAQS_MIN=10
IFS='/' read -r header_count footer_count announcement_count settings_count page_count faq_count <<<"$CONTENT_COUNTS"

if [ "${header_count:-0}" -ge "$HEADER_MIN" ] \
  && [ "${footer_count:-0}" -ge "$FOOTER_MIN" ] \
  && [ "${announcement_count:-0}" -ge "$ANNOUNCEMENT_MIN" ] \
  && [ "${settings_count:-0}" -ge "$SETTINGS_MIN" ] \
  && [ "${page_count:-0}" -ge "$PAGES_MIN" ] \
  && [ "${faq_count:-0}" -ge "$FAQS_MIN" ]; then
  echo "ok ($CONTENT_COUNTS)"
else
  echo "FAILED"
  echo "    expected at least $HEADER_MIN/$FOOTER_MIN/$ANNOUNCEMENT_MIN/$SETTINGS_MIN/$PAGES_MIN/$FAQS_MIN," \
       "got $CONTENT_COUNTS" >&2
  fail "seed content counts"
fi

echo
echo "Database verification passed."

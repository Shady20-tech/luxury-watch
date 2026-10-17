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
for f in supabase/tests/[0-9][0-9]_*.sql; do
  # The shim is applied above, not as a test.
  case "$(basename "$f")" in 00_*) continue ;; esac
  printf '    %-52s ' "$(basename "$f")"
  if "${PSQL[@]}" -q < "$f" >"$LOGDIR/test.log" 2>&1; then
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
    (select count(*) from public.site_settings);
" 2>"$LOGDIR/counts.log") || { cat "$LOGDIR/counts.log"; fail "content count query"; }

# header/footer/announcements/settings. Navigation counts are minimums because
# the seed is not the only writer; settings and announcements are exact.
HEADER_MIN=8
FOOTER_MIN=12
ANNOUNCEMENT_MIN=1
SETTINGS_MIN=1
IFS='/' read -r header_count footer_count announcement_count settings_count <<<"$CONTENT_COUNTS"

if [ "${header_count:-0}" -ge "$HEADER_MIN" ] \
  && [ "${footer_count:-0}" -ge "$FOOTER_MIN" ] \
  && [ "${announcement_count:-0}" -ge "$ANNOUNCEMENT_MIN" ] \
  && [ "${settings_count:-0}" -ge "$SETTINGS_MIN" ]; then
  echo "ok ($CONTENT_COUNTS)"
else
  echo "FAILED"
  echo "    expected at least $HEADER_MIN/$FOOTER_MIN/$ANNOUNCEMENT_MIN/$SETTINGS_MIN," \
       "got $CONTENT_COUNTS" >&2
  fail "seed content counts"
fi

echo
echo "Database verification passed."

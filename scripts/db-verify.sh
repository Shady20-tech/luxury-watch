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
echo "Database verification passed."

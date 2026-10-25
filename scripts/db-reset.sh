#!/usr/bin/env bash
# =============================================================================
# Drop everything and re-apply the shim, so `db-verify.sh` always starts from a
# clean database. Proves the migrations work from scratch, not only on top of a
# database a previous run already prepared.
#
# Dual-mode, like `db-verify.sh`: when `PGHOST` is set the reset runs over a
# direct TCP connection, and otherwise it shells into the Docker container. CI
# has no Docker daemon, so a Docker-only reset would make "prove it works from
# scratch" impossible there — which is the one thing this script exists to do.
#
# Usage:  scripts/db-reset.sh [container-name]
# =============================================================================
set -uo pipefail

CONTAINER="${1:-lw-pg-test}"

if [ -n "${PGHOST:-}" ]; then
  if ! command -v psql >/dev/null 2>&1; then
    # Fail loudly rather than falling back to Docker: the caller asked for a TCP
    # connection and a silent fallback would reset a different database.
    echo "PGHOST is set but psql is not installed." >&2
    exit 1
  fi
  PSQL=(psql)
elif docker info >/dev/null 2>&1; then
  PSQL=(docker exec -i "$CONTAINER" psql -U postgres -d postgres)
elif sudo -n docker info >/dev/null 2>&1; then
  PSQL=(sudo -n docker exec -i "$CONTAINER" psql -U postgres -d postgres)
else
  echo "Cannot reach the Docker daemon, and PGHOST is not set." >&2
  exit 1
fi

"${PSQL[@]}" -v ON_ERROR_STOP=1 -q <<'SQL'
drop schema if exists public cascade;
create schema public;
drop schema if exists auth cascade;
drop schema if exists extensions cascade;
SQL

echo "Database reset."

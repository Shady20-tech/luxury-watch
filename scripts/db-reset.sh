#!/usr/bin/env bash
# =============================================================================
# Drop everything and re-apply the shim, so `db-verify.sh` always starts from a
# clean database. Proves the migrations work from scratch, not only on top of a
# database a previous run already prepared.
#
# Usage:  scripts/db-reset.sh [container-name]
# =============================================================================
set -uo pipefail

CONTAINER="${1:-lw-pg-test}"

if docker info >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo -n docker info >/dev/null 2>&1; then
  DOCKER=(sudo -n docker)
else
  echo "Cannot reach the Docker daemon." >&2
  exit 1
fi

"${DOCKER[@]}" exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q <<'SQL'
drop schema if exists public cascade;
create schema public;
drop schema if exists auth cascade;
drop schema if exists extensions cascade;
SQL

echo "Database reset."

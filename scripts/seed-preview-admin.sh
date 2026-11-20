#!/usr/bin/env bash
# =============================================================================
# Seed a staff account the local preview can sign in as.
#
# `npm run preview` runs an auth stub (scripts/dev-auth-stub.mjs) that verifies a
# password against `auth.users.encrypted_password` with Postgres' `crypt()`. This
# script creates that row, a profile, and the role grant the admin area checks,
# so a signed-in session can be obtained through the real sign-in form.
#
# The account is a SUPER_ADMIN so every admin surface is reachable. It exists
# only in the local verification database and is never part of a migration or the
# seed, which must not ship an account with a known password.
#
# Usage:
#   scripts/seed-preview-admin.sh                 # default address
#   scripts/seed-preview-admin.sh me@example.test # choose the address
#
# Then sign in at /login with the password printed at the end.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

EMAIL="${1:-admin@preview.test}"
PASSWORD="${LW_PREVIEW_ADMIN_PASSWORD:-preview-admin-password}"

PG_HOST="${PGHOST:-127.0.0.1}"
PG_PORT="${PGPORT:-55432}"
PG_PASSWORD="${PGPASSWORD:-postgres}"

psql_run() {
  PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U postgres \
    -d postgres -v ON_ERROR_STOP=1 -q "$@"
}

if ! PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U postgres \
       -d postgres -tAc 'select 1' >/dev/null 2>&1; then
  echo "No Postgres at $PG_HOST:$PG_PORT. Start it and run ./scripts/db-verify.sh first." >&2
  exit 1
fi

# `crypt(password, gen_salt('bf'))` is bcrypt, which is what GoTrue stores, so
# the stub's comparison is the same one production performs. pgcrypto lives in
# the `extensions` schema, as it does on Supabase, so the calls are qualified.
psql_run <<SQL
insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
values (
  'a0000000-0000-4000-8000-00000000ad11',
  '${EMAIL}',
  extensions.crypt('${PASSWORD}', extensions.gen_salt('bf')),
  '{"full_name":"Preview Admin"}'::jsonb
)
on conflict (email) do update
  set encrypted_password = excluded.encrypted_password;

insert into public.profiles (id, email, full_name)
select id, email, 'Preview Admin' from auth.users where email = '${EMAIL}'
on conflict (id) do update set email = excluded.email;

insert into public.user_roles (user_id, role)
select id, 'SUPER_ADMIN'::public.staff_role from auth.users where email = '${EMAIL}'
on conflict (user_id, role) do nothing;
SQL

if [ $? -ne 0 ]; then
  echo "Seeding failed." >&2
  exit 1
fi

cat <<INFO

Preview staff account ready.

  Email:    ${EMAIL}
  Password: ${PASSWORD}
  Role:     SUPER_ADMIN

Start the preview with:  npm run preview
Sign in at:              /login

This account lives only in the local verification database. It is not in the
seed and not in any migration, so it cannot reach a deployed project.
INFO

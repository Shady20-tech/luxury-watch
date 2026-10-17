-- =============================================================================
-- Supabase environment shim — TEST HARNESS ONLY
--
-- A plain Postgres server has none of the primitives a Supabase database
-- provides. This file creates the minimum needed to apply the real migrations
-- and exercise RLS exactly as Supabase would:
--
--   * the anon / authenticated / service_role / authenticator roles
--   * the `auth` schema with a users table
--   * auth.uid() and auth.role() / auth.jwt(), reading the JWT claims that
--     PostgREST sets per request
--
-- This is NOT a migration. It is never applied to a Supabase project, which
-- already has all of it. It exists so `npm run db:verify` can prove the
-- migrations and policies behave correctly on a real Postgres server.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Roles
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password 'postgres';
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;

-- -----------------------------------------------------------------------------
-- Schemas
-- -----------------------------------------------------------------------------

create schema if not exists auth;
create schema if not exists extensions;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- auth.users — the identity source
--
-- Only the columns the migrations actually reference are modelled. Supabase's
-- real table has many more; none of them are used by our schema.
-- -----------------------------------------------------------------------------

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  encrypted_password  text,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- auth.uid() / auth.role() / auth.jwt()
--
-- PostgREST sets `request.jwt.claims` for the duration of a request. These
-- helpers read from it, which is what lets the test suite impersonate an
-- anonymous visitor, a customer or an administrator simply by setting the claim.
-- -----------------------------------------------------------------------------

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    current_setting('request.jwt.claim.role', true),
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role')
  );
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb
  );
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- The API roles never touch auth.users through the API in this application; the
-- service role is granted access only so the test suite can create identities.
grant all on auth.users to service_role;

-- -----------------------------------------------------------------------------
-- Default privileges
--
-- Mirrors Supabase: tables created in `public` are usable by the API roles, and
-- RLS is what restricts them. Without this, every query would fail with a
-- permission error instead of being filtered by a policy, and the RLS tests
-- would pass for the wrong reason.
-- -----------------------------------------------------------------------------

alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

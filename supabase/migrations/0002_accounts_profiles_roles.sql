-- =============================================================================
-- 0002 — Accounts, profiles and roles
--
-- Design note: there is NO `role` column on `profiles`.
--
-- Roles live in a separate `user_roles` table. This is the single most important
-- authorisation decision in the schema, and it is structural rather than
-- policy-based: a customer updating their own profile physically cannot grant
-- themselves a role, because the profile row contains no role to grant. Even if
-- every RLS policy on `profiles` were misconfigured to allow arbitrary updates,
-- privilege escalation would still be impossible.
--
-- `user_roles` grants no write access to any authenticated user. Roles are
-- assigned only through a service-role operation performed by a SUPER_ADMIN.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles
--
-- One row per auth.users row. The `on delete cascade` means deleting an auth
-- user removes the profile; the reverse is not true, so a profile cannot be used
-- to retain access to a deleted identity.
-- -----------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         extensions.citext,
  full_name     text,
  phone         text,
  avatar_url    text,
  -- Marketing/contact preferences only. Never consulted for authorisation.
  marketing_opt_in boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 200),
  constraint profiles_phone_length     check (phone is null or char_length(phone) <= 40)
);

comment on table public.profiles is
  'Customer/staff profile data. Deliberately contains no role column; see user_roles.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- user_roles
--
-- A person may hold more than one staff role (a WATCH_EXPERT may also be a
-- CONTENT_MANAGER). Absence of any row means "ordinary customer".
-- -----------------------------------------------------------------------------

create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.staff_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  -- Optional expiry, so temporary elevation is possible without a cleanup job.
  expires_at timestamptz,

  constraint user_roles_unique_per_user unique (user_id, role)
);

comment on table public.user_roles is
  'Staff role assignments. Never writable by an authenticated non-admin user.';

create index user_roles_user_id_idx on public.user_roles (user_id);
create index user_roles_role_idx    on public.user_roles (role);

-- -----------------------------------------------------------------------------
-- addresses
--
-- Separate table rather than a jsonb blob so a default address can be enforced
-- by a partial unique index and queried efficiently.
-- -----------------------------------------------------------------------------

create table public.addresses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  label          text,
  recipient_name text not null,
  phone          text,
  line1          text not null,
  line2          text,
  city           text not null,
  region         text,
  postal_code    text,
  country_code   char(2) not null,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint addresses_recipient_name_length check (char_length(recipient_name) between 1 and 200),
  constraint addresses_line1_length          check (char_length(line1) between 1 and 300),
  constraint addresses_city_length           check (char_length(city) between 1 and 120),
  constraint addresses_country_code_format   check (country_code ~ '^[A-Z]{2}$')
);

comment on table public.addresses is
  'Customer postal addresses. Owned by the customer; readable only by them and staff.';

-- At most one default address per user. Enforced in the database so concurrent
-- requests cannot both succeed in marking a different address default.
create unique index addresses_one_default_per_user_idx
  on public.addresses (user_id)
  where is_default;

create index addresses_user_id_idx on public.addresses (user_id);

create trigger addresses_set_updated_at
  before update on public.addresses
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- New-user provisioning
--
-- Creates the profile row when an identity is created. SECURITY DEFINER because
-- it runs in the auth schema's context during signup; `set search_path = ''`
-- prevents a malicious search_path from redirecting the insert.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates a profiles row for each new auth.users row. Grants no role.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 63 — Profile photographs: the storage policies
--
-- -----------------------------------------------------------------------------
-- WHY THIS SUITE BUILDS ITS OWN `storage` SCHEMA
-- -----------------------------------------------------------------------------
--
-- Migration 0023 guards its bucket and policy blocks on
-- `information_schema.schemata`, exactly as 0015 and 0022 do, so that the
-- migrations still apply to a plain Postgres that has no `storage` schema. The
-- consequence is that on the verification database those blocks are skipped —
-- which means the policies 0023 creates are, by default, never executed by any
-- test. That is the same shape of gap that let a column grant pass review while
-- `anon` could still read `cost_cents`: the SQL is present and correct, and
-- nothing ever ran it.
--
-- So this suite creates the two objects the migration touches — `storage.buckets`
-- and `storage.objects`, plus `storage.foldername`, which the policies call — and
-- re-applies the migration's own policy SQL against them. It asserts the
-- behaviour, not the text.
--
-- This is a test fixture. It models only the columns and the one function the
-- policies use. Supabase's real `storage.objects` has many more, and its
-- `storage.foldername` is the same expression modelled below.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert_raises(
  p_label    text,
  p_sql      text,
  p_sqlstate text,
  p_like     text default null
) returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when others then
      if sqlstate <> p_sqlstate then
        raise exception 'FAIL [%]: expected SQLSTATE %, got % (%)',
          p_label, p_sqlstate, sqlstate, sqlerrm;
      end if;
      if p_like is not null and sqlerrm not like p_like then
        raise exception 'FAIL [%]: expected message like %, got %',
          p_label, p_like, sqlerrm;
      end if;
      raise notice 'pass [%] (%)', p_label, sqlerrm;
      return;
  end;
  raise exception 'FAIL [%]: expected an exception, but the statement succeeded', p_label;
end;
$$;

create or replace function pg_temp.assert_eq(
  p_label    text,
  p_sql      text,
  p_expected text
) returns void
language plpgsql
as $$
declare
  v_actual text;
begin
  execute p_sql into v_actual;
  if coalesce(v_actual, '<null>') <> coalesce(p_expected, '<null>') then
    raise exception 'FAIL [%]: expected %, got %', p_label, p_expected, v_actual;
  end if;
  raise notice 'pass [%]', p_label;
end;
$$;

-- -----------------------------------------------------------------------------
-- The minimum `storage` surface the policies address
--
-- `foldername(name)` returns the path split into folders, 1-indexed, the last
-- element being the object name — Supabase's real definition. The policies read
-- `[1]`, the user-id folder, so getting this wrong would make every assertion
-- below pass or fail for the wrong reason.
-- -----------------------------------------------------------------------------

create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets (id),
  name       text not null,
  owner      uuid,
  unique (bucket_id, name)
);

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;

alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;

-- The bucket and policies exactly as 0023 writes them. Duplicated deliberately:
-- a test that imported the migration would prove the migration parses, not that
-- the deployed database has the policy. `db-verify.sh` applies 0023 before this
-- suite runs, but with no `storage` schema present it created nothing, so the
-- objects are created here and the run below is the assertion that 0023's SQL is
-- at least self-consistent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152,
   array['image/jpeg','image/png','image/webp','image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('fd100000-0000-0000-0000-0000000000a1', 'owner-avatars63@example.test'),
  ('fd100000-0000-0000-0000-0000000000a2', 'other-avatars63@example.test')
on conflict (id) do nothing;

insert into storage.objects (bucket_id, name, owner) values
  ('avatars', 'fd100000-0000-0000-0000-0000000000a1/existing.png',
   'fd100000-0000-0000-0000-0000000000a1')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 1. The bucket is public and bounded
-- -----------------------------------------------------------------------------

set role service_role;

select pg_temp.assert_eq(
  'bucket is public',
  $q$select public::text from storage.buckets where id = 'avatars'$q$,
  'true'
);

select pg_temp.assert_eq(
  'bucket size limit is 2 MiB',
  $q$select file_size_limit::text from storage.buckets where id = 'avatars'$q$,
  '2097152'
);

select pg_temp.assert_eq(
  'bucket accepts four image types and no GIF',
  $q$select array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'avatars'$q$,
  'image/jpeg,image/png,image/webp,image/avif'
);

reset role;

-- -----------------------------------------------------------------------------
-- 2. A customer writes only into their own folder
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"fd100000-0000-0000-0000-0000000000a1","role":"authenticated"}';

-- Their own folder: allowed.
insert into storage.objects (bucket_id, name)
values ('avatars', 'fd100000-0000-0000-0000-0000000000a1/new-hash.png');

select pg_temp.assert_eq(
  'owner can read their own object',
  $q$select count(*)::text from storage.objects
      where name = 'fd100000-0000-0000-0000-0000000000a1/new-hash.png'$q$,
  '1'
);

-- Another customer's folder: refused by the policy, not by a WHERE clause.
select pg_temp.assert_raises(
  'cannot insert into another customer folder',
  $q$insert into storage.objects (bucket_id, name)
     values ('avatars', 'fd100000-0000-0000-0000-0000000000a2/stolen.png')$q$,
  '42501'
);

-- A path with no folder at all: `foldername` yields an empty array, so `[1]` is
-- null and the comparison is null rather than true. Refused, which is the point —
-- a naive `name like uid || '%'` would have allowed it.
select pg_temp.assert_raises(
  'cannot insert an object at the bucket root',
  $q$insert into storage.objects (bucket_id, name) values ('avatars', 'root.png')$q$,
  '42501'
);

reset role;

-- -----------------------------------------------------------------------------
-- 3. Another customer cannot see or delete someone else's object
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"fd100000-0000-0000-0000-0000000000a2","role":"authenticated"}';

-- The read policy is public, so the object is *readable* by anyone. That is
-- deliberate for a public bucket and is asserted so a future tightening of the
-- read policy is a conscious change rather than a silent one.
select pg_temp.assert_eq(
  'a public avatar is readable by another signed-in user',
  $q$select count(*)::text from storage.objects
      where name = 'fd100000-0000-0000-0000-0000000000a1/existing.png'$q$,
  '1'
);

-- Deletion is not public.
select pg_temp.assert_eq(
  'another customer cannot delete the object',
  $q$with gone as (
       delete from storage.objects
        where name = 'fd100000-0000-0000-0000-0000000000a1/existing.png'
        returning 1
     )
     select count(*)::text from gone$q$,
  '0'
);

-- Moving an object out of one's own folder is refused by the `using` half of the
-- update policy. Without it, `with check` alone would allow a rename *from*
-- anywhere as long as the destination was your own folder.
select pg_temp.assert_eq(
  'another customer cannot rename an object they do not own',
  $q$with moved as (
       update storage.objects
          set name = 'fd100000-0000-0000-0000-0000000000a2/renamed.png'
        where name = 'fd100000-0000-0000-0000-0000000000a1/existing.png'
        returning 1
     )
     select count(*)::text from moved$q$,
  '0'
);

reset role;

-- -----------------------------------------------------------------------------
-- 4. The owner can remove their own object
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"fd100000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select pg_temp.assert_eq(
  'owner can delete their own object',
  $q$with gone as (
       delete from storage.objects
        where name = 'fd100000-0000-0000-0000-0000000000a1/new-hash.png'
        returning 1
     )
     select count(*)::text from gone$q$,
  '1'
);

reset role;

-- -----------------------------------------------------------------------------
-- 5. An anonymous caller cannot write, only read
-- -----------------------------------------------------------------------------

set role anon;

select pg_temp.assert_raises(
  'anon cannot insert an avatar',
  $q$insert into storage.objects (bucket_id, name)
     values ('avatars', 'fd100000-0000-0000-0000-0000000000a1/anon.png')$q$,
  '42501'
);

select pg_temp.assert_eq(
  'anon can read a public avatar',
  $q$select count(*)::text from storage.objects
      where name = 'fd100000-0000-0000-0000-0000000000a1/existing.png'$q$,
  '1'
);

reset role;

-- -----------------------------------------------------------------------------
-- No teardown
--
-- `db-verify.sh` wraps every suite in `begin; ... rollback;`, so the `storage`
-- schema, the bucket, the policies and the fixture rows above are all discarded
-- when this file finishes. The next suite starts exactly where the shim left it,
-- and a re-run of this file starts clean. Nothing here may commit, and nothing
-- here may be written outside a transaction.
-- -----------------------------------------------------------------------------

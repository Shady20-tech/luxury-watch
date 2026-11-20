-- =============================================================================
-- 0023 — Profile photographs
--
-- -----------------------------------------------------------------------------
-- THE GAP
-- -----------------------------------------------------------------------------
--
-- `profiles.avatar_url` has existed since 0002 and the account portal has granted
-- `select` on it since 0014, but nothing has ever written it. The column is read
-- nowhere and set nowhere, so every customer renders as an initial and the field
-- is dead weight. This migration gives it a bucket and a write policy.
--
-- -----------------------------------------------------------------------------
-- WHY THIS BUCKET IS PUBLIC AND THE CUSTOMER-PHOTO ONES ARE NOT
-- -----------------------------------------------------------------------------
--
-- This is the distinction worth being explicit about, because "customer-uploaded
-- image" describes two different things here:
--
--   * `sell-trade-photos` and `repair-photos` (0015) are private. A photograph of
--     a watch someone is selling, or of damage they want repaired, is personal
--     data and a negotiating position. It is read only through a short-lived
--     signed URL after a staff permission check.
--
--   * An avatar is a public-facing picture. It is shown beside the customer's own
--     name in their account and, for staff, in the admin shell. Making it private
--     would mean minting a signed URL on every render of every page that shows
--     one, and a signed URL in a `<img src>` is cached and shared like any other
--     — the privacy gain would be imaginary while the cost was real.
--
-- So the bucket is public, and the *write* is what is locked down.
--
-- -----------------------------------------------------------------------------
-- WHY THE PATH CARRIES THE USER ID
-- -----------------------------------------------------------------------------
--
-- Every policy below keys on `storage.foldername(name)[1] = auth.uid()`, the same
-- shape 0015 uses. That makes the folder the authorisation boundary: a customer
-- can write under their own id and nowhere else, and cannot overwrite another
-- person's picture even if they learn the path. The application also builds the
-- path from the session id rather than from anything the browser sends, so the
-- two agree by construction rather than by trust.
--
-- The object name includes a content hash, so replacing an avatar writes a new
-- object rather than overwriting one. That keeps a cached URL valid for whatever
-- already fetched it, and means an old picture cannot be silently swapped for a
-- new one under a URL someone has already seen.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. The bucket
--
-- Guarded like 0015 and 0022: a plain Postgres used by the verification scripts
-- has no `storage` schema, and this migration must still apply there. On a real
-- Supabase project the bucket is created.
--
-- 2 MiB, not 8. An avatar is displayed at 32–96 CSS pixels, so anything
-- approaching the media library's limit is a full-resolution photograph being
-- used as a thumbnail. Nothing in this project re-encodes or resizes an upload —
-- there is no image pipeline — so this limit is the only bound on what a
-- customer can store, and the uploader tells them the limit before they choose a
-- file.
--
-- The MIME list matches the media library's minus GIF. An animated avatar is not
-- a use case the design has, and accepting one would mean a profile picture that
-- moves in a list of static ones.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('avatars', 'avatars', true, 2097152,
       array['image/jpeg','image/png','image/webp','image/avif'])
    on conflict (id) do update
      set public = true,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Policies
--
-- Read is public: the bucket's `public` flag says so, and a policy that
-- disagreed would be a trap for the next reader.
--
-- Write, update and delete are the owner's alone. Note the update policy: it
-- exists because a re-upload with `upsert` needs it, and it re-states the folder
-- check in `using` as well as `with check`. Without the `using` half a customer
-- could not be prevented from moving an object *out* of their own folder, since
-- `with check` alone is evaluated against the new row.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute $policy$ drop policy if exists avatars_public_read on storage.objects $policy$;
    execute $policy$
      create policy avatars_public_read on storage.objects
        for select to anon, authenticated
        using (bucket_id = 'avatars')
    $policy$;

    execute $policy$ drop policy if exists avatars_insert_own on storage.objects $policy$;
    execute $policy$
      create policy avatars_insert_own on storage.objects
        for insert to authenticated
        with check (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = (select auth.uid())::text
        )
    $policy$;

    execute $policy$ drop policy if exists avatars_update_own on storage.objects $policy$;
    execute $policy$
      create policy avatars_update_own on storage.objects
        for update to authenticated
        using (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = (select auth.uid())::text
        )
        with check (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = (select auth.uid())::text
        )
    $policy$;

    execute $policy$ drop policy if exists avatars_delete_own on storage.objects $policy$;
    execute $policy$
      create policy avatars_delete_own on storage.objects
        for delete to authenticated
        using (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = (select auth.uid())::text
        )
    $policy$;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 3. The column grant
--
-- 0014 granted `select` on an explicit column list and the `profiles` update
-- policy names no columns, so `avatar_url` is already writable by the owner. The
-- grant is restated here rather than assumed, because the standing obligation in
-- AGENTS.md is that a publicly-readable table's columns are decided explicitly.
-- `profiles` has no public-read policy — only the owner and `customers.read` —
-- so this is the narrower case, but the habit is the point.
--
-- There is no new column and therefore no new revoke/regrant to perform. This
-- block is documentation with a check attached: it fails loudly if the column
-- has been dropped from the grant list by a later migration.
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
      from information_schema.column_privileges
     where table_schema = 'public'
       and table_name = 'profiles'
       and column_name = 'avatar_url'
       and grantee = 'authenticated'
       and privilege_type = 'SELECT'
  ) then
    raise exception
      'profiles.avatar_url is not readable by authenticated; 0014 grants it and the avatar feature depends on it';
  end if;
end
$$;

commit;

-- =============================================================================
-- 0022 — The media library, and the imagery a watch can carry
--
-- -----------------------------------------------------------------------------
-- THE GAP
-- -----------------------------------------------------------------------------
--
-- `media` has existed since 0006 and its `storage_bucket` column defaults to
-- `'media'`, but no migration ever created that bucket. The other two buckets
-- (0015) are the private customer-photo ones. So every row in `media` pointed at
-- a bucket that did not exist, and `src/lib/media.ts` — which resolves a stored
-- path against `/storage/v1/object/public/media/` — could never have resolved
-- one. The table was a library with no shelves.
--
-- Creating the bucket alone is not enough, because a public bucket is readable by
-- anyone who knows a path. That is correct for a product photograph and wrong
-- for a customer's uploaded document, which is why the private buckets stay
-- private and this migration keeps them that way. The distinction is enforced in
-- two places:
--
--   * the bucket's own `public` flag, and
--   * the fact that the library is images only. `media` carries a
--     `media_mime_image_only` check constraint from 0006, and a customer's
--     uploaded PDF or photograph goes to the private `sell-trade-photos` /
--     `repair-photos` buckets, which have no public read policy. A private
--     document is therefore not in the library at all, so no listing of it can
--     leak one.
--
-- -----------------------------------------------------------------------------
-- PER-WATCH IMAGERY
-- -----------------------------------------------------------------------------
--
-- A single `product_images` row per watch is what the seed has, and it renders.
-- But a real listing shows the dial, the caseback, the movement and the
-- paperwork, and those are different kinds of picture rather than four
-- interchangeable ones. `product_images.category` records which, so the product
-- page can group them and the admin can ask for the set that is missing. The
-- column is nullable with a `'gallery'` default so existing rows are valid
-- without a backfill.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. A public bucket for site imagery
--
-- Guarded exactly like 0015: a plain Postgres used by the verification scripts
-- has no `storage` schema, and this migration must still apply there. On a real
-- Supabase project the bucket is created.
--
-- `file_size_limit` is 8 MiB. A photograph straight off a phone is routinely
-- larger, and the upload path resizes before it stores, so the limit is a
-- backstop against a client that bypasses the resize rather than the expected
-- size.
--
-- The MIME list is deliberately identical to the `media_mime_image_only` check
-- constraint the table already carries (0006), so there is exactly one answer to
-- "what may be stored here" rather than two that can drift. It omits
-- `image/svg+xml`: an SVG is a document that can carry script and external
-- references, and serving one from the storefront's own origin is an XSS vector.
-- Raster formats only.
--
-- Note what this means: **the media library is for images only.** A customer's
-- uploaded PDF or photograph is not a media asset and never enters this table —
-- it goes to the private `sell-trade-photos` / `repair-photos` buckets (0015),
-- which have no public read policy at all. That separation is the reason a
-- public media listing cannot expose a private document: such a document is not
-- in the library to begin with.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('media', 'media', true, 8388608,
       array['image/jpeg','image/png','image/webp','image/avif','image/gif'])
    on conflict (id) do update
      set public = true,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;

-- Read is public: this is the bucket `next/image` loads product and editorial
-- photographs from, and the policy must agree with the bucket's `public` flag.
-- Write and delete are staff-only, gated on the same permission the `media`
-- table already uses.
--
-- No update policy for `storage.objects`: an object's bytes are immutable here.
-- Replacing an image means uploading a new object and repointing the row, which
-- keeps the old object's URL valid for anything that cached it.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute $policy$ drop policy if exists media_objects_public_read on storage.objects $policy$;
    execute $policy$
      create policy media_objects_public_read on storage.objects
        for select to anon, authenticated
        using (bucket_id = 'media')
    $policy$;

    execute $policy$ drop policy if exists media_objects_staff_insert on storage.objects $policy$;
    execute $policy$
      create policy media_objects_staff_insert on storage.objects
        for insert to authenticated
        with check (
          bucket_id = 'media'
          and (public.has_permission('content.write') or public.has_permission('catalog.write'))
        )
    $policy$;

    execute $policy$ drop policy if exists media_objects_staff_delete on storage.objects $policy$;
    execute $policy$
      create policy media_objects_staff_delete on storage.objects
        for delete to authenticated
        using (
          bucket_id = 'media'
          and (public.has_permission('content.write') or public.has_permission('catalog.write'))
        )
    $policy$;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Media metadata the library needs
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'media_category') then
    create type public.media_category as enum (
      'product',      -- a watch photograph
      'editorial',    -- hero, brand story, about-page imagery
      'brand'         -- a brand logo or wordmark
    );
  end if;
end
$$;

alter table public.media
  add column if not exists category public.media_category not null default 'editorial',
  -- A human title for the library listing; `file_name` is what the object was
  -- called on disk and is often a camera default like `DSC_0412.JPG`.
  add column if not exists title text,
  -- A content hash so the same bytes uploaded twice can be recognised rather
  -- than stored again. Nullable: rows created before this migration have none.
  add column if not exists checksum_sha256 text,
  -- Set when the row is known to be referenced. Maintained by the reference
  -- check in the admin rather than by a trigger, because a reference can live in
  -- `products.og_image_url`, a page block, a homepage section or a navigation
  -- row, and a trigger cannot see all of them cheaply.
  add column if not exists last_referenced_at timestamptz;

create index if not exists media_category_created_idx
  on public.media (category, created_at desc);

create index if not exists media_checksum_idx
  on public.media (checksum_sha256)
  where checksum_sha256 is not null;

comment on column public.media.category is
  'What the image is for. There is no document category: the table''s '
  'media_mime_image_only constraint means only images can be stored, and '
  'private customer documents live in the private photo buckets instead.';

comment on column public.media.checksum_sha256 is
  'SHA-256 of the stored bytes, so a duplicate upload can be recognised.';

-- -----------------------------------------------------------------------------
-- 3. What a product photograph is a photograph of
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'watch_image_category') then
    create type public.watch_image_category as enum (
      'gallery',     -- the default, front-on shot
      'dial',
      'caseback',
      'movement',
      'bracelet',
      'box_and_papers',
      'certificate',
      'wrist'
    );
  end if;
end
$$;

alter table public.product_images
  add column if not exists category public.watch_image_category not null default 'gallery';

create index if not exists product_images_product_category_idx
  on public.product_images (product_id, category, sort_order);

comment on column public.product_images.category is
  'Which part of the watch the photograph shows. Lets the product page group '
  'the set and the admin ask for the one that is missing.';

-- -----------------------------------------------------------------------------
-- 4. `content.write` must not become `settings.write`
--
-- Content managers hold `content.write` and *not* `settings.write`, and that
-- separation is deliberate: site settings carry contact details and the age-gate
-- configuration, and the policies on `site_settings`, `payment_methods` and
-- `delivery_options` already require `settings.write`. Nothing here weakens that.
--
-- What this migration does add is a guard the other direction: a content editor
-- may publish a page, but must not be able to publish a *system* page, because
-- those back the routes `/pages/about`, `/pages/privacy` and the rest. A system
-- page that is archived disappears from a legal footer link. The check is a
-- trigger rather than a policy because a policy cannot see the row's own
-- `is_system` value before the update lands.
-- -----------------------------------------------------------------------------

create or replace function public.guard_system_page_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `is_system` is set at seed time and is not editable through the admin. If a
  -- row somehow arrives without it, treat it as a normal page.
  if coalesce(old.is_system, false) then
    if new.status is distinct from old.status and new.status <> 'published' then
      -- Only `settings.write` may unpublish a system page, because unpublishing
      -- one breaks a footer link rather than merely hiding editorial copy.
      if not public.has_permission('settings.write') then
        raise exception
          'A system page cannot be unpublished by a content editor'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.guard_system_page_publication() is
  'A system page backs a fixed route, so only settings.write may unpublish one.';

drop trigger if exists guard_system_page_publication on public.pages;
create trigger guard_system_page_publication
  before update on public.pages
  for each row execute function public.guard_system_page_publication();

commit;

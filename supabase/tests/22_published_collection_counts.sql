-- =============================================================================
-- 22 — Published totals per collection (migration 0017)
--
-- -----------------------------------------------------------------------------
-- WHY THIS SUITE EXISTS
-- -----------------------------------------------------------------------------
--
-- `published_collection_counts()` is `security definer`, so it bypasses RLS.
-- That is what makes it cheap and what makes it dangerous: the publication gate
-- is no longer enforced by a policy on the caller's behalf, it is a `where`
-- clause in the function body. Delete that clause and every other suite still
-- passes — the function would simply start counting drafts, and the collections
-- index badge, the sitemap and the collection page's `noindex` decision would
-- all silently agree on a wrong number.
--
-- So this suite asserts the gate directly, in both directions:
--
--   1. A published piece in an active collection IS counted.
--   2. A draft in the same collection is NOT counted.
--   3. A published piece in an INACTIVE collection is not counted, because the
--      collection is not a public destination at all.
--   4. A collection with nothing published is absent from the result rather than
--      returned as zero — the callers' `?? 0` handles it, and the sitemap relies
--      on the absence to decide what to list.
--
-- It also proves `anon` may call it, which is the grant that makes the sitemap
-- work without a session.
-- =============================================================================

\set ON_ERROR_STOP on

set role service_role;

-- Fixtures. The `pcc-` prefix keeps these clear of the seed and of 16/19.
insert into public.brands (id, name, slug, is_active)
values ('f0000000-0000-4000-8000-000000000001', 'Pcc Brand', 'pcc-brand', true)
on conflict (slug) do update set is_active = excluded.is_active;

insert into public.collections (id, title, slug, is_active)
values
  ('f0000000-0000-4000-8000-000000000011', 'Pcc Active',   'pcc-active',   true),
  ('f0000000-0000-4000-8000-000000000012', 'Pcc Inactive', 'pcc-inactive', false),
  ('f0000000-0000-4000-8000-000000000013', 'Pcc Empty',    'pcc-empty',    true)
on conflict (slug) do update set is_active = excluded.is_active;

insert into public.products (id, sku, slug, title, brand_id, status, published_at, price_cents, price_on_request)
values
  ('f0000000-0000-4000-8000-000000000101', 'PCC-PUB', 'pcc-published', 'Pcc Published', 'f0000000-0000-4000-8000-000000000001', 'published', now(), 100000, false),
  ('f0000000-0000-4000-8000-000000000102', 'PCC-DRF', 'pcc-draft',     'Pcc Draft',     'f0000000-0000-4000-8000-000000000001', 'draft',     null,  100000, false)
on conflict (id) do nothing;

insert into public.collection_products (collection_id, product_id, sort_order)
values
  -- Published piece in the active collection: counted.
  ('f0000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000101', 0),
  -- Draft in the same collection: must not be counted.
  ('f0000000-0000-4000-8000-000000000011', 'f0000000-0000-4000-8000-000000000102', 1),
  -- Published piece in an inactive collection: the collection is not public.
  ('f0000000-0000-4000-8000-000000000012', 'f0000000-0000-4000-8000-000000000101', 0)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 1. The active collection counts exactly its published piece.
-- -----------------------------------------------------------------------------
do $$
declare v_count bigint;
begin
  select product_count into v_count
    from public.published_collection_counts()
   where collection_id = 'f0000000-0000-4000-8000-000000000011';

  if v_count is distinct from 1 then
    raise exception 'FAIL: active collection counted % published piece(s), expected 1', v_count;
  end if;
  raise notice 'pass [counts: only published pieces are counted]';
end $$;

-- -----------------------------------------------------------------------------
-- 2. The inactive collection is absent, not zero.
-- -----------------------------------------------------------------------------
do $$
declare v_count bigint;
begin
  select product_count into v_count
    from public.published_collection_counts()
   where collection_id = 'f0000000-0000-4000-8000-000000000012';

  if v_count is not null then
    raise exception 'FAIL: inactive collection appeared with count %', v_count;
  end if;
  raise notice 'pass [counts: an inactive collection is absent]';
end $$;

-- -----------------------------------------------------------------------------
-- 3. An active collection with nothing published is absent.
-- -----------------------------------------------------------------------------
do $$
declare v_count bigint;
begin
  select product_count into v_count
    from public.published_collection_counts()
   where collection_id = 'f0000000-0000-4000-8000-000000000013';

  if v_count is not null then
    raise exception 'FAIL: empty collection appeared with count %', v_count;
  end if;
  raise notice 'pass [counts: an empty collection is absent]';
end $$;

-- -----------------------------------------------------------------------------
-- 4. `anon` may call it, and sees the same numbers.
--
-- The sitemap runs without a session, so the grant is what makes it work. It
-- must not need a privileged key for a count of public rows.
-- -----------------------------------------------------------------------------
set role anon;

do $$
declare v_count bigint;
begin
  select product_count into v_count
    from public.published_collection_counts()
   where collection_id = 'f0000000-0000-4000-8000-000000000011';

  if v_count is distinct from 1 then
    raise exception 'FAIL: anon saw % for the active collection, expected 1', v_count;
  end if;
  raise notice 'pass [counts: anon can read the aggregate]';
end $$;

set role service_role;

-- -----------------------------------------------------------------------------
-- Cleanup, so a database that has run this suite still shows the seed counts.
-- -----------------------------------------------------------------------------
delete from public.collection_products
 where collection_id in (
   'f0000000-0000-4000-8000-000000000011',
   'f0000000-0000-4000-8000-000000000012',
   'f0000000-0000-4000-8000-000000000013'
 );

delete from public.products
 where id in (
   'f0000000-0000-4000-8000-000000000101',
   'f0000000-0000-4000-8000-000000000102'
 );

delete from public.collections
 where id in (
   'f0000000-0000-4000-8000-000000000011',
   'f0000000-0000-4000-8000-000000000012',
   'f0000000-0000-4000-8000-000000000013'
 );

delete from public.brands where id = 'f0000000-0000-4000-8000-000000000001';

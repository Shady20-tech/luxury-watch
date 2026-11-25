-- =============================================================================
-- 35 — Catalogue sort order (migration 0034)
--
-- -----------------------------------------------------------------------------
-- THE DEFECT THIS PINS
-- -----------------------------------------------------------------------------
--
-- `catalogue_search` builds a single `row_number()` ordering that switches on
-- `p_sort`. Its featured branch applies whenever the sort is not one of the
-- explicit orderings:
--
--     case when p_sort not in ('price_asc','price_desc','oldest','title_asc',
--                              'title_desc','reference_asc')
--          then f.is_featured end desc,
--     case when p_sort not in (...) then f.sort_order end asc,
--     f.published_at desc nulls last,
--
-- `'newest'` was missing from that list, so "Newest first" fell into the
-- featured branch and `sort_order asc` — which is unique per product — decided
-- the order before `published_at desc` was ever reached. Newest returned oldest.
--
-- -----------------------------------------------------------------------------
-- WHY THIS SUITE HAS TO CONTROL BOTH COLUMNS
-- -----------------------------------------------------------------------------
--
-- The seed sets `sort_order` in publication order, so on seed data the broken
-- ordering and the correct one produce the SAME result. A test written against
-- the seed would have passed throughout the defect's life. This suite therefore
-- creates fixtures whose `sort_order` deliberately *contradicts* `published_at`:
-- the oldest piece gets the highest `sort_order`. A sort that consults
-- `sort_order` first will order them one way; a sort that consults
-- `published_at` will order them the other. Only a deliberate contradiction can
-- tell the two apart.
--
-- -----------------------------------------------------------------------------
-- AND WHY IT CHECKS BOTH DIRECTIONS
-- -----------------------------------------------------------------------------
--
-- Asserting only "newest returns the newest" would pass on a function that
-- ignored the sort entirely and always returned `published_at desc`. Checking
-- `oldest` as well — against the same fixtures — pins that the direction is
-- actually honoured.
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- Fixtures. `SORT-` slugs keep these clear of the seed and of other suites.
-- `sort_order` ascends WITH `published_at`: the oldest piece has the lowest
-- manual order. That is the arrangement the seed itself has, and it is what makes
-- the defect visible — a sort that consults `sort_order` first returns the OLDEST
-- piece for "Newest first", while one that consults `published_at` returns the
-- newest. (An earlier draft of this fixture set `sort_order` in reverse, which
-- made the broken and correct orderings agree and the suite pass against the
-- defect. The contradiction only bites in this direction.)
-- -----------------------------------------------------------------------------
set role service_role;

insert into public.brands (id, name, slug, is_active)
values ('f0000000-0000-4000-8000-000000000001', 'Sort Brand', 'sort-brand', true)
on conflict (slug) do update set is_active = excluded.is_active;

insert into public.models (id, brand_id, name, slug, is_active)
values (
  'f0000000-0000-4000-8000-000000000002',
  'f0000000-0000-4000-8000-000000000001',
  'Sort Model', 'sort-model', true
)
on conflict (id) do update set is_active = excluded.is_active;

-- Three published pieces. sort_order 100/200/300 follows published_at
-- 2020/2022/2024, so a `sort_order asc` term ahead of `published_at desc` decides
-- the order and inverts it.
insert into public.products (
  id, brand_id, model_id, slug, sku, title, reference_number, status,
  published_at, sort_order, price_on_request
)
values
  ('f0000000-0000-4000-8000-000000000011',
   'f0000000-0000-4000-8000-000000000001',
   'f0000000-0000-4000-8000-000000000002',
   'sort-oldest', 'SORT-SKU-OLD', 'Sort Oldest Piece', 'SORT-OLD', 'published',
   '2020-01-01 00:00:00+00', 100, true),
  ('f0000000-0000-4000-8000-000000000012',
   'f0000000-0000-4000-8000-000000000001',
   'f0000000-0000-4000-8000-000000000002',
   'sort-middle', 'SORT-SKU-MID', 'Sort Middle Piece', 'SORT-MID', 'published',
   '2022-01-01 00:00:00+00', 200, true),
  ('f0000000-0000-4000-8000-000000000013',
   'f0000000-0000-4000-8000-000000000001',
   'f0000000-0000-4000-8000-000000000002',
   'sort-newest', 'SORT-SKU-NEW', 'Sort Newest Piece', 'SORT-NEW', 'published',
   '2024-01-01 00:00:00+00', 300, true)
on conflict (id) do update set
  status = excluded.status,
  published_at = excluded.published_at,
  sort_order = excluded.sort_order;

reset role;

-- -----------------------------------------------------------------------------
-- 1. "Newest first" orders by publication date, not by the manual order
-- -----------------------------------------------------------------------------
set role anon;
do $$
declare
  v_slugs text[];
begin
  select array_agg(slug) into v_slugs
    from public.catalogue_search(p_scope => 'brand', p_scope_slug => 'sort-brand', p_sort => 'newest', p_limit => 50);

  if v_slugs is null or array_length(v_slugs, 1) <> 3 then
    raise exception 'FAIL: expected 3 pieces from the sort fixture, got %', v_slugs;
  end if;

  -- The whole point: sort-newest must lead even though it has the HIGHEST
  -- sort_order. A function that consults sort_order first returns sort-oldest.
  if v_slugs[1] <> 'sort-newest' or v_slugs[3] <> 'sort-oldest' then
    raise exception 'FAIL: newest-first returned % (expected sort-newest first, sort-oldest last)', v_slugs;
  end if;

  raise notice 'pass [sort: newest-first honours published_at, not the manual order]';
end $$;

-- -----------------------------------------------------------------------------
-- 2. "Oldest first" is the exact reverse — the direction is honoured
-- -----------------------------------------------------------------------------
do $$
declare
  v_slugs text[];
begin
  select array_agg(slug) into v_slugs
    from public.catalogue_search(p_scope => 'brand', p_scope_slug => 'sort-brand', p_sort => 'oldest', p_limit => 50);

  if v_slugs is null or array_length(v_slugs, 1) <> 3 then
    raise exception 'FAIL: expected 3 pieces from the sort fixture, got %', v_slugs;
  end if;

  if v_slugs[1] <> 'sort-oldest' or v_slugs[3] <> 'sort-newest' then
    raise exception 'FAIL: oldest-first returned % (expected sort-oldest first, sort-newest last)', v_slugs;
  end if;

  raise notice 'pass [sort: oldest-first is the exact reverse]';
end $$;

-- -----------------------------------------------------------------------------
-- 3. Featured keeps the editor's manual order
-- -----------------------------------------------------------------------------
-- The fix must not drag `featured` into date order: `sort_order` is the one
-- ordering an editor controls directly, and it is what "featured" means.
do $$
declare
  v_slugs text[];
begin
  select array_agg(slug) into v_slugs
    from public.catalogue_search(p_scope => 'brand', p_scope_slug => 'sort-brand', p_sort => 'featured', p_limit => 50);

  if v_slugs is null or array_length(v_slugs, 1) <> 3 then
    raise exception 'FAIL: expected 3 pieces from the sort fixture, got %', v_slugs;
  end if;

  -- sort_order ascends oldest → newest, matching published_at.
  if v_slugs[1] <> 'sort-oldest' or v_slugs[3] <> 'sort-newest' then
    raise exception 'FAIL: featured did not follow the manual order (%)', v_slugs;
  end if;

  raise notice 'pass [sort: featured still follows the manual order]';
end $$;
reset role;

-- -----------------------------------------------------------------------------
-- Clean up so a later suite (or a re-run) does not see these rows.
-- -----------------------------------------------------------------------------
set role service_role;
delete from public.products where id in (
  'f0000000-0000-4000-8000-000000000011',
  'f0000000-0000-4000-8000-000000000012',
  'f0000000-0000-4000-8000-000000000013'
);
delete from public.models where id = 'f0000000-0000-4000-8000-000000000002';
delete from public.brands where id = 'f0000000-0000-4000-8000-000000000001';
reset role;

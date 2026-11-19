-- =============================================================================
-- 19 — Catalogue search across collections (migration 0016)
--
-- -----------------------------------------------------------------------------
-- THE DEFECT THIS PINS
-- -----------------------------------------------------------------------------
--
-- `catalogue_suggest` returned collection hits, but `catalogue_filtered` — which
-- the results grid reads — searched only product fields plus brand and model
-- names. Following a collection suggestion therefore ran a search that matched
-- nothing: the typeahead promised a result set the search could not produce.
--
-- The suite proves three things, in the order they matter:
--
--   1. A collection title IS now searchable, and returns the published pieces
--      in that collection.
--   2. The publication gate still holds through the new join — a draft in the
--      same collection must not appear.
--   3. An INACTIVE collection is not searchable, and its pieces are not
--      returned by its title. `catalogue_filtered` is `security definer`, so the
--      `is_active` clause is the only thing standing between an unpublished
--      collection and a searchable oracle. Without this assertion the clause
--      could be deleted and every other suite would still pass.
--
-- Group 3 is the reason this file exists separately from 16: 16 already proves
-- the gate for products, brands, models and collections-as-scope, but not for
-- collections-as-search-term, which is a new path into the same table.
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- Fixtures. Slugs and titles carry a `SRCH-` / `Srch ` prefix so they cannot
-- collide with the seed catalogue or with 16's `cat-` fixtures.
-- -----------------------------------------------------------------------------
set role service_role;

insert into public.brands (id, name, slug, is_active)
values ('e0000000-0000-4000-8000-000000000001', 'Srch Brand', 'srch-brand', true)
on conflict (slug) do update set is_active = excluded.is_active;

insert into public.collections (id, title, slug, is_active)
values
  ('e0000000-0000-4000-8000-000000000011', 'Srch Perpetual Calendar', 'srch-perpetual-calendar', true),
  ('e0000000-0000-4000-8000-000000000012', 'Srch Hidden Vault',       'srch-hidden-vault',       false)
on conflict (slug) do update set is_active = excluded.is_active, title = excluded.title;

insert into public.products
  (sku, slug, title, brand_id, status, published_at, price_cents, price_on_request,
   condition, production_year, case_size_mm, case_material, movement, dial_color, bracelet_material)
values
  -- Published, in the ACTIVE collection. Must be found by the collection title.
  ('SRCH-1', 'srch-published', 'Srch Published Piece',
   'e0000000-0000-4000-8000-000000000001', 'published', now() - interval '3 days',
   300000, false, 'unworn', 2023, 39, 'Srch Steel', 'Automatic', 'Silver', 'Steel bracelet'),
  -- DRAFT, in the ACTIVE collection. Must NOT be found.
  ('SRCH-2', 'srch-draft', 'Srch Draft Piece',
   'e0000000-0000-4000-8000-000000000001', 'draft', null,
   350000, false, 'unworn', 2023, 39, 'Srch Steel', 'Automatic', 'Silver', 'Steel bracelet'),
  -- Published, in the INACTIVE collection only. Must NOT be found by that
  -- collection's title.
  ('SRCH-3', 'srch-in-inactive-collection', 'Srch Vault Piece',
   'e0000000-0000-4000-8000-000000000001', 'published', now() - interval '2 days',
   400000, false, 'unworn', 2023, 39, 'Srch Steel', 'Automatic', 'Silver', 'Steel bracelet')
on conflict (slug) do update
  set status = excluded.status,
      published_at = excluded.published_at;

insert into public.collection_products (collection_id, product_id, sort_order)
select 'e0000000-0000-4000-8000-000000000011', p.id, 1
  from public.products p where p.slug in ('srch-published', 'srch-draft')
on conflict do nothing;

insert into public.collection_products (collection_id, product_id, sort_order)
select 'e0000000-0000-4000-8000-000000000012', p.id, 1
  from public.products p where p.slug = 'srch-in-inactive-collection'
on conflict do nothing;

reset role;

-- -----------------------------------------------------------------------------
-- 1. An active collection's title is searchable
-- -----------------------------------------------------------------------------
set role anon;
do $$
declare
  v_slugs text[];
begin
  select array_agg(slug order by slug) into v_slugs
    from public.catalogue_search(p_scope => 'all', p_query => 'perpetual calendar', p_limit => 50);

  if v_slugs is null then
    raise exception 'FAIL: searching an active collection title returned nothing';
  end if;

  if not ('srch-published' = any (v_slugs)) then
    raise exception 'FAIL: the published piece in the matching collection was not returned (%)', v_slugs;
  end if;

  raise notice 'pass [search: an active collection title finds its published pieces]';
end
$$;

-- -----------------------------------------------------------------------------
-- 2. The publication gate survives the new join
-- -----------------------------------------------------------------------------
do $$
declare
  v_leak bigint;
begin
  select count(*) into v_leak
    from public.catalogue_search(p_scope => 'all', p_query => 'perpetual calendar', p_limit => 50)
   where slug = 'srch-draft';

  if v_leak <> 0 then
    raise exception 'FAIL: a draft product in the matching collection appeared in results';
  end if;

  raise notice 'pass [gate: a draft in the matching collection stays hidden]';
end
$$;

-- -----------------------------------------------------------------------------
-- 3. An inactive collection is not searchable
--
-- Both directions are asserted: the title must not match its pieces, and the
-- title must not appear as a suggestion. Either alone would let the other leak.
-- -----------------------------------------------------------------------------
do $$
declare
  v_hits bigint;
  v_suggested bigint;
begin
  select count(*) into v_hits
    from public.catalogue_search(p_scope => 'all', p_query => 'hidden vault', p_limit => 50);

  if v_hits <> 0 then
    raise exception 'FAIL: an inactive collection title matched % product(s)', v_hits;
  end if;

  select count(*) into v_suggested
    from public.catalogue_suggest(p_query => 'hidden vault', p_limit => 12)
   where href like '%srch-hidden-vault%';

  if v_suggested <> 0 then
    raise exception 'FAIL: an inactive collection was suggested';
  end if;

  raise notice 'pass [gate: an inactive collection is neither searchable nor suggested]';
end
$$;
reset role;

-- -----------------------------------------------------------------------------
-- 4. The suggestion detail agrees with the published count
--
-- The brand page prints the count of published pieces. A suggestion that said
-- "3 pieces" while the page listed two would be the same class of lie as a price
-- the catalogue does not hold.
--
-- The expected value is computed from the table rather than written into the
-- assertion. The first draft of this test hardcoded "1 watch" and failed,
-- because the brand has two published pieces (one of them in the inactive
-- collection, which the brand page still shows). A hardcoded number asserts what
-- the fixture happens to contain; computing it asserts the invariant, which is
-- that the two surfaces agree.
-- -----------------------------------------------------------------------------
set role anon;
do $$
declare
  v_detail    text;
  v_expected  bigint;
  v_expected_text text;
begin
  select count(*) into v_expected
    from public.products p
    join public.brands b on b.id = p.brand_id
   where b.slug = 'srch-brand'
     and p.status = 'published';

  v_expected_text := case v_expected
                       when 1 then '1 watch'
                       else v_expected::text || ' watches'
                     end;

  select detail into v_detail
    from public.catalogue_suggest(p_query => 'Srch Brand', p_limit => 12)
   where kind = 'brand' and label = 'Srch Brand';

  if v_detail is distinct from v_expected_text then
    raise exception 'FAIL: the brand suggestion reported %, expected % for % published piece(s)',
      coalesce(v_detail, 'null'), v_expected_text, v_expected;
  end if;

  raise notice 'pass [suggest: the brand detail equals the published count and names them watches]';
end
$$;
reset role;

-- -----------------------------------------------------------------------------
-- 5. Clean up so later suites see the catalogue they expect
-- -----------------------------------------------------------------------------
set role service_role;
delete from public.collection_products
 where collection_id in ('e0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000012');
delete from public.inventory
 where product_id in (select id from public.products where sku like 'SRCH-%');
delete from public.products where sku like 'SRCH-%';
delete from public.collections
 where id in ('e0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000012');
delete from public.brands where id = 'e0000000-0000-4000-8000-000000000001';
reset role;

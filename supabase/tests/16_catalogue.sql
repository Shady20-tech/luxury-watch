-- =============================================================================
-- 16 — Catalogue browsing (migration 0010)
--
-- The catalogue functions are `security definer`, which means they bypass Row
-- Level Security. Every visibility rule the policies would have enforced has to
-- be re-applied inside the function, and this suite proves it is.
--
-- The tests fall into four groups:
--
--   1. The publication gate survives the definer boundary — a draft product must
--      not appear in results or in facet counts.
--   2. Inactive taxonomy is invisible — an inactive brand, model or collection
--      must not leak, and its products must not be reachable by scoping to it.
--   3. The filters and sorts behave, including the two that are easy to get
--      subtly wrong: the price sort with null prices, and stable pagination.
--   4. The public surface is not a way to read private columns.
--
-- Group 4 is the one that matters most. `catalogue_filtered` returns whole
-- `products` rows, so it must not be callable by `anon`; and none of the public
-- functions may return `cost_cents`.
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- Fixtures
--
-- Deliberately shaped to exercise the gate: one published product, one draft
-- with identical attributes (so a leaking filter would match it), one archived
-- product, an inactive brand with a published product, and an inactive
-- collection containing a published product.
-- -----------------------------------------------------------------------------

set role service_role;

insert into public.brands (id, name, slug, is_active)
values
  ('c0000000-0000-4000-8000-000000000001', 'Cat Brand Active',   'cat-brand-active',   true),
  ('c0000000-0000-4000-8000-000000000002', 'Cat Brand Inactive', 'cat-brand-inactive', false)
on conflict (slug) do update set is_active = excluded.is_active;

insert into public.models (id, brand_id, name, slug, is_active)
values
  ('c0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000001', 'Cat Model Active',   'cat-model-active',   true),
  ('c0000000-0000-4000-8000-000000000012', 'c0000000-0000-4000-8000-000000000001', 'Cat Model Inactive', 'cat-model-inactive', false)
on conflict (brand_id, slug) do update set is_active = excluded.is_active;

insert into public.collections (id, title, slug, is_active)
values
  ('c0000000-0000-4000-8000-000000000021', 'Cat Collection Active',   'cat-collection-active',   true),
  ('c0000000-0000-4000-8000-000000000022', 'Cat Collection Inactive', 'cat-collection-inactive', false)
on conflict (slug) do update set is_active = excluded.is_active;

insert into public.products
  (sku, slug, title, brand_id, model_id, status, published_at, price_cents, price_on_request,
   condition, production_year, case_size_mm, case_material, movement, dial_color, bracelet_material)
values
  -- Published, priced, active taxonomy. The control case.
  ('CAT-1', 'cat-published-priced', 'Cat Published Priced', 'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000011',
   'published', now() - interval '10 days', 500000, false, 'unworn', 2024, 40, 'Cat Steel', 'Automatic', 'Blue', 'Steel bracelet'),
  -- Published, price on request. Exercises the null-price sort path.
  ('CAT-2', 'cat-published-por', 'Cat Published On Request', 'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000011',
   'published', now() - interval '5 days', null, true, 'pre_owned', 2020, 42, 'Cat Gold', 'Manual', 'Black', 'Leather strap'),
  -- Draft with the SAME searchable title prefix. If the gate leaks, searching
  -- for the prefix returns this row too.
  ('CAT-3', 'cat-draft', 'Cat Published Priced Draft', 'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000011',
   'draft', null, 400000, false, 'unworn', 2024, 40, 'Cat Steel', 'Automatic', 'Blue', 'Steel bracelet'),
  -- Archived.
  ('CAT-4', 'cat-archived', 'Cat Published Priced Archived', 'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000011',
   'archived', now() - interval '2 days', 600000, false, 'unworn', 2024, 40, 'Cat Steel', 'Automatic', 'Blue', 'Steel bracelet'),
  -- Published, but under an INACTIVE brand. Scoping to that brand must be empty.
  ('CAT-5', 'cat-inactive-brand', 'Cat Inactive Brand Product', 'c0000000-0000-4000-8000-000000000002', null,
   'published', now() - interval '1 day', 700000, false, 'unworn', 2024, 40, 'Cat Steel', 'Automatic', 'Blue', 'Steel bracelet'),
  -- Published, under an ACTIVE brand but an INACTIVE model.
  ('CAT-6', 'cat-inactive-model', 'Cat Inactive Model Product', 'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000012',
   'published', now() - interval '1 day', 800000, false, 'unworn', 2024, 40, 'Cat Steel', 'Automatic', 'Blue', 'Steel bracelet')
on conflict (slug) do update
  set status = excluded.status,
      published_at = excluded.published_at,
      brand_id = excluded.brand_id,
      model_id = excluded.model_id;

-- Link the two published products into the active and the inactive collection.
insert into public.collection_products (collection_id, product_id, sort_order)
select 'c0000000-0000-4000-8000-000000000021', p.id, 1
  from public.products p where p.slug = 'cat-published-priced'
on conflict do nothing;

insert into public.collection_products (collection_id, product_id, sort_order)
select 'c0000000-0000-4000-8000-000000000022', p.id, 1
  from public.products p where p.slug = 'cat-published-por'
on conflict do nothing;

-- One product with no inventory row at all, so availability has a false case.
insert into public.inventory (product_id, quantity, reserved_quantity)
select id, 1, 0 from public.products where slug = 'cat-published-priced'
on conflict (product_id) do update set quantity = 1, reserved_quantity = 0;

reset role;

-- -----------------------------------------------------------------------------
-- 1. The publication gate
-- -----------------------------------------------------------------------------
set role anon;
do $$
declare
  v_total      bigint;
  v_draft_hits bigint;
  v_facet      jsonb;
  v_brand_n    bigint;
begin
  -- 1a. A search for a title prefix shared with a draft must not return the
  --     draft. This is the leak the definer boundary could introduce.
  select count(*) into v_draft_hits
    from public.catalogue_search(p_scope => 'all', p_query => 'cat published priced')
   where slug in ('cat-draft', 'cat-archived');
  if v_draft_hits <> 0 then
    raise exception 'FAIL: a draft or archived product appeared in search results (% rows)', v_draft_hits;
  end if;
  raise notice 'pass [gate: draft and archived products are absent from search]';

  -- 1b. Scoping to a brand must not surface that brand''s unpublished rows.
  select count(*) into v_total
    from public.catalogue_search(p_scope => 'brand', p_scope_slug => 'cat-brand-active')
   where slug in ('cat-draft', 'cat-archived');
  if v_total <> 0 then
    raise exception 'FAIL: brand scope leaked an unpublished product';
  end if;
  raise notice 'pass [gate: brand scope excludes unpublished products]';

  -- 1c. Facet counts must not include the drafts. The brand facet count for the
  --     active brand must equal the number of its PUBLISHED products, not all
  --     of them.
  v_facet := public.catalogue_facets(p_scope => 'all');
  select coalesce(sum((entry ->> 'count')::bigint), 0) into v_brand_n
    from jsonb_array_elements(v_facet -> 'brand') entry
   where entry ->> 'value' = 'cat-brand-active';

  if v_brand_n <> (
    select count(*) from public.products
     where brand_id = 'c0000000-0000-4000-8000-000000000001' and status = 'published'
  ) then
    raise exception 'FAIL: brand facet count (%) disagrees with the published count', v_brand_n;
  end if;
  raise notice 'pass [gate: facet counts exclude drafts]';

  -- 1d. The facet total must equal the search total. If they disagree, the
  --     sidebar shows a count the grid cannot deliver.
  if (v_facet ->> 'total')::bigint <> (
    select count(*) from public.catalogue_search(p_scope => 'all', p_limit => 60)
  ) then
    raise exception 'FAIL: facet total and search total disagree';
  end if;
  raise notice 'pass [gate: facet total matches the search total]';
end
$$;
reset role;

-- -----------------------------------------------------------------------------
-- 1e. Facet counts are multi-select and cross-narrowing
--
-- These two properties are in tension and both matter:
--
--   * A dimension must NOT be counted against its own filter, or selecting one
--     brand would zero every other brand and a second could never be added.
--   * A dimension MUST be counted against the other dimensions' filters, or the
--     sidebar would offer a dial colour that yields nothing once a brand is
--     selected.
--
-- The earlier implementation counted every dimension against every filter,
-- which broke the first property. This test pins both.
-- -----------------------------------------------------------------------------
set role anon;
do $$
declare
  v_counts jsonb;
  v_other  bigint;
begin
  -- 1e-i. Selecting a brand leaves the other brands with non-zero counts.
  v_counts := public.catalogue_facets(p_scope => 'all', p_brands => array['cat-brand-active']);

  select count(*) into v_other
    from jsonb_array_elements(v_counts -> 'brand') entry
   where entry ->> 'value' <> 'cat-brand-active'
     and (entry ->> 'count')::bigint = 0;
  if v_other > 0 then
    raise exception 'FAIL: selecting one brand zeroed % other brand(s); facets must stay multi-select', v_other;
  end if;
  raise notice 'pass [facets: a selected dimension does not zero its own siblings]';

  -- 1e-ii. Cross-narrowing: the model list under a brand filter must only
  --        contain models that brand actually has. `cat-model-active` belongs
  --        to `cat-brand-active`; the other brand has no models.
  if exists (
    select 1 from jsonb_array_elements(v_counts -> 'model') entry
     where entry ->> 'value' <> 'cat-model-active'
  ) then
    raise exception 'FAIL: the model facet was not narrowed by the brand filter';
  end if;
  raise notice 'pass [facets: a dimension is narrowed by the other filters]';

  -- 1e-iii. The availability filter partitions the catalogue exactly.
  if (select count(*) from public.catalogue_search(p_scope => 'all', p_availability => 'available', p_limit => 60))
     + (select count(*) from public.catalogue_search(p_scope => 'all', p_availability => 'reserved', p_limit => 60))
     <> (select count(*) from public.catalogue_search(p_scope => 'all', p_limit => 60))
  then
    raise exception 'FAIL: available + reserved <> total';
  end if;
  raise notice 'pass [facets: available and reserved partition the catalogue]';

  -- 1e-iv. The availability filter must exclude its own dimension from the
  --        count, so both options stay selectable after one is chosen.
  v_counts := public.catalogue_facets(p_scope => 'all', p_availability => 'available');
  if jsonb_array_length(v_counts -> 'availability') <> 2 then
    raise exception 'FAIL: the availability facet lost an option once one was selected';
  end if;
  raise notice 'pass [facets: availability stays a two-way choice]';
end
$$;
reset role;

-- -----------------------------------------------------------------------------
-- 2. Inactive taxonomy is invisible
-- -----------------------------------------------------------------------------
set role anon;
do $$
declare
  v_rows  bigint;
  v_facet jsonb;
begin
  -- 2a. Scoping to an inactive brand yields nothing, rather than everything.
  select count(*) into v_rows
    from public.catalogue_search(p_scope => 'brand', p_scope_slug => 'cat-brand-inactive');
  if v_rows <> 0 then
    raise exception 'FAIL: an inactive brand scope returned % product(s)', v_rows;
  end if;
  raise notice 'pass [taxonomy: inactive brand scope is empty]';

  -- 2b. Same for an inactive collection.
  select count(*) into v_rows
    from public.catalogue_search(p_scope => 'collection', p_scope_slug => 'cat-collection-inactive');
  if v_rows <> 0 then
    raise exception 'FAIL: an inactive collection scope returned % product(s)', v_rows;
  end if;
  raise notice 'pass [taxonomy: inactive collection scope is empty]';

  -- 2c. An inactive brand must not appear as a facet value, even though one of
  --     its products is published. Without the `b.is_active` clause the definer
  --     function would list a brand the site has switched off.
  v_facet := public.catalogue_facets(p_scope => 'all');
  if exists (
    select 1 from jsonb_array_elements(v_facet -> 'brand') entry
     where entry ->> 'value' = 'cat-brand-inactive'
  ) then
    raise exception 'FAIL: an inactive brand appeared in the brand facets';
  end if;
  raise notice 'pass [taxonomy: inactive brand absent from facets]';

  -- 2d. Same for an inactive model.
  if exists (
    select 1 from jsonb_array_elements(v_facet -> 'model') entry
     where entry ->> 'value' = 'cat-model-inactive'
  ) then
    raise exception 'FAIL: an inactive model appeared in the model facets';
  end if;
  raise notice 'pass [taxonomy: inactive model absent from facets]';

  -- 2e. An unknown scope slug is empty, not a silent widening to the catalogue.
  select count(*) into v_rows
    from public.catalogue_search(p_scope => 'brand', p_scope_slug => 'no-such-brand-anywhere');
  if v_rows <> 0 then
    raise exception 'FAIL: an unknown brand scope widened to the whole catalogue';
  end if;
  raise notice 'pass [taxonomy: unknown scope slug is empty]';

  -- 2f. A product under an inactive model is still a published product and is
  --     legitimately visible; only the model facet is withheld. Assert the
  --     documented behaviour rather than an accidental one.
  select count(*) into v_rows
    from public.catalogue_search(p_scope => 'all', p_query => 'cat inactive model product');
  if v_rows <> 1 then
    raise exception 'FAIL: a published product under an inactive model should still be listed (got %)', v_rows;
  end if;
  raise notice 'pass [taxonomy: published product under inactive model is still listed]';
end
$$;
reset role;

-- -----------------------------------------------------------------------------
-- 3. Filters, sorts and pagination
-- -----------------------------------------------------------------------------
set role anon;
do $$
declare
  v_priced     bigint;
  v_on_request bigint;
  v_first      text;
  v_second     text;
  v_union      bigint;
  v_pages      bigint;
begin
  -- 3a. Price mode partitions the catalogue without overlap.
  select count(*) into v_priced
    from public.catalogue_search(p_scope => 'all', p_price_mode => 'priced');
  select count(*) into v_on_request
    from public.catalogue_search(p_scope => 'all', p_price_mode => 'on_request');
  select count(*) into v_union
    from public.catalogue_search(p_scope => 'all', p_limit => 60);

  if v_priced + v_on_request <> v_union then
    raise exception 'FAIL: priced (%) + on_request (%) <> total (%)', v_priced, v_on_request, v_union;
  end if;
  raise notice 'pass [filters: priced and on_request partition the catalogue]';

  -- 3b. The price sort must not place a null price ahead of a real one.
  select title into v_first
    from public.catalogue_search(p_scope => 'brand', p_scope_slug => 'cat-brand-active',
                                 p_sort => 'price_asc', p_limit => 60)
   limit 1;
  if v_first <> 'Cat Published Priced' then
    raise exception 'FAIL: price_asc put % first; the priced product must lead', v_first;
  end if;
  raise notice 'pass [sort: price_asc puts a real price before a null one]';

  -- 3c. Pagination must be stable and lossless. Two pages of 1 must together
  --     equal two rows, with no repeat. Without a total order the same row can
  --     appear on both pages.
  select title into v_first
    from public.catalogue_search(p_scope => 'brand', p_scope_slug => 'cat-brand-active',
                                 p_sort => 'title_asc', p_limit => 1, p_offset => 0);
  select title into v_second
    from public.catalogue_search(p_scope => 'brand', p_scope_slug => 'cat-brand-active',
                                 p_sort => 'title_asc', p_limit => 1, p_offset => 1);
  if v_first = v_second then
    raise exception 'FAIL: pagination repeated a row (% on both pages)', v_first;
  end if;
  raise notice 'pass [pagination: consecutive pages do not repeat]';

  -- 3d. The total_count is the whole match count, not the page size. Otherwise
  --     the "showing 1 of 1" line would lie about a larger result set.
  select count(*) into v_pages
    from public.catalogue_search(p_scope => 'brand', p_scope_slug => 'cat-brand-active', p_limit => 1);
  if v_pages <> 1 then
    raise exception 'FAIL: p_limit => 1 returned % rows', v_pages;
  end if;
  if (select total_count from public.catalogue_search(p_scope => 'brand', p_scope_slug => 'cat-brand-active', p_limit => 1))
     <= 1 then
    raise exception 'FAIL: total_count collapsed to the page size';
  end if;
  raise notice 'pass [pagination: total_count is the full match count]';

  -- 3e. A LIKE wildcard in the search term is a literal, not a wildcard. This is
  --     what stops `%` from matching the whole catalogue.
  if (select count(*) from public.catalogue_search(p_scope => 'all', p_query => '%')) <> 0 then
    raise exception 'FAIL: a %% query matched rows; wildcards must be escaped';
  end if;
  raise notice 'pass [search: LIKE wildcards are escaped]';

  -- 3f. An unrecognised sort falls back instead of raising, so a hand-edited URL
  --     cannot break the page.
  perform count(*) from public.catalogue_search(p_scope => 'all', p_sort => 'not-a-sort');
  raise notice 'pass [sort: an unknown sort value falls back rather than raising]';
end
$$;
reset role;

-- -----------------------------------------------------------------------------
-- 4. The public surface must not read private columns
-- -----------------------------------------------------------------------------
set role anon;
do $$
declare
  v_ok boolean := false;
begin
  -- 4a. `catalogue_filtered` returns whole product rows, including cost_cents.
  --     It must NOT be executable by anon. `security definer` lets the owner
  --     call it, so withholding the grant costs nothing.
  begin
    perform * from public.catalogue_filtered(p_scope => 'all');
  exception when insufficient_privilege then
    v_ok := true;
  end;
  if not v_ok then
    raise exception 'FAIL: anon can execute catalogue_filtered(); it returns whole product rows including cost';
  end if;
  raise notice 'pass [security: anon cannot execute catalogue_filtered]';
end
$$;
reset role;

-- 4b. The public functions must not expose a cost column. Asserted against the
--     function signature itself, so adding one later fails the suite.
do $$
begin
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral unnest(p.proargnames) as name
     where n.nspname = 'public'
       and p.proname in ('catalogue_search', 'catalogue_facets', 'catalogue_suggest')
       and name in ('cost_cents', 'compare_at_cents')
  ) then
    raise exception 'FAIL: a public catalogue function exposes a cost or compare-at column';
  end if;
  raise notice 'pass [security: no public catalogue function returns cost columns]';
end
$$;

-- 4c. The page-size clamp is enforced in the database, not only in the
--     application, because the API is reachable with the public anon key.
set role anon;
do $$
declare
  v_rows bigint;
begin
  select count(*) into v_rows from public.catalogue_search(p_scope => 'all', p_limit => 100000);
  if v_rows > 60 then
    raise exception 'FAIL: p_limit was not clamped; % rows returned', v_rows;
  end if;
  raise notice 'pass [security: page size is clamped inside the function]';

  -- A negative offset must not raise; it is clamped to zero.
  perform count(*) from public.catalogue_search(p_scope => 'all', p_offset => -50);
  raise notice 'pass [security: a negative offset is clamped, not an error]';
end
$$;
reset role;

-- 4d. Suggestions must not leak unpublished products or inactive taxonomy.
set role anon;
do $$
declare
  v_hrefs text[];
begin
  select array_agg(href) into v_hrefs
    from public.catalogue_suggest(p_query => 'cat', p_limit => 12);

  if v_hrefs is null then
    raise notice 'pass [suggest: no matches is a valid empty result]';
    return;
  end if;

  if exists (select 1 from unnest(v_hrefs) h where h like '%/products/cat-draft%' or h like '%/products/cat-archived%') then
    raise exception 'FAIL: suggest returned an unpublished product';
  end if;
  if exists (select 1 from unnest(v_hrefs) h where h like '%cat-brand-inactive%') then
    raise exception 'FAIL: suggest returned an inactive brand';
  end if;
  raise notice 'pass [suggest: only published products and active taxonomy]';
end
$$;
reset role;

-- -----------------------------------------------------------------------------
-- 5. Clean up the fixtures so later suites see the catalogue they expect
-- -----------------------------------------------------------------------------
set role service_role;
delete from public.collection_products
 where collection_id in ('c0000000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-000000000022');
delete from public.inventory
 where product_id in (select id from public.products where sku like 'CAT-%');
delete from public.products where sku like 'CAT-%';
delete from public.models where id in ('c0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000012');
delete from public.collections where id in ('c0000000-0000-4000-8000-000000000021', 'c0000000-0000-4000-8000-000000000022');
delete from public.brands where id in ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002');
reset role;

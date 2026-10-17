-- =============================================================================
-- 15 — Public availability (migration 0009)
--
-- The storefront must be able to show whether a watch is available without
-- being able to read stock levels. `is_product_available` has to answer the
-- first question and be incapable of answering the second.
--
-- The case that matters most is #2 below. A naive implementation checks
-- `quantity > 0`, which reports a fully reserved watch as available and lets a
-- second customer order a piece that is already spoken for.
-- =============================================================================

\set ON_ERROR_STOP on

set role service_role;

insert into public.products (sku, slug, title, status, published_at)
values ('AVAIL-1', 'avail-in-stock',    'Available watch',   'published', now()),
       ('AVAIL-2', 'avail-out-of-stock', 'Sold watch',        'published', now()),
       ('AVAIL-3', 'avail-draft',        'Unreleased watch',  'draft',     null)
on conflict (slug) do nothing;

insert into public.inventory (product_id, quantity, reserved_quantity)
select id, 1, 0 from public.products where slug = 'avail-in-stock'
on conflict (product_id) do nothing;

insert into public.inventory (product_id, quantity, reserved_quantity)
select id, 1, 1 from public.products where slug = 'avail-out-of-stock'
on conflict (product_id) do nothing;

insert into public.inventory (product_id, quantity, reserved_quantity)
select id, 5, 0 from public.products where slug = 'avail-draft'
on conflict (product_id) do nothing;

reset role;

set role anon;
do $$
declare
  v_available boolean;
begin
  -- 1. Unreserved stock reads as available.
  select public.is_product_available((select id from public.products where slug = 'avail-in-stock'))
    into v_available;
  if v_available is not true then
    raise exception 'FAIL: a published product with unreserved stock should be available';
  end if;
  raise notice 'pass [availability: published with stock is available]';

  -- 2. Fully reserved stock is unavailable even though quantity > 0.
  select public.is_product_available((select id from public.products where slug = 'avail-out-of-stock'))
    into v_available;
  if v_available is not false then
    raise exception 'FAIL: a fully reserved product must not read as available';
  end if;
  raise notice 'pass [availability: fully reserved is unavailable]';

  -- 3. The publication gate is re-applied inside the definer function. Without
  --    it, the function would leak that an unreleased product exists and has
  --    stock.
  select public.is_product_available((select id from public.products where slug = 'avail-draft'))
    into v_available;
  if v_available is not false then
    raise exception 'FAIL: a draft product must never read as available';
  end if;
  raise notice 'pass [availability: draft is unavailable even with stock]';

  -- 4. An unknown id is false, not null and not an error.
  select public.is_product_available(gen_random_uuid()) into v_available;
  if v_available is not false then
    raise exception 'FAIL: an unknown product id should be false';
  end if;
  raise notice 'pass [availability: unknown id is false]';
end
$$;
reset role;

-- 5. The function must not have become a route to the underlying numbers.
set role anon;
do $$
declare
  v_count bigint;
begin
  select count(*) into v_count from public.inventory;
  if v_count <> 0 then
    raise exception 'FAIL: anon read % inventory row(s); stock levels must stay private', v_count;
  end if;
  raise notice 'pass [anon still cannot read inventory rows]';
end
$$;
reset role;

-- 6. `security definer` must not have widened anything else. `anon` should still
--    be unable to write to inventory.
set role anon;
do $$
begin
  begin
    update public.inventory set quantity = 999;
  exception when insufficient_privilege then
    raise notice 'pass [anon cannot update inventory]';
    return;
  end;
  -- RLS filters rather than raises for UPDATE, so assert nothing changed.
  if exists (select 1 from public.inventory where quantity = 999) then
    raise exception 'FAIL: anonymous UPDATE altered inventory';
  end if;
  raise notice 'pass [anon UPDATE left inventory untouched]';
end
$$;
reset role;

-- 7. The set version returns one row per PUBLISHED product only. A draft id in
--    the request must produce no row at all, otherwise the function would leak
--    the existence of an unreleased product.
set role anon;
do $$
declare
  v_rows      bigint;
  v_available boolean;
begin
  select count(*) into v_rows
    from public.product_availability(
      array(select id from public.products
             where slug in ('avail-in-stock', 'avail-out-of-stock', 'avail-draft'))
    );
  if v_rows <> 2 then
    raise exception 'FAIL: expected 2 rows (published only), got %', v_rows;
  end if;
  raise notice 'pass [availability set: draft produces no row]';

  select is_available into v_available
    from public.product_availability(
      array(select id from public.products where slug = 'avail-in-stock')
    );
  if v_available is not true then
    raise exception 'FAIL: the set version disagrees with the single version';
  end if;
  raise notice 'pass [availability set: agrees with single lookup]';

  -- An unknown id is dropped, not returned as a false row.
  select count(*) into v_rows from public.product_availability(array[gen_random_uuid()]);
  if v_rows <> 0 then
    raise exception 'FAIL: an unknown id should produce no row, got %', v_rows;
  end if;
  raise notice 'pass [availability set: unknown id produces no row]';
end
$$;
reset role;

-- 8. Brand counts are aggregated in the database, so the storefront never reads
--    the whole catalogue to render a homepage.
set role anon;
do $$
declare
  v_count bigint;
  v_brand uuid;
begin
  select count(*) into v_count from public.published_product_counts();
  if v_count < 1 then
    raise exception 'FAIL: expected at least one brand with published products';
  end if;
  raise notice 'pass [published counts: returns rows]';

  select brand_id into v_brand from public.published_product_counts() limit 1;

  -- The total must match a direct count, otherwise the showcase would lie.
  select count(*) into v_count
    from public.products
   where status = 'published' and brand_id = v_brand;
  if v_count <> (select product_count from public.published_product_counts() where brand_id = v_brand) then
    raise exception 'FAIL: published_product_counts disagrees with a direct count';
  end if;
  raise notice 'pass [published counts: agrees with a direct count]';
end
$$;
reset role;


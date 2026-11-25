-- =============================================================================
-- 66 — Low stock is a column-to-column comparison, evaluated where it can be
--
-- The dashboard and the inventory list both used
--
--   .filter('quantity', 'lte', 'low_stock_threshold')
--
-- PostgREST reads the right side of a filter as a literal, so that generated
-- `quantity=lte.low_stock_threshold` and Postgres rejected the cast:
--
--   22P02 invalid input syntax for type integer: "low_stock_threshold"
--
-- Both callers swallowed the error and reported zero/empty. Nothing failed
-- loudly, so a permanently-zero "LOW STOCK" tile and an always-empty filter
-- looked like "nothing needs reordering" on a database where every row
-- qualifies. This suite pins the two things that make that impossible now:
-- the view evaluates the comparison correctly, and the naive filter still fails
-- so nobody quietly reintroduces it.
-- =============================================================================

\set ON_ERROR_STOP on

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
-- Fixtures: three products, straddling the threshold from both sides
--
--   below  quantity  0 <= threshold 2   -> low
--   equal  quantity  2 <= threshold 2   -> low   (the boundary, inclusive)
--   above  quantity  5 <= threshold 2   -> not low
-- -----------------------------------------------------------------------------

set role service_role;

insert into public.products (id, brand_id, sku, title, slug, reference_number, status, published_at)
select
  ('e1000000-0000-4000-8000-00000000000' || n)::uuid,
  (select id from public.brands order by name limit 1),
  'LSF-SKU-' || n,
  'Low-stock fixture ' || n,
  'low-stock-fixture-' || n,
  'LSF-' || n,
  'published',
  now()
from generate_series(1, 3) as n;

insert into public.inventory (product_id, quantity, reserved_quantity, low_stock_threshold)
values
  ('e1000000-0000-4000-8000-000000000001', 0, 0, 2),
  ('e1000000-0000-4000-8000-000000000002', 2, 0, 2),
  ('e1000000-0000-4000-8000-000000000003', 5, 0, 2);

-- -----------------------------------------------------------------------------
-- 1. The view classifies them correctly, including the inclusive boundary
-- -----------------------------------------------------------------------------

select pg_temp.assert_eq(
  'below threshold is low',
  $$select is_low_stock::text from public.inventory_stock_state
     where product_id = 'e1000000-0000-4000-8000-000000000001'$$,
  'true');

select pg_temp.assert_eq(
  'equal to threshold is low (inclusive)',
  $$select is_low_stock::text from public.inventory_stock_state
     where product_id = 'e1000000-0000-4000-8000-000000000002'$$,
  'true');

select pg_temp.assert_eq(
  'above threshold is not low',
  $$select is_low_stock::text from public.inventory_stock_state
     where product_id = 'e1000000-0000-4000-8000-000000000003'$$,
  'false');

-- -----------------------------------------------------------------------------
-- 2. The view's count matches a direct comparison of the same columns
--
-- This is the assertion that would have caught the defect: it compares the
-- view's answer against the definition the dashboard is trying to express. The
-- broken filter returned 0 against a true count of every row.
-- -----------------------------------------------------------------------------

select pg_temp.assert_eq(
  'view count equals a direct column comparison',
  $$select (
      (select count(*) from public.inventory_stock_state where is_low_stock)
      =
      (select count(*) from public.inventory i where i.quantity <= i.low_stock_threshold)
    )::text$$,
  'true');

-- -----------------------------------------------------------------------------
-- 3. Availability is derived the same way the rest of the system derives it
-- -----------------------------------------------------------------------------

update public.inventory
   set reserved_quantity = 2
 where product_id = 'e1000000-0000-4000-8000-000000000003';

select pg_temp.assert_eq(
  'available quantity discounts reservations',
  $$select available_quantity::text from public.inventory_stock_state
     where product_id = 'e1000000-0000-4000-8000-000000000003'$$,
  '3');

-- A fully reserved row is not low stock if it is above the threshold: the
-- threshold is about how many units are held, not how many are free. Pinned
-- because "low stock" and "unavailable" are easy to conflate.
select pg_temp.assert_eq(
  'reservations do not move the low-stock boundary',
  $$select is_low_stock::text from public.inventory_stock_state
     where product_id = 'e1000000-0000-4000-8000-000000000003'$$,
  'false');

-- -----------------------------------------------------------------------------
-- 4. The naive column-to-column filter still fails, so the defect cannot return
--
-- If a future PostgREST learns column references this assertion starts failing,
-- which is the correct prompt to revisit the view rather than a nuisance.
-- -----------------------------------------------------------------------------

do $$
begin
  begin
    execute $q$select count(*) from public.inventory
               where quantity <= 'low_stock_threshold'$q$;
  exception
    when invalid_text_representation then
      raise notice 'pass [column-vs-literal still rejected as 22P02]';
      return;
  end;
  raise exception 'FAIL: comparing an integer column to a non-numeric literal was accepted';
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. The view is not readable by the public API surface
--
-- `inventory` itself carries a staff-only RLS policy, and the view is
-- `security_invoker` so it inherits that. The grant is the second gate: stock
-- levels must not be reachable by `anon` or by any signed-in customer.
-- -----------------------------------------------------------------------------

select pg_temp.assert_eq(
  'anon has no select on the view',
  $$select has_table_privilege('anon', 'public.inventory_stock_state', 'select')::text$$,
  'false');

select pg_temp.assert_eq(
  'authenticated has no select on the view',
  $$select has_table_privilege('authenticated', 'public.inventory_stock_state', 'select')::text$$,
  'false');

select pg_temp.assert_eq(
  'service_role can select the view',
  $$select has_table_privilege('service_role', 'public.inventory_stock_state', 'select')::text$$,
  'true');

-- -----------------------------------------------------------------------------
-- Teardown
-- -----------------------------------------------------------------------------

delete from public.inventory
 where product_id in (
   'e1000000-0000-4000-8000-000000000001',
   'e1000000-0000-4000-8000-000000000002',
   'e1000000-0000-4000-8000-000000000003'
 );
delete from public.products
 where id in (
   'e1000000-0000-4000-8000-000000000001',
   'e1000000-0000-4000-8000-000000000002',
   'e1000000-0000-4000-8000-000000000003'
 );

reset role;

\echo '66_inventory_low_stock: all assertions passed'

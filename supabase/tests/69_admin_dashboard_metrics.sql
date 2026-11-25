-- =============================================================================
-- 69 — The dashboard's chart functions refuse a caller without permission
--
-- The dashboard already runs its head-only counts through the service-role
-- client, which bypasses RLS. That is safe only because the *page* checks the
-- permission first — the check lives in TypeScript, not in the database. These
-- two chart functions are different: they are callable by `authenticated`, so
-- they must refuse on their own. A function that answers a question the caller
-- may not ask is a leak regardless of who calls it.
--
-- This suite pins that, and it pins it with callers who differ. A suite that only
-- ever calls as a super administrator cannot tell "the guard works" from "the
-- guard is absent and everyone happens to be allowed".
--
-- It also pins the shape of the answer, because the dashboard's chart code reads
-- these columns by name and a renamed column would fail silently into an empty
-- chart rather than an error.
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

/** Assert that a statement raises, and with which SQLSTATE. */
create or replace function pg_temp.assert_raises(
  p_label  text,
  p_sql    text,
  p_state  text
) returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'FAIL [%]: expected SQLSTATE %, but the statement succeeded', p_label, p_state;
exception
  when others then
    if sqlstate = p_state then
      raise notice 'pass [%]', p_label;
    else
      raise exception 'FAIL [%]: expected SQLSTATE %, got % (%)',
        p_label, p_state, sqlstate, sqlerrm;
    end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Callers
--
-- The roles are chosen so that the two permissions separate. `role_permissions`
-- gives INVENTORY_MANAGER *both* `catalog.read` and `inventory.read`, so it
-- cannot tell the two guards apart — an earlier draft of this suite used it and
-- passed a call that should have been refused.
--
--   ...0d1  CUSTOMER_SUPPORT  holds catalog.read, not inventory.read
--   ...0d2  SALES_MANAGER     holds catalog.read and inventory.read
--   ...0d3  CONTENT_MANAGER   holds neither
-- -----------------------------------------------------------------------------

set role service_role;

delete from public.user_roles where user_id in (
  'a9000000-0000-4000-8000-0000000000d1',
  'a9000000-0000-4000-8000-0000000000d2',
  'a9000000-0000-4000-8000-0000000000d3');
delete from public.profiles where id in (
  'a9000000-0000-4000-8000-0000000000d1',
  'a9000000-0000-4000-8000-0000000000d2',
  'a9000000-0000-4000-8000-0000000000d3');
delete from auth.users where id in (
  'a9000000-0000-4000-8000-0000000000d1',
  'a9000000-0000-4000-8000-0000000000d2',
  'a9000000-0000-4000-8000-0000000000d3');

insert into auth.users (id, email) values
  ('a9000000-0000-4000-8000-0000000000d1', 'dash-support@example.test'),
  ('a9000000-0000-4000-8000-0000000000d2', 'dash-sales@example.test'),
  ('a9000000-0000-4000-8000-0000000000d3', 'dash-content@example.test');

-- `on auth.users` insert already creates the profile row (0002), so this is an
-- update rather than an insert. The display name is not what the suite asserts,
-- but leaving it set keeps the fixture readable in a failing run.
insert into public.profiles (id, email, full_name) values
  ('a9000000-0000-4000-8000-0000000000d1', 'dash-support@example.test', 'Dash Support'),
  ('a9000000-0000-4000-8000-0000000000d2', 'dash-sales@example.test', 'Dash Sales'),
  ('a9000000-0000-4000-8000-0000000000d3', 'dash-content@example.test', 'Dash Content')
on conflict (id) do update set full_name = excluded.full_name;

insert into public.user_roles (user_id, role) values
  ('a9000000-0000-4000-8000-0000000000d1', 'CUSTOMER_SUPPORT'),
  ('a9000000-0000-4000-8000-0000000000d2', 'SALES_MANAGER'),
  ('a9000000-0000-4000-8000-0000000000d3', 'CONTENT_MANAGER');

-- -----------------------------------------------------------------------------
-- Catalogue fixtures.
--
-- `db-verify.sh` applies every migration and then runs this suite — before any
-- seed. A suite that counted the seed's rows would therefore assert against an
-- empty catalogue and fail for a reason that has nothing to do with the guards.
-- These rows are the minimum needed for the two charts to have something to
-- count, and the suite removes them again at the end.
-- -----------------------------------------------------------------------------

set role service_role;

delete from public.products where sku like 'DASH-%';
delete from public.brands where slug like 'dash-brand-%';

insert into public.brands (id, name, slug) values
  ('b9000000-0000-4000-8000-0000000000b1', 'Dash Alpha', 'dash-brand-alpha'),
  ('b9000000-0000-4000-8000-0000000000b2', 'Dash Beta',  'dash-brand-beta');

insert into public.products (sku, slug, title, brand_id, status, published_at) values
  ('DASH-1', 'dash-one',   'Dash One',   'b9000000-0000-4000-8000-0000000000b1', 'published', now()),
  ('DASH-2', 'dash-two',   'Dash Two',   'b9000000-0000-4000-8000-0000000000b1', 'published', now()),
  ('DASH-3', 'dash-three', 'Dash Three', 'b9000000-0000-4000-8000-0000000000b2', 'draft',     null);

-- One healthy row and one at its threshold, so the stock chart has two real
-- buckets rather than one. `low_stock_threshold` is 1 by default, so a quantity
-- of 1 counts as low.
insert into public.inventory (product_id, quantity, low_stock_threshold)
select p.id,
       case p.sku when 'DASH-1' then 5 else 1 end,
       1
  from public.products p
 where p.sku like 'DASH-%';

reset role;

-- -----------------------------------------------------------------------------
-- 1. An anonymous caller may not call either function at all.
--
-- The grant is to `authenticated`, so `anon` is refused by privilege rather than
-- by the permission check. Either way the answer is "no", and that is the point:
-- these figures describe the business.
-- -----------------------------------------------------------------------------

set role anon;
select pg_temp.assert_raises(
  'anon cannot read catalogue-by-brand',
  'select * from public.admin_catalogue_by_brand(5)',
  '42501'
);
select pg_temp.assert_raises(
  'anon cannot read inventory-by-state',
  'select * from public.admin_inventory_by_state()',
  '42501'
);
reset role;

-- -----------------------------------------------------------------------------
-- 2. A content manager holds neither permission: both calls are refused.
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-0000000000d3","role":"authenticated"}';

select pg_temp.assert_raises(
  'content manager cannot read catalogue-by-brand',
  'select * from public.admin_catalogue_by_brand(5)',
  '42501'
);
select pg_temp.assert_raises(
  'content manager cannot read inventory-by-state',
  'select * from public.admin_inventory_by_state()',
  '42501'
);

reset role;

-- -----------------------------------------------------------------------------
-- 3. Customer support holds catalog.read but not inventory.read.
--
-- This is the caller that proves the two guards are separate rather than one
-- shared check: they may read the brand chart and must not read the stock chart.
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-0000000000d1","role":"authenticated"}';

-- The brand chart is theirs. It must answer without error.
select pg_temp.assert_eq(
  'customer support may read catalogue-by-brand',
  'select count(*)::text from public.admin_catalogue_by_brand(5)',
  '2'
);

select pg_temp.assert_raises(
  'customer support cannot read inventory-by-state',
  'select * from public.admin_inventory_by_state()',
  '42501'
);

reset role;

-- Capture the stock-row total as a privileged caller. The sales manager below
-- cannot read `inventory_stock_state` directly, which is the point of the
-- function: it exposes the aggregate without exposing the rows. The baseline has
-- to be taken here, while we still can.
create temp table stock_baseline as
select count(*)::bigint as rows_total
  from public.inventory_stock_state s
  join public.products p on p.id = s.product_id
 where p.sku like 'DASH-%';
grant select on stock_baseline to authenticated;

-- The number of brands that have at least one product, counted without RLS. The
-- caller below sees only published rows, so computing this baseline as them
-- would undercount and the clamp assertion would fail for the wrong reason.
create temp table brand_baseline as
select count(distinct brand_id)::bigint as brand_total
  from public.products
 where brand_id is not null;
grant select on brand_baseline to authenticated;

-- -----------------------------------------------------------------------------
-- 4. A sales manager holds both, and both must answer with the documented shape.
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-0000000000d2","role":"authenticated"}';

-- Only states that have at least one row are returned; the repository fills the
-- missing buckets with zero so the legend always names all three. The assertion
-- is therefore that no *unexpected* state appears, not that all three do — on a
-- database where every piece is healthy, "low" and "out" are correctly absent.
select pg_temp.assert_eq(
  'stock chart states are drawn from the documented set',
  $q$
    select coalesce(string_agg(distinct state, ','), '')
      from public.admin_inventory_by_state()
     where state not in ('healthy', 'low', 'out')
  $q$,
  ''
);

select pg_temp.assert_eq(
  'stock chart returns no empty buckets',
  'select count(*)::text from public.admin_inventory_by_state() where item_count = 0',
  '0'
);

-- The sum of the buckets must equal the whole. The baseline was captured as a
-- privileged caller before the role changed, because a sales manager cannot read
-- the view itself.
select pg_temp.assert_eq(
  'stock chart total matches the baseline',
  $q$
    select (
      (select coalesce(sum(item_count), 0) from public.admin_inventory_by_state())
      = (select rows_total from stock_baseline)
    )::text
  $q$,
  'true'
);

-- The brand chart names the columns the repository maps. A rename here would
-- produce an empty chart rather than an error, because the repository maps the
-- fields by name and reports a failed call as no data. Asserting the JSON keys of
-- a real row is the honest check: a function's OUT parameters are not in
-- `pg_attribute`, so introspecting the catalogue would prove nothing.
select pg_temp.assert_eq(
  'brand chart exposes the documented column names',
  $q$
    select string_agg(key, ',' order by key)
      from public.admin_catalogue_by_brand(1) row_data,
           jsonb_each_text(to_jsonb(row_data)) as fields(key, value)
  $q$,
  'brand_id,brand_name,product_count,published_count'
);

-- The limit is clamped to 20: asking for a thousand brands must not return a
-- thousand, because the chart is drawn by hand and cannot usefully show them.
select pg_temp.assert_eq(
  'brand chart clamps an oversized limit to twenty',
  'select count(*)::text from public.admin_catalogue_by_brand(1000)',
  (select least(brand_total, 20)::text from brand_baseline)
);

-- Asking for zero or a negative count must still return at least one row rather
-- than an empty chart that looks like a broken query.
select pg_temp.assert_eq(
  'brand chart clamps a zero limit to one row',
  'select count(*)::text from public.admin_catalogue_by_brand(0)',
  '1'
);

reset role;

-- -----------------------------------------------------------------------------
-- 5. Both functions are `security definer` with an empty search_path.
--
-- Without that, a caller who can set `search_path` could point `brands` at their
-- own table and have the function read it with the owner's privileges.
-- -----------------------------------------------------------------------------

select pg_temp.assert_eq(
  'catalogue-by-brand is security definer',
  $q$select prosecdef::text from pg_proc where proname = 'admin_catalogue_by_brand'$q$,
  'true'
);

select pg_temp.assert_eq(
  'catalogue-by-brand pins an empty search_path',
  $q$select array_to_string(proconfig, ',') from pg_proc where proname = 'admin_catalogue_by_brand'$q$,
  'search_path=""'
);

select pg_temp.assert_eq(
  'inventory-by-state is security definer',
  $q$select prosecdef::text from pg_proc where proname = 'admin_inventory_by_state'$q$,
  'true'
);

select pg_temp.assert_eq(
  'inventory-by-state pins an empty search_path',
  $q$select array_to_string(proconfig, ',') from pg_proc where proname = 'admin_inventory_by_state'$q$,
  'search_path=""'
);

-- -----------------------------------------------------------------------------
-- Clean up the callers. The role grants are the only fixtures; the functions
-- read existing catalogue rows and are not modified by this suite.
-- -----------------------------------------------------------------------------

set role service_role;

delete from public.user_roles where user_id in (
  'a9000000-0000-4000-8000-0000000000d1',
  'a9000000-0000-4000-8000-0000000000d2',
  'a9000000-0000-4000-8000-0000000000d3');
delete from public.profiles where id in (
  'a9000000-0000-4000-8000-0000000000d1',
  'a9000000-0000-4000-8000-0000000000d2',
  'a9000000-0000-4000-8000-0000000000d3');
delete from auth.users where id in (
  'a9000000-0000-4000-8000-0000000000d1',
  'a9000000-0000-4000-8000-0000000000d2',
  'a9000000-0000-4000-8000-0000000000d3');

reset role;

\echo '69 — dashboard metrics: all assertions passed'

-- -----------------------------------------------------------------------------
-- Cleanup. The suite runs inside a transaction that `db-verify.sh` rolls back,
-- but a suite run by hand should still leave the catalogue as it found it.
-- -----------------------------------------------------------------------------

reset role;
set role service_role;
delete from public.inventory where product_id in (select id from public.products where sku like 'DASH-%');
delete from public.products where sku like 'DASH-%';
delete from public.brands where slug like 'dash-brand-%';
delete from public.user_roles where user_id in (
  'a9000000-0000-4000-8000-0000000000d1',
  'a9000000-0000-4000-8000-0000000000d2',
  'a9000000-0000-4000-8000-0000000000d3');
delete from public.profiles where id in (
  'a9000000-0000-4000-8000-0000000000d1',
  'a9000000-0000-4000-8000-0000000000d2',
  'a9000000-0000-4000-8000-0000000000d3');
delete from auth.users where id in (
  'a9000000-0000-4000-8000-0000000000d1',
  'a9000000-0000-4000-8000-0000000000d2',
  'a9000000-0000-4000-8000-0000000000d3');
reset role;


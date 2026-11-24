-- =============================================================================
-- 61 — Admin write paths, as the application actually performs them
--
-- 60_admin_operations.sql proves the functions. This suite proves the *table*
-- writes that surround them, because the admin actions do both: a product is
-- inserted or updated through the `products` table as the signed-in user (so
-- `products_staff_write` applies), and a status change goes through the
-- function.
--
-- The single most valuable assertion here is section 1. The application was
-- written, briefly, to perform every admin write through the service-role
-- client. That client carries no user, so `auth.uid()` is null, so
-- `admin_write_audit_log` refuses with "must be attributable to a signed-in
-- user" — and every admin action would have failed in the browser while every
-- function-level test stayed green. This suite pins that behaviour down: the
-- service-role client cannot audit, and the signed-in staff client can.
--
-- A second thing this suite pins: a non-staff user cannot write a product even
-- though `authenticated` holds the INSERT grant. The grant is not the check; the
-- policy is.
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
-- Fixtures
-- -----------------------------------------------------------------------------

set role service_role;

delete from public.admin_audit_logs where entity_id = 'f0000000-0000-0000-0000-0000000000f1';
delete from public.inventory_transactions where product_id = 'f0000000-0000-0000-0000-0000000000f1';
delete from public.inventory where product_id = 'f0000000-0000-0000-0000-0000000000f1';
delete from public.products where id = 'f0000000-0000-0000-0000-0000000000f1';

insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-0000000000f1', 'admin-adm61@example.test'),
  ('f1000000-0000-0000-0000-0000000000f2', 'support-adm61@example.test'),
  ('f1000000-0000-0000-0000-0000000000f3', 'customer-adm61@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, email) values
  ('f1000000-0000-0000-0000-0000000000f1', 'admin-adm61@example.test'),
  ('f1000000-0000-0000-0000-0000000000f2', 'support-adm61@example.test'),
  ('f1000000-0000-0000-0000-0000000000f3', 'customer-adm61@example.test')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('f1000000-0000-0000-0000-0000000000f1', 'ADMIN'),
  ('f1000000-0000-0000-0000-0000000000f2', 'CUSTOMER_SUPPORT')
on conflict do nothing;

insert into public.brands (id, slug, name) values
  ('f2000000-0000-0000-0000-0000000000f1', 'adm61-brand', 'ADM61 Brand')
on conflict (id) do nothing;

reset role;

-- -----------------------------------------------------------------------------
-- 1. The audit writer needs a real signed-in user — the service-role trap
-- -----------------------------------------------------------------------------

-- The service-role client has no `auth.uid()`. Every admin action routes its
-- audit write through it in the wrong design, and the whole action fails here.
set role service_role;
select pg_temp.assert_raises(
  'audit: the service-role client has no actor, so it cannot audit',
  $q$select public.admin_write_audit_log('product.created', 'product', 'f0000000-0000-0000-0000-0000000000f1', '{}'::jsonb)$q$,
  '42501',
  '%must be attributable%'
);
reset role;

-- The signed-in staff client can. This is the path the actions use.
set role authenticated;
set request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
select pg_temp.assert_eq(
  'audit: a signed-in administrator can write an audit row',
  $q$select (public.admin_write_audit_log('product.created', 'product', 'f0000000-0000-0000-0000-0000000000f1', '{}'::jsonb) is not null)::text$q$,
  'true'
);
reset role;

-- -----------------------------------------------------------------------------
-- 2. A product write is a table write, and the policy is what gates it
-- -----------------------------------------------------------------------------

-- A customer holds the INSERT grant on `products` but fails the policy. If this
-- assertion ever starts passing as a success, the grant has been mistaken for
-- the check.
set role authenticated;
set request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-0000000000f3","role":"authenticated"}';
select pg_temp.assert_raises(
  'products: a signed-in customer cannot insert a product',
  $q$insert into public.products (sku, slug, title, status)
     values ('ADM61-DENY', 'adm61-denied', 'Denied', 'draft')$q$,
  '42501',
  null
);
reset role;

-- ADMIN can. This mirrors `createProductAction`'s insert exactly: no
-- `published_at`, status draft.
set role authenticated;
set request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
insert into public.products (id, sku, slug, title, brand_id, status, price_cents, price_on_request)
values (
  'f0000000-0000-0000-0000-0000000000f1', 'ADM61-ALLOW', 'adm61-allowed',
  'ADM61 Allowed', 'f2000000-0000-0000-0000-0000000000f1', 'draft', 750000, false
);
select pg_temp.assert_eq(
  'products: an administrator can insert a draft product',
  $q$select status::text from public.products where id = 'f0000000-0000-0000-0000-0000000000f1'$q$,
  'draft'
);

-- Publication is not an insert. The timestamp rule refuses it, which is why
-- the editor publishes through the function rather than by writing the column.
select pg_temp.assert_raises(
  'products: a published row cannot be written without a timestamp',
  $q$update public.products set status = 'published'
      where id = 'f0000000-0000-0000-0000-0000000000f1'$q$,
  '23514',
  null
);

-- The function is the supported path and stamps the timestamp.
select pg_temp.assert_eq(
  'products: admin_set_product_status publishes and stamps the timestamp',
  $q$select (public.admin_set_product_status('f0000000-0000-0000-0000-0000000000f1', 'published')).published_at is not null$q$,
  'true'
);

-- A support role holds catalog.write? No — it holds catalog.read only, so it
-- cannot publish. This is the assertion that proves the function's own check
-- is live and not merely decorative.
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
select pg_temp.assert_raises(
  'products: support cannot publish, even though it can read the catalogue',
  $q$select public.admin_set_product_status('f0000000-0000-0000-0000-0000000000f1', 'draft')$q$,
  '42501',
  '%permission%'
);
reset role;

-- -----------------------------------------------------------------------------
-- 3. A stock adjustment writes the ledger and the balance together
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

-- The starting balance is created as `service_role`, because 0021 revoked
-- direct write on `inventory` from `authenticated` — which is the invariant this
-- section is about. A stock adjustment still works, because it goes through the
-- function and the ledger rather than writing the balance.
reset role;
set role service_role;
insert into public.inventory (product_id, quantity, reserved_quantity)
values ('f0000000-0000-0000-0000-0000000000f1', 3, 0)
on conflict (product_id) do update set quantity = 3, reserved_quantity = 0;
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

select public.admin_adjust_stock('f0000000-0000-0000-0000-0000000000f1', 2, 'adm61 restock');

select pg_temp.assert_eq(
  'inventory: the balance reflects the adjustment',
  $q$select quantity::text from public.inventory where product_id = 'f0000000-0000-0000-0000-0000000000f1'$q$,
  '5'
);
select pg_temp.assert_eq(
  'inventory: a ledger row records the adjustment',
  $q$select count(*)::text from public.inventory_transactions
      where product_id = 'f0000000-0000-0000-0000-0000000000f1' and quantity_delta = 2$q$,
  '1'
);

-- The ledger is the only writer of the balance. A direct UPDATE that skipped it
-- would leave the two disagreeing, so the table must refuse one.
select pg_temp.assert_raises(
  'inventory: the balance cannot be written directly',
  $q$update public.inventory set quantity = 99
      where product_id = 'f0000000-0000-0000-0000-0000000000f1'$q$,
  '42501',
  null
);

reset role;

-- -----------------------------------------------------------------------------
-- 4. The first stock count for a product that has no inventory row
--
-- Section 3 seeded its balance as `service_role`, which is exactly the gap this
-- section closes: nothing in the application creates an `inventory` row. A
-- product inserted through `createProductAction` has a `products` row and no
-- balance, so `is_product_available` reports false and the card renders
-- "Reserved" for a piece that has never been counted, and `cart_pricing`
-- coalesces the missing row to zero so it cannot be added to a cart either.
--
-- The one action that could repair it, `admin_adjust_stock`, raised
-- `no_data_found`. It now creates the row on the first positive adjustment. The
-- balance is still written only by the ledger trigger, so these assertions check
-- the balance and the ledger row together rather than either alone.
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"f1000000-0000-0000-0000-0000000000f1","role":"authenticated"}';
insert into public.products (id, sku, slug, title, brand_id, status, price_cents, price_on_request)
values (
  'f0000000-0000-0000-0000-0000000000f3', 'ADM61-FIRST', 'adm61-first-count',
  'ADM61 First Count', 'f2000000-0000-0000-0000-0000000000f1', 'draft', 900000, false
);

select pg_temp.assert_eq(
  'inventory: a newly created product has no balance row',
  $q$select count(*)::text from public.inventory
      where product_id = 'f0000000-0000-0000-0000-0000000000f3'$q$,
  '0'
);

-- Publish through the supported function, which is what `createProductAction`
-- does when the editor asks for a published product. Availability is only
-- reported for a published piece, so the assertion below would be vacuous on a
-- draft.
select public.admin_set_product_status('f0000000-0000-0000-0000-0000000000f3', 'published');

select pg_temp.assert_eq(
  'inventory: the first positive adjustment succeeds instead of raising',
  $q$select (public.admin_adjust_stock('f0000000-0000-0000-0000-0000000000f3', 4, 'adm61 first count')).quantity::text$q$,
  '4'
);

select pg_temp.assert_eq(
  'inventory: the ledger row is the one that moved the balance',
  $q$select quantity_delta::text from public.inventory_transactions
      where product_id = 'f0000000-0000-0000-0000-0000000000f3'$q$,
  '4'
);

-- The defect was invisible in the function and visible on the card, so the
-- assertion that matters is the one the catalogue reads.
select pg_temp.assert_eq(
  'inventory: availability flips to true after the first count',
  $q$select public.is_product_available('f0000000-0000-0000-0000-0000000000f3')::text$q$,
  'true'
);

-- A first adjustment that would leave a negative balance is not a correction,
-- it is a mis-specified delta, and it is refused with a message naming the
-- number rather than a constraint.
insert into public.products (id, sku, slug, title, brand_id, status, price_cents, price_on_request)
values (
  'f0000000-0000-0000-0000-0000000000f4', 'ADM61-NEG', 'adm61-negative-first',
  'ADM61 Negative First', 'f2000000-0000-0000-0000-0000000000f1', 'draft', 900000, false
);

select pg_temp.assert_raises(
  'inventory: a negative first adjustment on an uncounted product is refused',
  $q$select public.admin_adjust_stock('f0000000-0000-0000-0000-0000000000f4', -1, 'adm61 bogus')$q$,
  '23514',
  '%Stock cannot go below zero%'
);

select pg_temp.assert_eq(
  'inventory: the refused adjustment left no balance row behind',
  $q$select count(*)::text from public.inventory
      where product_id = 'f0000000-0000-0000-0000-0000000000f4'$q$,
  '0'
);

-- An id that names no product must still fail, so a stale admin form cannot look
-- like a successful adjustment.
select pg_temp.assert_raises(
  'inventory: an unknown product id is refused',
  $q$select public.admin_adjust_stock('00000000-0000-0000-0000-000000000000', 1, 'adm61 ghost')$q$,
  'P0002',
  '%No product%'
);

reset role;

-- -----------------------------------------------------------------------------
-- 5. Clean up the products this suite created; leave the append-only audit rows
-- -----------------------------------------------------------------------------

set role service_role;
delete from public.inventory_transactions
 where product_id in (
   'f0000000-0000-0000-0000-0000000000f1',
   'f0000000-0000-0000-0000-0000000000f3',
   'f0000000-0000-0000-0000-0000000000f4'
 );
delete from public.inventory
 where product_id in (
   'f0000000-0000-0000-0000-0000000000f1',
   'f0000000-0000-0000-0000-0000000000f3',
   'f0000000-0000-0000-0000-0000000000f4'
 );
delete from public.products
 where id in (
   'f0000000-0000-0000-0000-0000000000f1',
   'f0000000-0000-0000-0000-0000000000f3',
   'f0000000-0000-0000-0000-0000000000f4'
 );
reset role;

\echo '61_admin_write_paths: all assertions passed'

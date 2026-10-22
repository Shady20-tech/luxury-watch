-- =============================================================================
-- 40 — Order submission, server-derived pricing and inventory safety
--
-- Covers the acceptance criteria:
--   * "Inventory cannot go negative or be double-reserved through concurrent
--     order requests."  (single-session properties here; true concurrency is
--     exercised by scripts/db-concurrency-test.sh)
--   * Totals are recomputed server-side and client input cannot alter them.
--   * Reserving, releasing and confirming behave as documented.
--   * No state implies an online payment occurred.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert_count(
  p_label text, p_sql text, p_expected bigint
) returns void
language plpgsql
as $$
declare v_count bigint;
begin
  execute p_sql into v_count;
  if v_count <> p_expected then
    raise exception 'FAIL [%]: expected %, got %', p_label, p_expected, v_count;
  end if;
  raise notice 'pass [%]', p_label;
end;
$$;

create or replace function pg_temp.assert_raises(
  p_label text, p_sql text
) returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'pass [%] (raised)', p_label;
    return;
  end;
  raise exception 'FAIL [%]: expected an error, but it succeeded', p_label;
end;
$$;

-- Assert a statement is refused at the privilege layer, not merely filtered to
-- zero rows. Used where migration 0014 removed the grant outright.
create or replace function pg_temp.assert_denied(
  p_label text, p_sql text
) returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    raise notice 'pass [%] (denied)', p_label;
    return;
  end;
  raise exception 'FAIL [%]: expected permission denied, but the statement succeeded', p_label;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures: a priced watch with two in stock, and a price-on-request watch with
-- one in stock (the scarce one used for the concurrency test).
-- -----------------------------------------------------------------------------

set role service_role;

insert into public.products (id, sku, slug, title, status, published_at, price_on_request, price_cents, currency)
values
  ('40000000-0000-0000-0000-000000000001', 'SKU-PRICED', 'priced-watch', 'Priced Watch',
   'published', now(), false, 1250000, 'USD'),
  ('40000000-0000-0000-0000-000000000002', 'SKU-POR', 'por-watch', 'Price On Request Watch',
   'published', now(), true, null, 'USD'),
  ('40000000-0000-0000-0000-000000000003', 'SKU-SCARCE', 'scarce-watch', 'Scarce Watch',
   'published', now(), false, 500000, 'USD'),
  ('40000000-0000-0000-0000-000000000004', 'SKU-DRAFTORD', 'draft-order-watch', 'Draft Order Watch',
   'draft', null, false, 100000, 'USD');

insert into public.inventory (product_id, quantity) values
  ('40000000-0000-0000-0000-000000000001', 2),
  ('40000000-0000-0000-0000-000000000002', 1),
  ('40000000-0000-0000-0000-000000000003', 1),
  ('40000000-0000-0000-0000-000000000004', 5);

insert into public.delivery_options (code, label, fee_cents, is_enabled) values
  ('standard_delivery', 'Standard delivery', 5000, true),
  ('pickup_in_store', 'Collect in store', 0, true),
  ('disabled_delivery', 'Disabled delivery', 9999, false);

reset role;

-- =============================================================================
-- 1. A priced order is created with server-derived totals
-- =============================================================================

set role anon;
set request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_order public.order_requests;
begin
  v_order := public.submit_order_request(
    p_items               => '[{"product_id":"40000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    p_customer_name       => 'Guest Buyer',
    p_customer_email      => 'guest@example.test',
    p_customer_phone      => '+44 7000 000000',
    p_fulfilment_type     => 'delivery',
    p_payment_method_code => 'bank_transfer',
    p_delivery_address    => '{"line1":"1 Test Road","city":"London","country_code":"GB"}'::jsonb,
    p_delivery_option_code => 'standard_delivery',
    p_terms_acknowledged  => true
  );

  if v_order.subtotal_cents <> 1250000 then
    raise exception 'FAIL: subtotal should be 1250000, got %', v_order.subtotal_cents;
  end if;
  if v_order.delivery_fee_cents <> 5000 then
    raise exception 'FAIL: delivery fee should be 5000, got %', v_order.delivery_fee_cents;
  end if;
  if v_order.total_cents <> 1255000 then
    raise exception 'FAIL: total should be 1255000, got %', v_order.total_cents;
  end if;
  raise notice 'pass [server derives subtotal, fee and total from the database]';

  if v_order.status <> 'submitted' then
    raise exception 'FAIL: a new request should be submitted, got %', v_order.status;
  end if;
  raise notice 'pass [a new order request starts as submitted]';

  -- Nothing may imply payment happened.
  if v_order.status = 'paid_offline' then
    raise exception 'FAIL: a customer-submitted request must never be paid_offline';
  end if;
  if v_order.settled_offline_at is not null then
    raise exception 'FAIL: settlement must be null until an administrator records it';
  end if;
  raise notice 'pass [submission never records settlement]';

  if v_order.reference !~ '^LW-[0-9]{2}-[0-9]{6}$' then
    raise exception 'FAIL: reference % does not match the expected format', v_order.reference;
  end if;
  raise notice 'pass [reference is generated in the documented format]';
end
$$;

reset role;

-- The line-item snapshot is asserted as the service role, because a guest
-- order's items are (correctly) not readable by an anonymous caller.
set role service_role;

-- The item row snapshots the product.
select pg_temp.assert_count(
  'the order line snapshots the product title',
  'select count(*) from public.order_request_items where product_title_snapshot = ''Priced Watch''', 1);

-- A status-history event was written for the submission.
select pg_temp.assert_count(
  'submission writes an opening history event',
  'select count(*) from public.order_request_events where from_status is null and to_status = ''submitted''', 1);

reset role;

-- And confirm the guest genuinely cannot read those rows back.
--
-- Migration 0014 revoked `anon`'s table-level grant on both tables, so this is a
-- hard denial rather than an empty result. The guest reaches their own order
-- only through `read_order_request`, which is SECURITY DEFINER and returns a
-- hand-built document with no internal field in it.
set role anon;
set request.jwt.claims = '{"role":"anon"}';
select pg_temp.assert_denied(
  'an anonymous caller cannot read order_request_items',
  'select count(*) from public.order_request_items');
select pg_temp.assert_denied(
  'an anonymous caller cannot read order_request_events',
  'select count(*) from public.order_request_events');
reset role;

-- =============================================================================
-- 2. Reservation holds stock
-- =============================================================================

do $$
declare
  v_qty integer;
  v_res integer;
begin
  select quantity, reserved_quantity into v_qty, v_res
    from public.inventory where product_id = '40000000-0000-0000-0000-000000000001';

  if v_res <> 1 then
    raise exception 'FAIL: one unit should be reserved, got %', v_res;
  end if;
  if v_qty <> 2 then
    raise exception 'FAIL: on-hand quantity should be unchanged at 2, got %', v_qty;
  end if;
  raise notice 'pass [submitting reserves stock without decrementing on-hand]';

  -- Available is quantity - reserved.
  if (v_qty - v_res) <> 1 then
    raise exception 'FAIL: available should be 1, got %', (v_qty - v_res);
  end if;
  raise notice 'pass [available stock reflects the reservation]';
end
$$;

select pg_temp.assert_count(
  'the reservation is recorded as active',
  'select count(*) from public.inventory_reservations where product_id = ''40000000-0000-0000-0000-000000000001'' and is_active', 1);

select pg_temp.assert_count(
  'the reservation is written to the ledger',
  'select count(*) from public.inventory_transactions where product_id = ''40000000-0000-0000-0000-000000000001'' and kind = ''reservation''', 1);

-- =============================================================================
-- 3. Price-on-request products record no amount
-- =============================================================================

set role anon;
set request.jwt.claims = '{"role":"anon"}';

do $$
declare v_order public.order_requests;
begin
  v_order := public.submit_order_request(
    p_items               => '[{"product_id":"40000000-0000-0000-0000-000000000002","quantity":1}]'::jsonb,
    p_customer_name       => 'POR Buyer',
    p_customer_email      => 'por@example.test',
    p_customer_phone      => null,
    p_fulfilment_type     => 'pickup',
    p_payment_method_code => 'bank_transfer',
    p_terms_acknowledged  => true
  );

  if v_order.subtotal_cents <> 0 then
    raise exception 'FAIL: a price-on-request item must contribute 0, got %', v_order.subtotal_cents;
  end if;
  raise notice 'pass [price-on-request items record no amount]';
end
$$;

reset role;

set role service_role;
select pg_temp.assert_count(
  'the price-on-request line has a null unit price',
  'select count(*) from public.order_request_items where unit_price_cents is null', 1);
reset role;

-- =============================================================================
-- 4. Disabled and unknown payment methods are rejected
-- =============================================================================

set role anon;
set request.jwt.claims = '{"role":"anon"}';

select pg_temp.assert_raises(
  'a disabled payment method is rejected',
  'select public.submit_order_request(
     ''[{"product_id":"40000000-0000-0000-0000-000000000003","quantity":1}]''::jsonb,
     ''X'', ''x@y.test'', null, ''pickup'', ''disabled_method'',
     p_terms_acknowledged => true)');

select pg_temp.assert_raises(
  'an unknown payment method is rejected',
  'select public.submit_order_request(
     ''[{"product_id":"40000000-0000-0000-0000-000000000003","quantity":1}]''::jsonb,
     ''X'', ''x@y.test'', null, ''pickup'', ''not_a_method'',
     p_terms_acknowledged => true)');

select pg_temp.assert_raises(
  'an empty item list is rejected',
  'select public.submit_order_request(
     ''[]''::jsonb, ''X'', ''x@y.test'', null, ''pickup'', ''bank_transfer'',
     p_terms_acknowledged => true)');

-- A draft product cannot be ordered, even by id.
select pg_temp.assert_raises(
  'a draft product cannot be ordered',
  'select public.submit_order_request(
     ''[{"product_id":"40000000-0000-0000-0000-000000000004","quantity":1}]''::jsonb,
     ''X'', ''x@y.test'', null, ''pickup'', ''bank_transfer'',
     p_terms_acknowledged => true)');

-- A disabled delivery option cannot be used.
select pg_temp.assert_raises(
  'a disabled delivery option is rejected',
  'select public.submit_order_request(
     ''[{"product_id":"40000000-0000-0000-0000-000000000003","quantity":1}]''::jsonb,
     ''X'', ''x@y.test'', null, ''delivery'', ''bank_transfer'',
     ''{"line1":"1 A St","city":"London","country_code":"GB"}''::jsonb,
     null, ''disabled_delivery'', p_terms_acknowledged => true)');

-- More than available stock is refused.
select pg_temp.assert_raises(
  'ordering more than is available is refused',
  'select public.submit_order_request(
     ''[{"product_id":"40000000-0000-0000-0000-000000000003","quantity":5}]''::jsonb,
     ''X'', ''x@y.test'', null, ''pickup'', ''bank_transfer'',
     p_terms_acknowledged => true)');

-- Delivery without an address is refused. The address is the customer's to give,
-- so this is a genuine validation rule rather than a formality.
select pg_temp.assert_raises(
  'delivery without an address is rejected',
  'select public.submit_order_request(
     ''[{"product_id":"40000000-0000-0000-0000-000000000003","quantity":1}]''::jsonb,
     ''X'', ''x@y.test'', null, ''delivery'', ''bank_transfer'',
     p_terms_acknowledged => true)');

-- The terms acknowledgement is enforced in the database, not only in the form.
select pg_temp.assert_raises(
  'submitting without acknowledging the terms is rejected',
  'select public.submit_order_request(
     ''[{"product_id":"40000000-0000-0000-0000-000000000003","quantity":1}]''::jsonb,
     ''X'', ''x@y.test'', null, ''pickup'', ''bank_transfer'')');

reset role;

-- =============================================================================
-- 5. Direct writes cannot break inventory
-- =============================================================================

set role service_role;

select pg_temp.assert_raises(
  'inventory quantity cannot be driven negative',
  'update public.inventory set quantity = -1 where product_id = ''40000000-0000-0000-0000-000000000001''');

select pg_temp.assert_raises(
  'reserved quantity cannot exceed on-hand quantity',
  'update public.inventory set reserved_quantity = 99 where product_id = ''40000000-0000-0000-0000-000000000001''');

select pg_temp.assert_raises(
  'a ledger movement that would go negative is refused',
  'insert into public.inventory_transactions (product_id, kind, quantity_delta, reserved_delta)
   values (''40000000-0000-0000-0000-000000000003'', ''sale'', -99, 0)');

reset role;

-- =============================================================================
-- 6. Rejecting releases the hold; confirming converts it to a sale
-- =============================================================================

set role service_role;

do $$
declare
  v_order_id uuid;
begin
  select id into v_order_id from public.order_requests
   where customer_email = 'guest@example.test' limit 1;

  -- Reject the request as an administrator would.
  update public.order_requests set status = 'rejected' where id = v_order_id;

  if exists (
    select 1 from public.inventory_reservations
     where order_request_id = v_order_id and is_active
  ) then
    raise exception 'FAIL: rejecting left an active reservation';
  end if;
  raise notice 'pass [rejecting releases the reservation]';
end
$$;

reset role;

do $$
declare v_res integer;
begin
  select reserved_quantity into v_res
    from public.inventory where product_id = '40000000-0000-0000-0000-000000000001';
  if v_res <> 0 then
    raise exception 'FAIL: reserved should be back to 0 after rejection, got %', v_res;
  end if;
  raise notice 'pass [released stock returns to availability]';
end
$$;

select pg_temp.assert_count(
  'the release is recorded in the ledger',
  'select count(*) from public.inventory_transactions
    where product_id = ''40000000-0000-0000-0000-000000000001'' and kind = ''reservation_release''', 1);

-- Confirming a different request converts its hold into a sale.
set role anon;
set request.jwt.claims = '{"role":"anon"}';
do $$
begin
  perform public.submit_order_request(
    p_items               => '[{"product_id":"40000000-0000-0000-0000-000000000003","quantity":1}]'::jsonb,
    p_customer_name       => 'Confirm Buyer',
    p_customer_email      => 'confirm@example.test',
    p_customer_phone      => null,
    p_fulfilment_type     => 'pickup',
    p_payment_method_code => 'bank_transfer',
    p_terms_acknowledged  => true
  );
end
$$;
reset role;

do $$
declare
  v_order_id uuid;
  v_qty integer;
  v_res integer;
begin
  select id into v_order_id from public.order_requests
   where customer_email = 'confirm@example.test';

  select quantity, reserved_quantity into v_qty, v_res
    from public.inventory where product_id = '40000000-0000-0000-0000-000000000003';
  if v_res <> 1 or v_qty <> 1 then
    raise exception 'FAIL: expected 1 on-hand with 1 reserved, got qty=% reserved=%', v_qty, v_res;
  end if;
  raise notice 'pass [the scarce watch is held, not yet sold]';

  -- An administrator confirms the request.
  set local role service_role;
  update public.order_requests set status = 'confirmed' where id = v_order_id;
  reset role;

  select quantity, reserved_quantity into v_qty, v_res
    from public.inventory where product_id = '40000000-0000-0000-0000-000000000003';

  if v_qty <> 0 then
    raise exception 'FAIL: confirming should decrement on-hand to 0, got %', v_qty;
  end if;
  if v_res <> 0 then
    raise exception 'FAIL: confirming should clear the hold, got %', v_res;
  end if;
  raise notice 'pass [confirming converts the hold into a sale]';
end
$$;

select pg_temp.assert_count(
  'the sale is recorded in the ledger',
  'select count(*) from public.inventory_transactions
    where product_id = ''40000000-0000-0000-0000-000000000003'' and kind = ''sale''', 1);

select pg_temp.assert_count(
  'the confirmed request has a status-history event',
  'select count(*) from public.order_request_events where to_status = ''confirmed''', 1);

-- =============================================================================
-- 7. The schema cannot express an online payment
-- =============================================================================

do $$
declare
  v_suspicious text;
begin
  -- No column anywhere may look like a card field or a payment token.
  select string_agg(table_name || '.' || column_name, ', ')
    into v_suspicious
    from information_schema.columns
   where table_schema = 'public'
     and (
       -- payment-guard:allow — this pattern exists to prove no such column exists.
       column_name ~* 'card|pan|cvv|cvc|expiry|iban|payment_token|payment_intent|stripe|paypal'
     );

  if v_suspicious is not null then
    raise exception 'FAIL: found payment-like columns: %', v_suspicious;
  end if;
  raise notice 'pass [no column stores card data or a payment token]';

  -- No order status may imply an online payment.
  if exists (
    select 1 from unnest(enum_range(null::public.order_status)) s
     where s::text in ('paid', 'paid_online', 'payment_received')
  ) then
    raise exception 'FAIL: order_status contains an online-payment state';
  end if;
  raise notice 'pass [order_status has no online-payment state]';
end
$$;

drop function pg_temp.assert_count(text, text, bigint);
drop function pg_temp.assert_raises(text, text);

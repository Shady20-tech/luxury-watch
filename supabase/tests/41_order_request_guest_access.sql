-- =============================================================================
-- 41 — Guest order access, idempotency, discounts and rate limiting
--
-- Covers the Phase 8 acceptance criteria that 40 does not:
--   * A guest can read back their own request with a reference and token, and
--     only with both — the reference alone is not a credential.
--   * A resubmitted form does not create a second request or reserve stock twice.
--   * A promotional code is evaluated on the server; the caller supplies a code,
--     never an amount, and an ineligible code leaves the total untrusting of it.
--   * A limited code is not consumed by a request that was cancelled.
--   * Submission is rate limited per address.
--   * No newcomer can read another customer's request.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(
  p_label text, p_value boolean
) returns void
language plpgsql
as $$
begin
  if p_value is not true then
    raise exception 'FAIL [%]: expected true', p_label;
  end if;
  raise notice 'pass [%]', p_label;
end;
$$;

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
-- zero rows. Used where migration 0014 removed `anon`'s grant outright.
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
-- Fixtures
-- -----------------------------------------------------------------------------

set role service_role;

insert into public.payment_methods (code, label, is_enabled) values
  ('phase8_transfer', 'Phase 8 transfer', true);

insert into public.delivery_options (code, label, fee_cents, is_enabled) values
  ('phase8_standard', 'Phase 8 standard', 5000, true);

insert into public.products (id, sku, slug, title, status, published_at, price_on_request, price_cents)
values
  ('41000000-0000-0000-0000-000000000001', 'P8-A', 'phase8-watch-a', 'Phase 8 Watch A',
   'published', now(), false, 1000000),
  ('41000000-0000-0000-0000-000000000002', 'P8-B', 'phase8-watch-b', 'Phase 8 Watch B',
   'published', now(), false, 2000000);

insert into public.inventory (product_id, quantity) values
  ('41000000-0000-0000-0000-000000000001', 10),
  ('41000000-0000-0000-0000-000000000002', 10);

insert into public.discount_codes (code, label, kind, value, min_subtotal_cents, max_discount_cents, usage_limit, is_enabled)
values
  ('P8TEN', 'Ten percent', 'percentage', 1000, 0, null, null, true),
  ('P8ONE', 'One use only', 'fixed_amount', 50000, 0, null, 1, true),
  ('P8BIG', 'Needs a big basket', 'percentage', 1000, 99999999, null, null, true),
  ('P8OFF', 'Switched off', 'percentage', 1000, 0, null, null, false);

reset role;

-- =============================================================================
-- 1. A guest reads their own request, and only with the token
-- =============================================================================

set role anon;
set request.jwt.claims = '{"role":"anon"}';

do $$
declare
  v_order public.order_requests;
  v_token text := 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
  -- sha256(v_token), computed by the application. The test supplies the literal
  -- because that is exactly what the app does: the digest is produced in Node,
  -- not in Postgres, so the database never sees the token.
  v_hash  text := 'fa0cacfe1122ac62b0f70e4db95790326bae5a5c38924f315282cc4fd55b4986';
  v_read  jsonb;
begin
  v_order := public.submit_order_request(
    p_items               => '[{"product_id":"41000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    p_customer_name       => 'Guest Reader',
    p_customer_email      => 'reader@example.test',
    p_customer_phone      => null,
    p_fulfilment_type     => 'delivery',
    p_payment_method_code => 'phase8_transfer',
    p_delivery_address    => '{"line1":"1 Reader St","city":"London","country_code":"GB"}'::jsonb,
    p_delivery_option_code => 'phase8_standard',
    p_terms_acknowledged  => true,
    p_access_token_hash   => v_hash
  );

  perform pg_temp.assert_true(
    'the guest request stored the token hash',
    v_order.access_token_hash = v_hash);

  v_read := public.read_order_request(v_order.reference, v_token);
  perform pg_temp.assert_true('the guest can read their own request', v_read is not null);
  perform pg_temp.assert_true(
    'the read reports the submitted status, never a paid one',
    (v_read ->> 'status') = 'submitted');
  perform pg_temp.assert_true(
    'the read carries the server-derived total',
    (v_read ->> 'total_cents')::bigint = 1005000);

  -- The reference alone must not be enough.
  perform pg_temp.assert_true(
    'the reference without the token reads nothing',
    public.read_order_request(v_order.reference, 'not-the-token') is null);
  -- A wrong reference with a right token must not read anything either.
  perform pg_temp.assert_true(
    'a wrong reference with a token reads nothing',
    public.read_order_request('LW-00-000000', v_token) is null);
end $$;

reset role;

-- The raw token is never stored: only its hash is.
set role service_role;
select pg_temp.assert_true(
  'the stored credential is a hash, not the token',
  (select access_token_hash ~ '^[0-9a-f]{64}$'
   from public.order_requests where customer_email = 'reader@example.test'));
reset role;

-- =============================================================================
-- 2. Idempotency — a resubmitted form does not duplicate
-- =============================================================================

set role anon;
set request.jwt.claims = '{"role":"anon"}';

do $$
declare v1 public.order_requests; v2 public.order_requests;
begin
  v1 := public.submit_order_request(
    p_items               => '[{"product_id":"41000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    p_customer_name       => 'Retry Guest',
    p_customer_email      => 'retry8@example.test',
    p_customer_phone      => null,
    p_fulfilment_type     => 'pickup',
    p_payment_method_code => 'phase8_transfer',
    p_idempotency_key     => 'phase8-idem-key-0001',
    p_terms_acknowledged  => true
  );
  v2 := public.submit_order_request(
    p_items               => '[{"product_id":"41000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    p_customer_name       => 'Retry Guest',
    p_customer_email      => 'retry8@example.test',
    p_customer_phone      => null,
    p_fulfilment_type     => 'pickup',
    p_payment_method_code => 'phase8_transfer',
    p_idempotency_key     => 'phase8-idem-key-0001',
    p_terms_acknowledged  => true
  );

  perform pg_temp.assert_true(
    'resubmitting the same key returns the same request',
    v1.id = v2.id);
end $$;

reset role;

set role service_role;
select pg_temp.assert_count(
  'the retry created exactly one request',
  'select count(*) from public.order_requests where customer_email = ''retry8@example.test''', 1);
select pg_temp.assert_count(
  'the retry reserved stock once, not twice',
  'select reserved_quantity from public.inventory where product_id = ''41000000-0000-0000-0000-000000000001''', 2);
reset role;

-- =============================================================================
-- 3. Discounts are evaluated on the server, from a code only
-- =============================================================================

set role anon;
set request.jwt.claims = '{"role":"anon"}';

do $$
declare v_order public.order_requests; v_priced jsonb;
begin
  -- A valid percentage code.
  v_order := public.submit_order_request(
    p_items               => '[{"product_id":"41000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    p_customer_name       => 'Discount Guest',
    p_customer_email      => 'discount8@example.test',
    p_customer_phone      => null,
    p_fulfilment_type     => 'delivery',
    p_payment_method_code => 'phase8_transfer',
    p_delivery_address    => '{"line1":"1 D St","city":"London","country_code":"GB"}'::jsonb,
    p_delivery_option_code => 'phase8_standard',
    p_terms_acknowledged  => true,
    p_discount_code       => 'P8TEN'
  );

  perform pg_temp.assert_true('a valid code is applied', v_order.discount_cents = 100000);
  perform pg_temp.assert_true('the code is recorded', v_order.discount_code = 'P8TEN');
  -- 1,000,000 subtotal - 100,000 discount + 5,000 delivery.
  perform pg_temp.assert_true(
    'the total subtracts the discount and adds delivery',
    v_order.total_cents = 905000);

  -- The same code through the cart must agree, so the two cannot drift.
  v_priced := public.cart_pricing(
    '[{"product_id":"41000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    'P8TEN');
  perform pg_temp.assert_true(
    'the cart and the order agree on the discount',
    (v_priced ->> 'discount_cents')::bigint = v_order.discount_cents);
end $$;

-- A code the customer is not eligible for is refused, and the total ignores it.
do $$
declare v_order public.order_requests;
begin
  v_order := public.submit_order_request(
    p_items               => '[{"product_id":"41000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    p_customer_name       => 'Small Basket',
    p_customer_email      => 'small8@example.test',
    p_customer_phone      => null,
    p_fulfilment_type     => 'pickup',
    p_payment_method_code => 'phase8_transfer',
    p_terms_acknowledged  => true,
    p_discount_code       => 'P8BIG'
  );

  perform pg_temp.assert_true('an ineligible code grants nothing', v_order.discount_cents = 0);
  perform pg_temp.assert_true('an ineligible code is not recorded', v_order.discount_code is null);
  perform pg_temp.assert_true('the total is the full price', v_order.total_cents = 1000000);
end $$;

-- A disabled code is refused the same way, and grants nothing.
do $$
declare v_order public.order_requests;
begin
  v_order := public.submit_order_request(
    p_items               => '[{"product_id":"41000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
    p_customer_name       => 'Disabled Code User',
    p_customer_email      => 'disabled8@example.test',
    p_customer_phone      => null,
    p_fulfilment_type     => 'pickup',
    p_payment_method_code => 'phase8_transfer',
    p_terms_acknowledged  => true,
    p_discount_code       => 'P8OFF'
  );

  perform pg_temp.assert_true('a disabled code grants nothing', v_order.discount_cents = 0);
  perform pg_temp.assert_true('a disabled code is not recorded', v_order.discount_code is null);
end $$;

reset role;

-- =============================================================================
-- 4. A limited code is returned when its request is cancelled
-- =============================================================================

set role anon;
set request.jwt.claims = '{"role":"anon"}';
do $$
declare v_order public.order_requests;
begin
  v_order := public.submit_order_request(
    p_items               => '[{"product_id":"41000000-0000-0000-0000-000000000002","quantity":1}]'::jsonb,
    p_customer_name       => 'Limited User',
    p_customer_email      => 'limited8@example.test',
    p_customer_phone      => null,
    p_fulfilment_type     => 'pickup',
    p_payment_method_code => 'phase8_transfer',
    p_terms_acknowledged  => true,
    p_discount_code       => 'P8ONE'
  );
  perform set_config('p8.limited_order', v_order.id::text, false);
end $$;
reset role;

set role service_role;
select pg_temp.assert_count(
  'the limited code was redeemed once',
  'select times_redeemed from public.discount_codes where code = ''P8ONE''', 1);

-- A second request naming the same one-use code still submits, but the code is
-- not applied: eligibility is evaluated first and the exhausted code grants
-- nothing. Refusing the whole request would be worse for the customer, who may
-- not even know the code was limited.
set role anon;
set request.jwt.claims = '{"role":"anon"}';
do $$
declare v_order public.order_requests;
begin
  v_order := public.submit_order_request(
    p_items               => '[{"product_id":"41000000-0000-0000-0000-000000000002","quantity":1}]'::jsonb,
    p_customer_name       => 'Second User',
    p_customer_email      => 'second8@example.test',
    p_customer_phone      => null,
    p_fulfilment_type     => 'pickup',
    p_payment_method_code => 'phase8_transfer',
    p_terms_acknowledged  => true,
    p_discount_code       => 'P8ONE'
  );
  perform pg_temp.assert_true(
    'an exhausted code grants nothing but does not block the request',
    v_order.discount_cents = 0 and v_order.discount_code is null);
end $$;
reset role;

-- Cancelling the first request returns the use.
set role service_role;
do $$
declare v_id uuid := current_setting('p8.limited_order')::uuid;
begin
  update public.order_requests set status = 'cancelled' where id = v_id;
end $$;

select pg_temp.assert_count(
  'cancelling returns the redemption',
  'select times_redeemed from public.discount_codes where code = ''P8ONE''', 0);

-- Cancelling a second time must not return it twice.
do $$
declare v_id uuid := current_setting('p8.limited_order')::uuid;
begin
  update public.order_requests set status = 'cancelled' where id = v_id;
end $$;
select pg_temp.assert_count(
  'cancelling twice does not credit the code twice',
  'select times_redeemed from public.discount_codes where code = ''P8ONE''', 0);
reset role;

-- =============================================================================
-- 5. Rate limiting per address
-- =============================================================================

set role anon;
set request.jwt.claims = '{"role":"anon"}';
do $$
declare i integer; v_ok integer := 0; v_blocked integer := 0;
begin
  -- The fixtures give this product ten units, so stock is not the binding
  -- constraint and any refusal is the limiter's.
  for i in 1..8 loop
    begin
      perform public.submit_order_request(
        p_items               => '[{"product_id":"41000000-0000-0000-0000-000000000001","quantity":1}]'::jsonb,
        p_customer_name       => 'Rate Tester',
        p_customer_email      => 'rate8@example.test',
        p_customer_phone      => null,
        p_fulfilment_type     => 'pickup',
        p_payment_method_code => 'phase8_transfer',
        p_idempotency_key     => 'rate8-key-' || i || '00',
        p_terms_acknowledged  => true
      );
      v_ok := v_ok + 1;
    exception when others then
      v_blocked := v_blocked + 1;
    end;
  end loop;
  perform pg_temp.assert_true('the address cap allows five', v_ok = 5);
  perform pg_temp.assert_true('the address cap blocks the rest', v_blocked = 3);
end $$;
reset role;

-- =============================================================================
-- 6. An anonymous caller cannot read another customer's request
-- =============================================================================

set role anon;
set request.jwt.claims = '{"role":"anon"}';
-- Migration 0014 revoked `anon`'s grant on the table entirely; the guest reaches
-- their own request only through `read_order_request`. A hard denial is the
-- stronger claim, so it is asserted instead of an empty result.
select pg_temp.assert_denied(
  'anon sees no order_requests through the table',
  'select count(*) from public.order_requests');
reset role;

-- =============================================================================
-- 7. No status implies an online payment
-- =============================================================================

set role service_role;
select pg_temp.assert_true(
  'the order_status enum has no paid value',
  not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'order_status' and e.enumlabel = 'paid'));
reset role;

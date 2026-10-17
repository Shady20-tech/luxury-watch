-- =============================================================================
-- 20 — Customer ownership isolation
--
-- Proves that one customer cannot reach another customer's data, that a customer
-- cannot rewrite the commercial facts of their own order, and that internal notes
-- stay internal even on a record the customer owns.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert_count(
  p_label text,
  p_sql   text,
  p_expected bigint
) returns void
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute p_sql into v_count;
  if v_count <> p_expected then
    raise exception 'FAIL [%]: expected %, got %', p_label, p_expected, v_count;
  end if;
  raise notice 'pass [%]', p_label;
end;
$$;

create or replace function pg_temp.assert_no_effect(
  p_label text,
  p_sql   text
) returns void
language plpgsql
as $$
declare
  v_rows bigint;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL [%]: expected 0 rows affected, got %', p_label, v_rows;
  end if;
  raise notice 'pass [%] (0 rows affected)', p_label;
end;
$$;

create or replace function pg_temp.assert_denied(
  p_label text,
  p_sql   text
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
-- Two customers, one staff member, and data belonging to each.
-- -----------------------------------------------------------------------------

set role service_role;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alice@example.test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'bob@example.test'),
  ('cccccccc-0000-0000-0000-000000000003', 'staff@example.test');

-- The auth trigger should have created profiles automatically.
do $$
declare v_count bigint;
begin
  select count(*) into v_count from public.profiles where email in ('alice@example.test','bob@example.test');
  if v_count <> 2 then
    raise exception 'FAIL: the new-user trigger did not create both profiles (got %)', v_count;
  end if;
  raise notice 'pass [auth trigger creates a profile per user]';
end
$$;

-- The trigger must NOT grant any role. A brand-new account is an ordinary customer.
do $$
declare v_count bigint;
begin
  select count(*) into v_count from public.user_roles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if v_count <> 0 then
    raise exception 'FAIL: a new user was granted % role(s)', v_count;
  end if;
  raise notice 'pass [a new account receives no role]';
end
$$;

insert into public.addresses (id, user_id, recipient_name, line1, city, country_code, is_default) values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alice', '1 Alice St', 'London', 'GB', true),
  ('b1b1b1b1-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Bob', '2 Bob St', 'Paris', 'FR', true);

insert into public.products (id, sku, slug, title, status, published_at, price_on_request)
values ('99999999-0000-0000-0000-000000000009', 'SKU-OWN', 'owned-watch', 'Owned Watch', 'published', now(), true);

insert into public.inventory (product_id, quantity)
values ('99999999-0000-0000-0000-000000000009', 5);

insert into public.order_requests (id, reference, user_id, customer_name, customer_email, fulfilment_type, payment_method_code, status)
values
  ('a0000000-0000-0000-0000-00000000000a', 'LW-TEST-A', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alice', 'alice@example.test', 'pickup', 'bank_transfer', 'submitted'),
  ('b0000000-0000-0000-0000-00000000000b', 'LW-TEST-B', 'bbbbbbbb-0000-0000-0000-000000000002', 'Bob', 'bob@example.test', 'pickup', 'bank_transfer', 'submitted');

insert into public.inquiries (id, type, user_id, name, email, message) values
  ('a1111111-0000-0000-0000-00000000000a', 'general', 'aaaaaaaa-0000-0000-0000-000000000001', 'Alice', 'alice@example.test', 'Alice question'),
  ('b1111111-0000-0000-0000-00000000000b', 'general', 'bbbbbbbb-0000-0000-0000-000000000002', 'Bob', 'bob@example.test', 'Bob question');

insert into public.inquiry_replies (inquiry_id, body, is_internal) values
  ('a1111111-0000-0000-0000-00000000000a', 'A visible reply to Alice', false),
  ('a1111111-0000-0000-0000-00000000000a', 'An INTERNAL note about Alice', true);

insert into public.wishlists (id, user_id) values
  ('a2222222-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001');

reset role;

-- -----------------------------------------------------------------------------
-- Alice signs in.
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select pg_temp.assert_count(
  'Alice sees only her own profile',
  'select count(*) from public.profiles', 1);

select pg_temp.assert_count(
  'Alice sees only her own address',
  'select count(*) from public.addresses', 1);

select pg_temp.assert_count(
  'Alice sees only her own order request',
  'select count(*) from public.order_requests', 1);

select pg_temp.assert_count(
  'Alice sees only her own inquiry',
  'select count(*) from public.inquiries', 1);

select pg_temp.assert_count(
  'Alice sees only her own wishlist',
  'select count(*) from public.wishlists', 1);

-- Alice cannot read Bob's specific rows, even by primary key.
select pg_temp.assert_count(
  'Alice cannot read Bob''s address by id',
  'select count(*) from public.addresses where id = ''b1b1b1b1-0000-0000-0000-000000000002''', 0);

select pg_temp.assert_count(
  'Alice cannot read Bob''s order by reference',
  'select count(*) from public.order_requests where reference = ''LW-TEST-B''', 0);

-- Internal notes must be invisible even though Alice owns the inquiry.
select pg_temp.assert_count(
  'Alice sees the visible reply on her own inquiry',
  'select count(*) from public.inquiry_replies where not is_internal', 1);

select pg_temp.assert_count(
  'Alice cannot see the internal note on her own inquiry',
  'select count(*) from public.inquiry_replies where is_internal', 0);

-- Alice may edit her own profile.
update public.profiles set full_name = 'Alice Updated' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select pg_temp.assert_count(
  'Alice can update her own profile',
  'select count(*) from public.profiles where full_name = ''Alice Updated''', 1);

-- But not Bob's.
select pg_temp.assert_no_effect(
  'Alice cannot update Bob''s profile',
  'update public.profiles set full_name = ''Hacked'' where id = ''bbbbbbbb-0000-0000-0000-000000000002''');

-- She may not change the commercial facts of her own order.
select pg_temp.assert_no_effect(
  'Alice cannot change her own order total',
  'update public.order_requests set total_cents = 1 where reference = ''LW-TEST-A''');

select pg_temp.assert_no_effect(
  'Alice cannot mark her own order paid_offline',
  'update public.order_requests set status = ''paid_offline'' where reference = ''LW-TEST-A''');

select pg_temp.assert_no_effect(
  'Alice cannot write an admin note on her own order',
  'update public.order_requests set admin_note = ''I approve'' where reference = ''LW-TEST-A''');

-- She cannot create an order request directly, only through the RPC.
select pg_temp.assert_denied(
  'Alice cannot insert an order request directly',
  'insert into public.order_requests (customer_name, customer_email, fulfilment_type, payment_method_code) values (''A'', ''a@b.test'', ''pickup'', ''bank_transfer'')');

-- She cannot read the stock ledger.
select pg_temp.assert_count(
  'Alice cannot read inventory_transactions',
  'select count(*) from public.inventory_transactions', 0);

select pg_temp.assert_count(
  'Alice cannot read contact_submissions',
  'select count(*) from public.contact_submissions', 0);

reset role;

-- -----------------------------------------------------------------------------
-- Bob signs in and confirms the isolation is symmetric.
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';

select pg_temp.assert_count(
  'Bob sees only his own address',
  'select count(*) from public.addresses where recipient_name = ''Bob''', 1);

select pg_temp.assert_count(
  'Bob cannot read Alice''s address',
  'select count(*) from public.addresses where recipient_name = ''Alice''', 0);

select pg_temp.assert_count(
  'Bob cannot read Alice''s order',
  'select count(*) from public.order_requests where reference = ''LW-TEST-A''', 0);

-- Bob is not staff, so he sees no audit logs and no media.
select pg_temp.assert_count(
  'Bob cannot read admin_audit_logs',
  'select count(*) from public.admin_audit_logs', 0);

select pg_temp.assert_count(
  'Bob cannot read media',
  'select count(*) from public.media', 0);

reset role;

drop function pg_temp.assert_count(text, text, bigint);
drop function pg_temp.assert_no_effect(text, text);
drop function pg_temp.assert_denied(text, text);

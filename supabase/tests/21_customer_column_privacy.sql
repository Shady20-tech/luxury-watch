-- =============================================================================
-- 21 — Column privacy on customer-readable tables
--
-- Regression suite for the defect migration 0014 fixes.
--
-- RLS restricts rows, not columns. Before 0014 every customer-facing table still
-- carried a table-level `select` grant, so a customer reading their own row read
-- every column of it — including `order_requests.admin_note` (the
-- administrator's private note about that customer), the guest
-- `access_token_hash`, and the spam-mitigation `ip_hash` / `user_agent`.
--
-- A row-level test cannot catch that: the row is correctly scoped to the owner
-- and the assertion "Alice sees exactly one order" passes while the note leaks.
-- So these assertions are about columns, and they assert a hard denial rather
-- than an empty value. A policy that filters a column to null would still be a
-- leak in a different shape.
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
-- Fixtures. Unique ids so this suite does not collide with 20 or 40.
-- -----------------------------------------------------------------------------

set role service_role;

insert into auth.users (id, email) values
  ('d1d1d1d1-0000-0000-0000-0000000000d1', 'carol@example.test'),
  ('d1d1d1d1-0000-0000-0000-0000000000d5', 'staffactor@example.test');

-- Seed the offline method this order references. `on conflict do nothing` so the
-- suite is self-sufficient whether or not suite 10 ran first — an implicit
-- ordering dependency is a test that passes for the wrong reason.
insert into public.payment_methods (code, label, is_enabled) values
  ('bank_transfer', 'Bank transfer', true)
on conflict (code) do nothing;

insert into public.order_requests (
  id, reference, user_id, customer_name, customer_email,
  fulfilment_type, payment_method_code, status,
  admin_note, access_token_hash, ip_hash, user_agent, idempotency_key,
  customer_note, subtotal_cents, total_cents
) values (
  'd1d1d1d1-0000-0000-0000-0000000000d2', 'LW-TEST-C',
  'd1d1d1d1-0000-0000-0000-0000000000d1', 'Carol', 'carol@example.test',
  'pickup', 'bank_transfer', 'submitted',
  'INTERNAL: do not discount for Carol', repeat('b', 64), 'ip-secret-hash',
  'spam-bot/1.0', 'idem-carol-0001',
  'Please call before 6pm', 0, 0
);

insert into public.order_request_items (
  order_request_id, product_title_snapshot, sku_snapshot, unit_price_cents, quantity, line_total_cents
) values (
  'd1d1d1d1-0000-0000-0000-0000000000d2', 'Carol Watch', 'SKU-CAROL', 100000, 1, 100000
);

insert into public.order_request_events (
  order_request_id, from_status, to_status, note, actor_id, actor_label
) values (
  'd1d1d1d1-0000-0000-0000-0000000000d2', 'under_review', 'paid_offline', 'Request received',
  'd1d1d1d1-0000-0000-0000-0000000000d5', 'staffactor@example.test'
);

insert into public.inquiries (id, type, user_id, name, email, message, ip_hash, user_agent, assigned_to) values
  ('d1d1d1d1-0000-0000-0000-0000000000d3', 'general',
   'd1d1d1d1-0000-0000-0000-0000000000d1', 'Carol', 'carol@example.test',
   'Carol question', 'ip-secret-hash', 'spam-bot/1.0',
   'd1d1d1d1-0000-0000-0000-0000000000d5');

insert into public.appointments (
  id, user_id, name, email, requested_at, status, customer_note, staff_note, assigned_to
) values (
  'd1d1d1d1-0000-0000-0000-0000000000d4', 'd1d1d1d1-0000-0000-0000-0000000000d1',
  'Carol', 'carol@example.test', now(), 'requested',
  'I would like to see the Milgauss', 'STAFF: Carol is a VIP, waive the fee',
  'd1d1d1d1-0000-0000-0000-0000000000d5');

reset role;

-- -----------------------------------------------------------------------------
-- Carol signs in.
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"d1d1d1d1-0000-0000-0000-0000000000d1","role":"authenticated"}';

-- -----------------------------------------------------------------------------
-- 1. The columns the customer is entitled to
--
-- Proving these still work is the point of the suite. A "fix" that denied
-- everything would pass the denials below and break the account portal.
-- -----------------------------------------------------------------------------

select pg_temp.assert_count(
  'the customer reads their own order',
  'select count(*) from public.order_requests where reference = ''LW-TEST-C''', 1);

select pg_temp.assert_count(
  'the customer reads their own order items',
  'select count(*) from public.order_request_items', 1);

select pg_temp.assert_count(
  'the customer reads the order timeline',
  'select count(*) from public.order_request_events', 1);

select pg_temp.assert_count(
  'the customer reads their own appointment',
  'select count(*) from public.appointments', 1);

select pg_temp.assert_count(
  'the customer reads their own inquiry',
  'select count(*) from public.inquiries', 1);

-- The customer-facing columns must be genuinely readable, not merely present.
select pg_temp.assert_count(
  'the order total is readable',
  'select count(*) from public.order_requests where total_cents = 0', 1);

select pg_temp.assert_count(
  'the customer''s own note is readable',
  'select count(*) from public.order_requests where customer_note = ''Please call before 6pm''', 1);

select pg_temp.assert_count(
  'the timeline note is readable',
  'select count(*) from public.order_request_events where note = ''Request received''', 1);

select pg_temp.assert_count(
  'the customer''s own appointment note is readable',
  'select count(*) from public.appointments where customer_note like ''I would like%''', 1);

-- -----------------------------------------------------------------------------
-- 2. The columns the customer must never read
--
-- Each of these is on a row the customer legitimately owns. The row policy
-- allows the row; the column grant is what stops the read.
-- -----------------------------------------------------------------------------

select pg_temp.assert_denied(
  'the admin note on the customer''s own order is unreadable',
  'select admin_note from public.order_requests');

select pg_temp.assert_denied(
  'the guest access token hash is unreadable',
  'select access_token_hash from public.order_requests');

select pg_temp.assert_denied(
  'the order ip hash is unreadable',
  'select ip_hash from public.order_requests');

select pg_temp.assert_denied(
  'the order user agent is unreadable',
  'select user_agent from public.order_requests');

select pg_temp.assert_denied(
  'the idempotency key is unreadable',
  'select idempotency_key from public.order_requests');

select pg_temp.assert_denied(
  'the staff member who settled the order is unreadable',
  'select settled_offline_by from public.order_requests');

select pg_temp.assert_denied(
  'the inquiry ip hash is unreadable',
  'select ip_hash from public.inquiries');

select pg_temp.assert_denied(
  'the inquiry user agent is unreadable',
  'select user_agent from public.inquiries');

select pg_temp.assert_denied(
  'the staff member assigned to the inquiry is unreadable',
  'select assigned_to from public.inquiries');

select pg_temp.assert_denied(
  'the staff note on the customer''s own appointment is unreadable',
  'select staff_note from public.appointments');

select pg_temp.assert_denied(
  'the timeline actor id is unreadable',
  'select actor_id from public.order_request_events');

select pg_temp.assert_denied(
  'the timeline actor label is unreadable',
  'select actor_label from public.order_request_events');

-- -----------------------------------------------------------------------------
-- 3. `select *` must fail loudly
--
-- The standing obligation in AGENTS.md: a query that asks for everything must
-- break rather than silently return whatever the grant happens to allow. If this
-- ever starts succeeding, someone re-added a table-level grant.
-- -----------------------------------------------------------------------------

select pg_temp.assert_denied(
  'select * on order_requests fails loudly',
  'select count(*) from (select * from public.order_requests) t');

select pg_temp.assert_denied(
  'select * on appointments fails loudly',
  'select count(*) from (select * from public.appointments) t');

-- -----------------------------------------------------------------------------
-- 4. A customer still cannot reach another customer's rows
--
-- Column grants do not replace RLS, and this is the check that they did not
-- accidentally widen anything.
-- -----------------------------------------------------------------------------

select pg_temp.assert_count(
  'the customer sees only their own order',
  'select count(*) from public.order_requests', 1);

select pg_temp.assert_count(
  'the customer sees only their own appointment',
  'select count(*) from public.appointments', 1);

reset role;

-- -----------------------------------------------------------------------------
-- 5. service_role keeps the full row
--
-- The admin screens read these columns, so the restriction must not have
-- followed the table into the privileged role.
-- -----------------------------------------------------------------------------

set role service_role;

select pg_temp.assert_count(
  'service_role still reads the admin note',
  'select count(*) from public.order_requests where admin_note like ''INTERNAL:%''', 1);

select pg_temp.assert_count(
  'service_role still reads the staff note',
  'select count(*) from public.appointments where staff_note like ''STAFF:%''', 1);

reset role;

drop function pg_temp.assert_count(text, text, bigint);
drop function pg_temp.assert_denied(text, text);

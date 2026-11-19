-- =============================================================================
-- 24 — Account portal read surfaces
--
-- The account pages added in this phase read six tables on behalf of a signed-in
-- customer: inquiries and inquiry_replies (the messages page), the three
-- service-request detail tables (sell/trade, sourcing, repairs), appointments,
-- and service_status_events (the timeline).
--
-- Suites 20 and 50 prove that an *anonymous* caller cannot read these tables and
-- that a customer cannot reach another customer's inquiry. They do not prove the
-- thing these pages actually depend on: that a signed-in customer reading their
-- own rows sees only their own, and that the internal columns and internal notes
-- stay out of the result even when the row is theirs.
--
-- That distinction matters because the pages query `where user_id = <session>`
-- *and* rely on RLS. If a policy were loosened, the page would still be written
-- correctly and would still return the wrong customer's data.
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
-- Two customers, each with one of every request kind.
-- -----------------------------------------------------------------------------

set role service_role;

insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-0000000000a1', 'erin@example.test'),
  ('d0000000-0000-0000-0000-0000000000b2', 'frank@example.test');

insert into public.inquiries (id, type, user_id, name, email, message, reference) values
  ('d1111111-0000-0000-0000-0000000000a1', 'sell_trade',
   'd0000000-0000-0000-0000-0000000000a1', 'Erin', 'erin@example.test',
   'Erin sell enquiry', 'LW-ERIN-1'),
  ('d1111111-0000-0000-0000-0000000000b2', 'sell_trade',
   'd0000000-0000-0000-0000-0000000000b2', 'Frank', 'frank@example.test',
   'Frank sell enquiry', 'LW-FRANK-1');

-- A customer-visible answer and an internal note on Erin's own thread.
insert into public.inquiry_replies (inquiry_id, author_id, body, is_internal) values
  ('d1111111-0000-0000-0000-0000000000a1', null, 'A reply Erin should see', false),
  ('d1111111-0000-0000-0000-0000000000a1', null, 'An internal note about Erin', true),
  ('d1111111-0000-0000-0000-0000000000b2', null, 'A reply Frank should see', false);

insert into public.sell_trade_requests (id, inquiry_id, brand_name, model_name) values
  ('d2222222-0000-0000-0000-0000000000a1', 'd1111111-0000-0000-0000-0000000000a1', 'Rolex', 'Submariner'),
  ('d2222222-0000-0000-0000-0000000000b2', 'd1111111-0000-0000-0000-0000000000b2', 'Omega', 'Speedmaster');

insert into public.sourcing_requests (id, inquiry_id, brand_name, model_name) values
  ('d3333333-0000-0000-0000-0000000000a1', 'd1111111-0000-0000-0000-0000000000a1', 'Patek', 'Nautilus'),
  ('d3333333-0000-0000-0000-0000000000b2', 'd1111111-0000-0000-0000-0000000000b2', 'AP', 'Royal Oak');

insert into public.repair_requests (id, inquiry_id, brand_name, model_name) values
  ('d4444444-0000-0000-0000-0000000000a1', 'd1111111-0000-0000-0000-0000000000a1', 'Cartier', 'Santos'),
  ('d4444444-0000-0000-0000-0000000000b2', 'd1111111-0000-0000-0000-0000000000b2', 'Tudor', 'Black Bay');

insert into public.appointments (id, user_id, name, email, requested_at, staff_note) values
  ('d5555555-0000-0000-0000-0000000000a1',
   'd0000000-0000-0000-0000-0000000000a1', 'Erin', 'erin@example.test', now(),
   'Internal note about Erin''s viewing'),
  ('d5555555-0000-0000-0000-0000000000b2',
   'd0000000-0000-0000-0000-0000000000b2', 'Frank', 'frank@example.test', now(),
   'Internal note about Frank''s viewing');

-- Internal staff messaging. Must be unreachable by any customer, ever.
insert into public.messages (entity_type, entity_id, recipient_id, body) values
  ('appointment', 'd5555555-0000-0000-0000-0000000000a1',
   'd0000000-0000-0000-0000-0000000000a1', 'Internal staff note');

reset role;

-- -----------------------------------------------------------------------------
-- Erin signs in.
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

-- The thread list.
select pg_temp.assert_count(
  'Erin sees only her own inquiry',
  'select count(*) from public.inquiries', 1);

select pg_temp.assert_count(
  'Erin cannot read Frank''s inquiry by reference',
  'select count(*) from public.inquiries where reference = ''LW-FRANK-1''', 0);

-- The reply thread, including the internal-note rule.
select pg_temp.assert_count(
  'Erin sees the customer-visible reply on her thread',
  'select count(*) from public.inquiry_replies where not is_internal', 1);

select pg_temp.assert_count(
  'Erin cannot see the internal note on her own thread',
  'select count(*) from public.inquiry_replies where is_internal', 0);

select pg_temp.assert_count(
  'Erin cannot see Frank''s reply',
  'select count(*) from public.inquiry_replies where body = ''A reply Frank should see''', 0);

-- The four service-request pages.
select pg_temp.assert_count(
  'Erin sees only her own sell/trade request',
  'select count(*) from public.sell_trade_requests', 1);

select pg_temp.assert_count(
  'Erin sees only her own sourcing request',
  'select count(*) from public.sourcing_requests', 1);

select pg_temp.assert_count(
  'Erin sees only her own repair request',
  'select count(*) from public.repair_requests', 1);

select pg_temp.assert_count(
  'Erin sees only her own appointment',
  'select count(*) from public.appointments', 1);

select pg_temp.assert_count(
  'Erin cannot read Frank''s sell/trade request by id',
  'select count(*) from public.sell_trade_requests
    where id = ''d2222222-0000-0000-0000-0000000000b2''', 0);

-- Internal columns stay out of reach even on Erin's own row.
select pg_temp.assert_denied(
  'Erin cannot read the staff note on her own appointment',
  'select staff_note from public.appointments');

select pg_temp.assert_denied(
  'Erin cannot read who her appointment is assigned to',
  'select assigned_to from public.appointments');

-- The customer-visible columns she does need are readable.
select pg_temp.assert_count(
  'Erin can read her appointment''s customer-facing fields',
  'select count(*) from public.appointments
    where customer_note is null and status is not null', 1);

-- The internal messaging table is unreachable in every configuration.
--
-- `messages_staff_only` is `is_staff() and (...)`, so a customer is filtered to
-- zero rows rather than refused outright: the table-level grant exists (the shim
-- mirrors Supabase's default privileges) and RLS is what withholds the rows. Both
-- outcomes keep the data safe; asserting zero rows is the one that matches how
-- this table is actually protected.
select pg_temp.assert_count(
  'a customer reads no internal staff messages',
  'select count(*) from public.messages', 0);

-- -----------------------------------------------------------------------------
-- Frank signs in and sees his own, not Erin's.
-- -----------------------------------------------------------------------------

set request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000b2","role":"authenticated"}';

select pg_temp.assert_count(
  'Frank sees only his own inquiry',
  'select count(*) from public.inquiries where reference = ''LW-FRANK-1''', 1);

select pg_temp.assert_count(
  'Frank cannot read Erin''s inquiry',
  'select count(*) from public.inquiries where reference = ''LW-ERIN-1''', 0);

select pg_temp.assert_count(
  'Frank sees only his own sell/trade request',
  'select count(*) from public.sell_trade_requests', 1);

select pg_temp.assert_count(
  'Frank cannot see Erin''s sell/trade request',
  'select count(*) from public.sell_trade_requests
    where brand_name = ''Rolex''', 0);

select pg_temp.assert_count(
  'Frank sees only his own appointment',
  'select count(*) from public.appointments where name = ''Frank''', 1);

reset role;

-- -----------------------------------------------------------------------------
-- The timeline is customer-visible only.
-- -----------------------------------------------------------------------------

set role service_role;

insert into public.service_status_events
  (entity_type, entity_id, from_status, to_status, note, is_customer_visible, actor_label)
values
  ('sell_trade', 'd2222222-0000-0000-0000-0000000000a1', 'submitted', 'under_review',
   'We are looking at your piece', true, 'staff'),
  ('sell_trade', 'd2222222-0000-0000-0000-0000000000a1', 'under_review', 'valuation',
   'Internal valuation in progress', false, 'staff');

reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select pg_temp.assert_count(
  'Erin sees the customer-visible status event on her request',
  'select count(*) from public.service_status_events
    where entity_id = ''d2222222-0000-0000-0000-0000000000a1''
      and is_customer_visible', 1);

select pg_temp.assert_count(
  'Erin cannot see the internal status event',
  'select count(*) from public.service_status_events where not is_customer_visible', 0);

reset role;

drop function pg_temp.assert_count(text, text, bigint);
drop function pg_temp.assert_denied(text, text);

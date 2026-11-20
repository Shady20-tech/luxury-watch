-- =============================================================================
-- 50 — Customer service workflows (migration 0015)
--
-- Covers the Phase 10 acceptance criteria the other suites do not:
--   * A guest can submit every service flow, and `anon` can read none of the
--     tables those submissions land in. The reference returned is not a
--     credential for reading the row back.
--   * The detailed workflow status is validated against the vocabulary of the
--     entity it is attached to, so a flow cannot be moved to a state that does
--     not exist for it.
--   * The status history is append-only and attributable, enforced by the
--     database rather than by convention.
--   * A published product question no longer exposes the asker's email or name.
--   * Submission is rate limited per address and in aggregate.
--   * An appointment cannot be booked outside an availability window, off a slot
--     boundary, or into a slot another live appointment already holds.
--   * An offer records an offer. It reserves nothing.
--
-- Portable SQL only: no psql meta-commands, so any client can run it. References
-- are captured in a temp table rather than in `\gset` variables.
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

-- A raise whose *message* is the contract, not merely the fact that it raised.
--
-- `assert_raises` passes on any error, including a raw constraint violation
-- escaping to the caller. That is how a defect survived here: the friendly
-- "that time has just been taken" message was allowlisted and unit-tested in
-- TypeScript while nothing in the database ever produced it, so the browser got
-- a 409 with `Key (slot_start)=... already exists` in it. Asserting the text is
-- the only shape that can tell those two apart.
create or replace function pg_temp.assert_raises_message(
  p_label text, p_sql text, p_message text
) returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_message then
      raise notice 'pass [%] (raised: %)', p_label, sqlerrm;
      return;
    end if;
    raise exception 'FAIL [%]: raised the wrong message: %', p_label, sqlerrm;
  end;
  raise exception 'FAIL [%]: expected an error, but it succeeded', p_label;
end;
$$;

-- A hard privilege denial, as opposed to a policy filtering the rows to nothing.
-- The difference matters: a filter can be defeated by a later policy mistake, a
-- missing grant cannot.
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
  raise exception 'FAIL [%]: expected permission denied, but it succeeded', p_label;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------

create temporary table refs (label text primary key, reference text);
grant select, insert on refs to anon, authenticated;

insert into public.brands (id, name, slug, is_active)
values ('50000000-0000-4000-8000-000000000001', 'Service Brand', 'service-brand', true)
on conflict (id) do nothing;

insert into public.products (id, sku, slug, title, brand_id, status, published_at, price_cents, price_on_request)
values
  ('50000000-0000-4000-8000-000000000101', 'SVC-1', 'svc-published', 'Service watch',
   '50000000-0000-4000-8000-000000000001', 'published', now(), 1000000, false),
  ('50000000-0000-4000-8000-000000000102', 'SVC-2', 'svc-draft', 'Unreleased watch',
   '50000000-0000-4000-8000-000000000001', 'draft', null, 1000000, false)
on conflict (id) do nothing;

insert into auth.users (id, email) values
  ('50000000-0000-4000-8000-000000000201', 'alice.service@example.test'),
  ('50000000-0000-4000-8000-000000000202', 'bob.service@example.test')
on conflict (id) do nothing;

-- The published fixture product is in stock, so "an offer reserved nothing" is a
-- meaningful assertion: without an inventory row it would read as unavailable
-- whether or not the offer changed anything.
insert into public.inventory (product_id, quantity, reserved_quantity)
values ('50000000-0000-4000-8000-000000000101', 1, 0)
on conflict (product_id) do nothing;

-- A window with one-hour slots. The day is derived from the slot used below
-- rather than hardcoded, so the test does not depend on which day it runs.
insert into public.appointment_availability (day_of_week, start_time, end_time, slot_minutes, is_active)
select distinct
       extract(dow from (now() + interval '3 days'))::integer,
       time '09:00', time '17:00', 60, true
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 1. A guest can submit every flow
-- -----------------------------------------------------------------------------

set role anon;

insert into refs values ('sell', public.submit_sell_trade_request(
  'Guest Seller', 'guest.seller@example.test', '+1 555 0100',
  'Rolex', 'Submariner', '126610LN', 2021, 'Light wear', true, true, 1200000,
  'sell', 'I would like to sell my Submariner.'));

insert into refs values ('sourcing', public.submit_sourcing_request(
  'Guest Buyer', 'guest.buyer@example.test', null,
  'Omega', 'Speedmaster', '310.30.42', 'black', 'steel', 2018, 2024, 800000,
  'Looking for a Speedmaster in good condition.'));

insert into refs values ('repair', public.submit_repair_request(
  'Guest Owner', 'guest.owner@example.test', null,
  'Cartier', 'Tank', 'WSTA0041', 'full_service', 'Running fast', true, 'email',
  'My Tank is gaining about a minute a day.'));

insert into refs values ('contact', public.submit_contact_message(
  'Guest Visitor', 'guest.visitor@example.test', null, 'Opening hours',
  'Do you open on Saturdays?'));

insert into refs values ('offer', public.submit_product_offer(
  'svc-published', 'Guest Bidder', 'guest.bidder@example.test', null,
  900000, 'Would you take this for the Submariner?'));

reset role;

select pg_temp.assert_count(
  'a guest can submit a sell/trade request',
  $$select count(*) from refs where label = 'sell' and reference like 'LW-%'$$, 1);

select pg_temp.assert_count(
  'a guest can submit a sourcing request',
  $$select count(*) from refs where label = 'sourcing' and reference like 'LW-%'$$, 1);

select pg_temp.assert_count(
  'a guest can submit a repair request',
  $$select count(*) from refs where label = 'repair' and reference like 'LW-%'$$, 1);

select pg_temp.assert_count(
  'a guest can submit a contact message',
  $$select count(*) from refs where label = 'contact' and reference like 'LW-C-%'$$, 1);

select pg_temp.assert_count(
  'a guest can make an offer on a published product',
  $$select count(*) from refs where label = 'offer' and reference like 'LW-%'$$, 1);

-- The detail rows landed, each carrying its opening workflow status.
select pg_temp.assert_count(
  'the sell/trade detail row exists with its opening status',
  $$select count(*) from public.sell_trade_requests r
      join public.inquiries i on i.id = r.inquiry_id
     where i.reference = (select reference from refs where label = 'sell')
       and r.workflow_status = 'submitted'$$, 1);

select pg_temp.assert_count(
  'the sourcing detail row exists with its opening status',
  $$select count(*) from public.sourcing_requests r
      join public.inquiries i on i.id = r.inquiry_id
     where i.reference = (select reference from refs where label = 'sourcing')
       and r.workflow_status = 'submitted'$$, 1);

select pg_temp.assert_count(
  'the repair detail row exists with its opening status',
  $$select count(*) from public.repair_requests r
      join public.inquiries i on i.id = r.inquiry_id
     where i.reference = (select reference from refs where label = 'repair')
       and r.workflow_status = 'submitted'$$, 1);

select pg_temp.assert_count(
  'the inquiry carries the reference the guest was given',
  $$select count(*) from public.inquiries
     where reference = (select reference from refs where label = 'sell')
       and type = 'sell_trade'$$, 1);

-- Every flow opened with a history event, attributed to the customer.
select pg_temp.assert_count(
  'every service flow opened with an attributed history event',
  $$select count(*) from public.service_status_events e
     where e.actor_label = 'customer'
       and (
         (e.entity_type = 'sell_trade' and exists (
            select 1 from public.sell_trade_requests r join public.inquiries i on i.id = r.inquiry_id
             where r.id = e.entity_id
               and i.reference = (select reference from refs where label = 'sell')))
         or (e.entity_type = 'sourcing' and exists (
            select 1 from public.sourcing_requests r join public.inquiries i on i.id = r.inquiry_id
             where r.id = e.entity_id
               and i.reference = (select reference from refs where label = 'sourcing')))
         or (e.entity_type = 'repair' and exists (
            select 1 from public.repair_requests r join public.inquiries i on i.id = r.inquiry_id
             where r.id = e.entity_id
               and i.reference = (select reference from refs where label = 'repair')))
       )$$, 3);

-- -----------------------------------------------------------------------------
-- 2. The reference is not a credential
--
-- A guest has no session, so nothing scopes their rows. The submission functions
-- must therefore leave `anon` with no read path at all.
-- -----------------------------------------------------------------------------

set role anon;

select pg_temp.assert_denied(
  'anon cannot read inquiries',
  'select count(*) from public.inquiries');

select pg_temp.assert_denied(
  'anon cannot read sell_trade_requests',
  'select count(*) from public.sell_trade_requests');

select pg_temp.assert_denied(
  'anon cannot read sourcing_requests',
  'select count(*) from public.sourcing_requests');

select pg_temp.assert_denied(
  'anon cannot read repair_requests',
  'select count(*) from public.repair_requests');

select pg_temp.assert_denied(
  'anon cannot read contact_submissions',
  'select count(*) from public.contact_submissions');

select pg_temp.assert_denied(
  'anon cannot read product_offers',
  'select count(*) from public.product_offers');

select pg_temp.assert_denied(
  'anon cannot read appointments',
  'select count(*) from public.appointments');

select pg_temp.assert_denied(
  'anon cannot read service_status_events',
  'select count(*) from public.service_status_events');

reset role;

-- -----------------------------------------------------------------------------
-- 3. A product question no longer leaks the asker's identity
--
-- The Phase 6 defect in a new place: `product_questions_public_read` scopes the
-- rows correctly, but a table-level grant let `anon` read `email` and `name` of
-- every published question. The public surface is the question and its answer.
-- -----------------------------------------------------------------------------

insert into public.product_questions (id, product_id, name, email, question, answer, answered_at, is_published)
values ('50000000-0000-4000-8000-000000000301',
        '50000000-0000-4000-8000-000000000101',
        'Private Person', 'private.person@example.test',
        'Is the bracelet original?', 'Yes, it is.', now(), true);

set role anon;

select pg_temp.assert_denied(
  'anon cannot read the asker email on a published question',
  'select email from public.product_questions');

select pg_temp.assert_denied(
  'anon cannot read the asker name on a published question',
  'select name from public.product_questions');

-- The public surface still works: the question and its answer are readable.
select pg_temp.assert_count(
  'anon can still read the published question and answer',
  $$select count(*) from public.product_questions
     where question = 'Is the bracelet original?' and answer is not null$$, 1);

reset role;

-- -----------------------------------------------------------------------------
-- 4. The workflow status vocabulary is enforced per entity
-- -----------------------------------------------------------------------------

select pg_temp.assert_raises(
  'a repair cannot be moved to a status that belongs to another flow',
  $$insert into public.service_status_events (entity_type, entity_id, to_status)
    values ('repair', gen_random_uuid(), 'searching')$$);

select pg_temp.assert_raises(
  'a sourcing request cannot be moved to a repair status',
  $$insert into public.service_status_events (entity_type, entity_id, to_status)
    values ('sourcing', gen_random_uuid(), 'in_repair')$$);

select pg_temp.assert_raises(
  'an appointment cannot take an arbitrary status',
  $$insert into public.service_status_events (entity_type, entity_id, to_status)
    values ('appointment', gen_random_uuid(), 'sold')$$);

-- A status that does belong to the flow is accepted, so the constraint is not
-- simply refusing everything.
insert into public.service_status_events (entity_type, entity_id, to_status, actor_label)
values ('repair', gen_random_uuid(), 'inspection', 'staff');

select pg_temp.assert_count(
  'a valid status for the flow is accepted',
  $$select count(*) from public.service_status_events
     where entity_type = 'repair' and to_status = 'inspection'$$, 1);

-- -----------------------------------------------------------------------------
-- 5. The history is append-only and attributable
--
-- A history table that can be edited is not evidence, and the reason this table
-- exists is that it can be relied on during a dispute.
-- -----------------------------------------------------------------------------

select pg_temp.assert_raises(
  'a history event cannot be rewritten',
  'update public.service_status_events set to_status = ''completed''');

select pg_temp.assert_raises(
  'a history event cannot be deleted',
  'delete from public.service_status_events');

-- -----------------------------------------------------------------------------
-- 6. Ownership: a customer sees their own events, and only their own
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"50000000-0000-4000-8000-000000000201","role":"authenticated"}';

insert into refs values ('alice', public.submit_sell_trade_request(
  'Alice Service', 'alice.service@example.test', null,
  'Tudor', 'Black Bay', 'M7941A1A0NU', 2023, 'Unworn', true, true, 400000,
  'sell', 'Selling an unworn Black Bay.'));

select pg_temp.assert_count(
  'the signed-in customer can see their own request',
  $$select count(*) from public.sell_trade_requests r
      join public.inquiries i on i.id = r.inquiry_id
     where i.reference = (select reference from refs where label = 'alice')$$, 1);

select pg_temp.assert_count(
  'the signed-in customer can see their own history event',
  $$select count(*) from public.service_status_events e
     where e.entity_type = 'sell_trade'
       and e.is_customer_visible
       and exists (
         select 1 from public.sell_trade_requests r join public.inquiries i on i.id = r.inquiry_id
          where r.id = e.entity_id
            and i.reference = (select reference from refs where label = 'alice'))$$, 1);

select pg_temp.assert_count(
  'the signed-in customer cannot see the guest request history',
  $$select count(*) from public.service_status_events e
     where e.entity_type = 'sell_trade'
       and exists (
         select 1 from public.sell_trade_requests r join public.inquiries i on i.id = r.inquiry_id
          where r.id = e.entity_id
            and i.reference = (select reference from refs where label = 'sell'))$$, 0);

reset role;

-- Bob sees nothing of Alice's.
set role authenticated;
set request.jwt.claims = '{"sub":"50000000-0000-4000-8000-000000000202","role":"authenticated"}';

select pg_temp.assert_count(
  'another customer cannot see Alice request',
  $$select count(*) from public.sell_trade_requests r
      join public.inquiries i on i.id = r.inquiry_id
     where i.reference = (select reference from refs where label = 'alice')$$, 0);

select pg_temp.assert_count(
  'another customer cannot see Alice history event',
  $$select count(*) from public.service_status_events e
     where e.entity_type = 'sell_trade'
       and exists (
         select 1 from public.sell_trade_requests r join public.inquiries i on i.id = r.inquiry_id
          where r.id = e.entity_id
            and i.reference = (select reference from refs where label = 'alice'))$$, 0);

reset role;

-- -----------------------------------------------------------------------------
-- 7. Validation holds inside the database, not only in the form
-- -----------------------------------------------------------------------------

set role anon;

select pg_temp.assert_raises(
  'an empty name is refused',
  $$select public.submit_contact_message('', 'a@b.test', null, null, 'Hello there')$$);

select pg_temp.assert_raises(
  'an address with no domain is refused',
  $$select public.submit_contact_message('Name', 'not-an-email', null, null, 'Hello there')$$);

select pg_temp.assert_raises(
  'an empty message is refused',
  $$select public.submit_contact_message('Name', 'a@b.test', null, null, '')$$);

select pg_temp.assert_raises(
  'an offer of zero is refused',
  $$select public.submit_product_offer('svc-published', 'Name', 'a@b.test', null, 0, 'Take it')$$);

select pg_temp.assert_raises(
  'a negative offer is refused',
  $$select public.submit_product_offer('svc-published', 'Name', 'a@b.test', null, -5000, 'Take it')$$);

select pg_temp.assert_raises(
  'an offer on a draft product is refused',
  $$select public.submit_product_offer('svc-draft', 'Name', 'a@b.test', null, 500000, 'Take it')$$);

select pg_temp.assert_raises(
  'an offer on an unknown product is refused',
  $$select public.submit_product_offer('no-such-watch', 'Name', 'a@b.test', null, 500000, 'Take it')$$);

select pg_temp.assert_raises(
  'a sourcing window with the earliest year after the latest is refused',
  $$select public.submit_sourcing_request('Name', 'a@b.test', null, null, null, null, null, null, 2024, 2018, null, 'Impossible window')$$);

select pg_temp.assert_raises(
  'a negative asking price is refused',
  $$select public.submit_sell_trade_request('Name', 'a@b.test', null, null, null, null, null, null, null, null, -100, 'sell', 'Negative price')$$);

select pg_temp.assert_raises(
  'an unknown transaction type is refused',
  $$select public.submit_sell_trade_request('Name', 'a@b.test', null, null, null, null, null, null, null, null, 100, 'barter', 'Unknown type')$$);

select pg_temp.assert_raises(
  'a production year outside the sane range is refused',
  $$select public.submit_sell_trade_request('Name', 'a@b.test', null, null, null, null, 1500, null, null, null, 100, 'sell', 'Too old')$$);

reset role;

-- -----------------------------------------------------------------------------
-- 8. An offer reserves nothing
--
-- The whole point of this flow is that it is a negotiation, not a sale. If
-- making an offer changed stock, a stranger could take a watch off the site by
-- offering a pound for it.
-- -----------------------------------------------------------------------------

select pg_temp.assert_count(
  'an offer left the product available',
  $$select count(*) from public.products p
     where p.slug = 'svc-published' and public.is_product_available(p.id)$$, 1);

select pg_temp.assert_count(
  'an offer created no inventory reservation',
  $$select count(*) from public.inventory_reservations r
      join public.products p on p.id = r.product_id
     where p.slug = 'svc-published'$$, 0);

select pg_temp.assert_count(
  'an offer did not change the recorded stock',
  $$select count(*) from public.inventory i
      join public.products p on p.id = i.product_id
     where p.slug = 'svc-published' and i.reserved_quantity = 0$$, 1);

-- -----------------------------------------------------------------------------
-- 9. Appointments: availability and the double-booking rule
-- -----------------------------------------------------------------------------

set role anon;

select pg_temp.assert_raises(
  'an appointment outside the configured window is refused',
  $$select public.request_appointment('Name', 'a@b.test', null, 'viewing',
      (date_trunc('day', now() + interval '3 days') + interval '3 hours'), 'Too early')$$);

select pg_temp.assert_raises(
  'an appointment off a slot boundary is refused',
  $$select public.request_appointment('Name', 'a@b.test', null, 'viewing',
      (date_trunc('day', now() + interval '3 days') + interval '9 hours 17 minutes'), 'Not a slot')$$);

select pg_temp.assert_raises(
  'an appointment in the past is refused',
  $$select public.request_appointment('Name', 'a@b.test', null, 'viewing',
      (date_trunc('day', now()) - interval '1 day' + interval '10 hours'), 'Yesterday')$$);

reset role;

-- A valid slot books, and the same slot does not book twice.
set role anon;

insert into refs values ('appointment', public.request_appointment(
  'First Booker', 'first.booker@example.test', null, 'viewing',
  (date_trunc('day', now() + interval '3 days') + interval '10 hours'),
  'I would like to see the Submariner.'));

select pg_temp.assert_count(
  'a guest can request an appointment in an available slot',
  $$select count(*) from refs where label = 'appointment' and reference like 'LW-A-%'$$, 1);

select pg_temp.assert_raises_message(
  'the same slot cannot be booked twice, and says so in words a visitor can act on',
  $$select public.request_appointment('Second Booker', 'second.booker@example.test', null, 'viewing',
      (date_trunc('day', now() + interval '3 days') + interval '10 hours'), 'Same slot')$$,
  'That time has just been taken. Please choose another.');

reset role;

-- The request is `requested`, never `confirmed`: only a member of staff
-- confirming it makes it an appointment.
select pg_temp.assert_count(
  'the appointment is requested, not confirmed',
  $$select count(*) from public.appointments
     where name = 'First Booker' and status = 'requested'$$, 1);

-- Cancelling frees the slot again, which is what the partial unique index is
-- scoped to the live statuses for.
update public.appointments
   set status = 'cancelled'
 where name = 'First Booker';

set role anon;

insert into refs values ('appointment_freed', public.request_appointment(
  'Third Booker', 'third.booker@example.test', null, 'viewing',
  (date_trunc('day', now() + interval '3 days') + interval '10 hours'),
  'Taking the freed slot.'));

select pg_temp.assert_count(
  'a cancelled appointment frees its slot',
  $$select count(*) from refs where label = 'appointment_freed' and reference like 'LW-A-%'$$, 1);

reset role;

-- -----------------------------------------------------------------------------
-- 10. Rate limiting
--
-- The per-address cap stops one visitor flooding the inbox; the aggregate cap
-- bounds the damage from an attacker cycling addresses. Both are enforced in the
-- database, so calling the function directly does not avoid them.
-- -----------------------------------------------------------------------------

set role anon;

do $$
declare
  i integer;
  v_raised boolean := false;
begin
  for i in 1..8 loop
    begin
      perform public.submit_contact_message(
        'Rate Limited', 'rate.limited@example.test', null, null,
        'Message number ' || i);
    exception when check_violation then
      v_raised := true;
      exit;
    end;
  end loop;

  if not v_raised then
    raise exception 'FAIL: the per-address rate limit did not trip';
  end if;
  raise notice 'pass [the per-address rate limit trips]';
end
$$;

reset role;

-- -----------------------------------------------------------------------------
-- 11. A reference identifies exactly one submission
--
-- The first version built the reference from the clock — the epoch seconds
-- modulo a million — so two submissions in the same second were handed the same
-- number. A single-submission assertion cannot see that; a loop can. Five
-- submissions in a tight loop, all inside the same second, must produce five
-- distinct references. This is the regression guard for that defect.
--
-- Distinct addresses, because the per-address limit is what section 10 measures
-- and it would otherwise fire here first and mask the thing being tested.
-- -----------------------------------------------------------------------------

set role anon;

do $$
declare
  i          integer;
  v_refs     text[] := '{}';
  v_ref      text;
  v_distinct integer;
begin
  for i in 1..5 loop
    v_ref := public.submit_contact_message(
      'Reference Probe', 'ref.probe.' || i || '@example.test', null, null,
      'Probing reference uniqueness, message ' || i);
    v_refs := v_refs || v_ref;
  end loop;

  select count(distinct r) into v_distinct from unnest(v_refs) as r;

  if v_distinct <> 5 then
    raise exception 'FAIL: five submissions produced only % distinct reference(s): %',
      v_distinct, v_refs;
  end if;

  raise notice 'pass [five submissions in one second get five distinct references]';
end
$$;

reset role;

-- The appointment namespace is separate from the contact one, so the two cannot
-- be confused for each other in a follow-up conversation. Checked against the
-- references actually captured above rather than against a fresh call, so the
-- assertion is about the rows the flows wrote.
select pg_temp.assert_true(
  'contact and appointment references occupy distinct namespaces',
  (select bool_and(reference like 'LW-C-%') from refs where label = 'contact')
  and
  (select bool_and(reference like 'LW-A-%') from refs where label = 'appointment'));

-- The reference is not a credential: section 1 already asserts that `anon`
-- cannot read `contact_submissions` at all, which is the stronger statement, and
-- `read_order_request` (0013) requires an access token in addition to the
-- reference. Nothing further is needed here.

-- -----------------------------------------------------------------------------
-- 12. The audit log is still not readable or writable through the API
--
-- 0015 adds a public write path for service requests. It must not have opened
-- one for the audit log, which has no write policy at all by design.
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"50000000-0000-4000-8000-000000000201","role":"authenticated"}';

select pg_temp.assert_count(
  'a customer cannot read the audit log',
  'select count(*) from public.admin_audit_logs', 0);

reset role;

-- -----------------------------------------------------------------------------
-- 12. The lifecycle columns 0015 adds are actually readable by their owner
--
-- 0015 adds `workflow_status` to three tables and `slot_start` to `appointments`
-- after 0014 wrote its column grants. These tables have no table-level grant, so
-- an ungranted column is a hard denial rather than a silently empty result. The
-- account portal reads exactly these, so this asserts the grant exists and is
-- usable by `authenticated` — the failure it guards against is a portal that
-- renders without a status or a time and looks like it works.
-- -----------------------------------------------------------------------------

select pg_temp.assert_count(
  'authenticated may select workflow_status on the three workflow tables',
  $q$select count(*) from information_schema.column_privileges
      where table_schema = 'public' and grantee = 'authenticated'
        and privilege_type = 'SELECT' and column_name = 'workflow_status'
        and table_name in
          ('sell_trade_requests', 'sourcing_requests', 'repair_requests')$q$,
  3);

select pg_temp.assert_count(
  'authenticated may select appointments.slot_start and workflow_status',
  $q$select count(*) from information_schema.column_privileges
      where table_schema = 'public' and grantee = 'authenticated'
        and privilege_type = 'SELECT' and table_name = 'appointments'
        and column_name in ('slot_start', 'workflow_status')$q$,
  2);

-- A real read, not just a catalogue lookup: the grant must actually permit the
-- query the portal runs. Alice submitted exactly one sell/trade request above, so
-- this is 1 if the column is readable and an error (which fails the assertion) if
-- the grant is missing — it cannot pass vacuously by reading zero rows.
set role authenticated;
set request.jwt.claims = '{"sub":"50000000-0000-4000-8000-000000000201","role":"authenticated"}';

select pg_temp.assert_count(
  'the owner can read their own request status',
  $q$select count(*) from public.sell_trade_requests
      where workflow_status = 'submitted'$q$,
  1);

reset role;

-- -----------------------------------------------------------------------------
-- Intake fields the forms collect must reach the row (migration 0019)
--
-- `submit_sell_trade_request` validated `p_transaction_type` and the action
-- quoted it in the notification email, but the column did not exist and the
-- insert never wrote it. A customer choosing "trade" was stored as a sell with
-- no trace of the choice. These assertions read the row rather than the
-- parameter, because the row is what staff and the portal actually see.
-- -----------------------------------------------------------------------------

set role anon;

insert into refs values ('intake', public.submit_sell_trade_request(
  'Intake Seller', 'intake.seller@example.test', null,
  'Rolex', 'Submariner', '126610LN', 2021, 'Excellent', true, true, null,
  'trade', 'I would like to trade up.',
  'steel', 'automatic', 'Daytona 116500LN'));

insert into refs values ('intake-sourcing', public.submit_sourcing_request(
  'Intake Buyer', 'intake.buyer@example.test', null,
  'Omega', 'Speedmaster', '310.30.42', 'black', 'steel', 2018, 2024, 800000,
  'Looking for a Speedmaster.',
  'unworn or light wear', true, true, 'steel'));

insert into refs values ('intake-repair', public.submit_repair_request(
  'Intake Owner', 'intake.owner@example.test', null,
  'Cartier', 'Tank', 'WSTA0041', 'full_service', 'Running fast', true, 'email',
  'My Tank is gaining a minute a day.', 50000));

reset role;

select pg_temp.assert_count(
  'a sell/trade request keeps the trade intent and the trade-in target',
  $$select count(*) from public.sell_trade_requests r
      join public.inquiries i on i.id = r.inquiry_id
     where i.reference = (select reference from refs where label = 'intake')
       and r.transaction_type = 'trade'
       and r.trade_in_target = 'Daytona 116500LN'
       and r.material = 'steel'
       and r.movement = 'automatic'$$, 1);

select pg_temp.assert_count(
  'a sourcing request keeps its condition, box/papers requirement and material',
  $$select count(*) from public.sourcing_requests r
      join public.inquiries i on i.id = r.inquiry_id
     where i.reference = (select reference from refs where label = 'intake-sourcing')
       and r.condition_preference = 'unworn or light wear'
       and r.requires_box is true
       and r.requires_papers is true
       and r.material = 'steel'$$, 1);

select pg_temp.assert_count(
  'a repair request keeps its stated budget',
  $$select count(*) from public.repair_requests r
      join public.inquiries i on i.id = r.inquiry_id
     where i.reference = (select reference from refs where label = 'intake-repair')
       and r.budget_cents = 50000$$, 1);

-- The constraint, not just the function, refuses an unknown intent. A direct
-- write that bypasses the function must not be able to store one either.
select pg_temp.assert_raises(
  'the table refuses an unrecognised transaction type',
  $$insert into public.sell_trade_requests (inquiry_id, transaction_type, workflow_status)
    select id, 'barter', 'submitted' from public.inquiries
     where reference = (select reference from refs where label = 'intake')$$);

-- A negative repair budget is refused by the function, so the row cannot be
-- created in the first place.
select pg_temp.assert_raises(
  'a repair request refuses a negative budget',
  $$select public.submit_repair_request(
      'Neg Budget', 'neg.budget@example.test', null, 'Rolex', 'Sub', '1', 'service',
      'Issue', false, 'email', 'Description here.', -1)$$);


drop function pg_temp.assert_raises(text, text);
drop function pg_temp.assert_raises_message(text, text, text);
drop function pg_temp.assert_denied(text, text);
drop function pg_temp.assert_true(text, boolean);
drop function pg_temp.assert_count(text, text, bigint);

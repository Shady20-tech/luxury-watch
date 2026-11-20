-- =============================================================================
-- 0015 — Customer service workflows
--
-- Phase 10. Migration 0005 built the tables for the four service flows but left
-- two things undone: the detailed status lifecycle each flow needs, and the
-- audit trail of who moved a request where. Both are added here, along with the
-- submission functions the public forms call, appointment availability, and the
-- private storage buckets for customer-uploaded photographs.
--
-- -----------------------------------------------------------------------------
-- TWO STATUS FIELDS, ON PURPOSE
-- -----------------------------------------------------------------------------
--
-- `inquiries.status` stays as it is: the coarse staff-facing triage state
-- (new / in_review / responded / closed / spam). It answers "has someone looked
-- at this?" and is shared by all four flows.
--
-- Each flow then gets its own `workflow_status`, because the detailed lifecycle
-- is genuinely different: a repair is in `inspection` while a sourcing request is
-- in `searching`, and neither word means anything to the other. Squeezing both
-- into one enum would produce a type where every value is invalid for most rows.
--
-- Every change to `workflow_status` writes a row to `service_status_events`, so
-- the history is not a reconstruction from the current value — it is a record of
-- what actually happened, and it is append-only.
--
-- -----------------------------------------------------------------------------
-- WHY THE SUBMISSION FUNCTIONS ARE SECURITY DEFINER
-- -----------------------------------------------------------------------------
--
-- A public form is written by someone with no session, so no RLS policy can scope
-- their insert: `anon` may create a row but must not be able to read one back.
-- Each submission goes through a function that validates the shape, enforces the
-- rate limit, writes the inquiry and its detail row and the opening history
-- event, and returns only the reference. `anon` gets no direct table access at
-- all, so the only way in is a function that cannot be talked into returning
-- another customer's data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Per-flow status lifecycles
-- -----------------------------------------------------------------------------

create type public.sell_trade_status as enum (
  'submitted',
  'under_review',
  'more_information_required',
  'valuation',
  'offer_sent',
  'counteroffer',
  'accepted',
  'declined',
  'shipping_pending',
  'received',
  'authentication',
  'final_review',
  'payment_pending',
  'completed',
  'cancelled'
);

comment on type public.sell_trade_status is
  'Sell/trade lifecycle. A terminal `completed` means the business recorded the '
  'transaction as settled; nothing before it implies any payment has happened.';

create type public.sourcing_status as enum (
  'submitted',
  'searching',
  'potential_match',
  'offer_sent',
  'customer_review',
  'accepted',
  'purchase_pending',
  'shipping',
  'delivered',
  'completed',
  'cancelled'
);

create type public.repair_status as enum (
  'submitted',
  'inspection',
  'estimate_sent',
  'customer_approval',
  'in_repair',
  'quality_control',
  'ready',
  'shipped',
  'completed',
  'cancelled'
);

comment on type public.repair_status is
  'Repair/restoration lifecycle. `completed` is set by staff after the watch is '
  'back with the customer; it is never inferred from a shipping label.';

-- The offer flow's own states. `countered` is terminal for the *offer*, not for
-- the negotiation: a counter is a new offer row pointing back at the original.
create type public.offer_status as enum (
  'pending',
  'accepted',
  'declined',
  'countered',
  'withdrawn'
);

-- What a history event can be attached to.
create type public.service_entity_type as enum (
  'sell_trade',
  'sourcing',
  'repair',
  'appointment',
  'product_offer',
  'product_question',
  'contact'
);

-- -----------------------------------------------------------------------------
-- 2. The workflow status column on each flow
--
-- Defaulted to the flow's opening state, which is also the state the submission
-- function writes. Existing rows (there are none in a fresh database, but a
-- deployed one may have some) adopt the default rather than being left null.
-- -----------------------------------------------------------------------------

alter table public.sell_trade_requests
  add column if not exists workflow_status public.sell_trade_status not null default 'submitted';

alter table public.sourcing_requests
  add column if not exists workflow_status public.sourcing_status not null default 'submitted';

alter table public.repair_requests
  add column if not exists workflow_status public.repair_status not null default 'submitted';

comment on column public.sell_trade_requests.workflow_status is
  'Detailed customer-facing lifecycle. Changes are recorded in service_status_events.';

-- -----------------------------------------------------------------------------
-- 3. service_status_events — the shared, append-only history
--
-- One table rather than five, because the shape is identical for every flow and
-- the account portal renders them all the same way. `entity_type` says which
-- table `entity_id` points into; a real foreign key is impossible across five
-- targets, so the constraint is a check on the allowed status vocabulary instead
-- and the writing functions are the only writers.
-- -----------------------------------------------------------------------------

create table public.service_status_events (
  id                 uuid primary key default gen_random_uuid(),
  entity_type        public.service_entity_type not null,
  entity_id          uuid not null,
  from_status        text,
  to_status          text not null,
  note               text,
  -- Null actor means the transition was performed by the customer submitting, or
  -- by the system, not by a member of staff.
  actor_id           uuid references auth.users (id) on delete set null,
  actor_label        text,
  -- A private event is a staff note the customer must not see in the portal.
  is_customer_visible boolean not null default true,
  created_at         timestamptz not null default now(),

  constraint service_status_events_note_length check (
    note is null or char_length(trim(note)) between 1 and 4000
  ),
  -- The status must belong to the vocabulary of the entity it is attached to.
  -- Without this, a typo in a staff action would write a state the portal cannot
  -- render and the flow could never leave.
  constraint service_status_events_status_valid check (
    case entity_type
      when 'sell_trade' then to_status in (
        'submitted','under_review','more_information_required','valuation',
        'offer_sent','counteroffer','accepted','declined','shipping_pending',
        'received','authentication','final_review','payment_pending',
        'completed','cancelled')
      when 'sourcing' then to_status in (
        'submitted','searching','potential_match','offer_sent','customer_review',
        'accepted','purchase_pending','shipping','delivered','completed',
        'cancelled')
      when 'repair' then to_status in (
        'submitted','inspection','estimate_sent','customer_approval','in_repair',
        'quality_control','ready','shipped','completed','cancelled')
      when 'appointment' then to_status in (
        'requested','confirmed','completed','cancelled','rescheduled')
      when 'product_offer' then to_status in (
        'pending','accepted','declined','countered','withdrawn')
      when 'product_question' then to_status in (
        'new','in_review','responded','closed','spam')
      when 'contact' then to_status in (
        'new','in_review','responded','closed','spam')
    end
  ),
  constraint service_status_events_from_status_valid check (
    from_status is null or from_status <> ''
  )
);

comment on table public.service_status_events is
  'Append-only status history for every service flow. The record of what '
  'happened, not a reconstruction from the current state.';

create index service_status_events_entity_idx
  on public.service_status_events (entity_type, entity_id, created_at);
create index service_status_events_customer_idx
  on public.service_status_events (entity_id, created_at) where is_customer_visible;

-- Append-only, enforced rather than documented. A history table that can be
-- edited is not evidence, and the whole point of this table is that it can be
-- relied on during a dispute.
create or replace function public.prevent_service_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'service_status_events is append-only'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger service_status_events_no_update
  before update or delete on public.service_status_events
  for each row execute function public.prevent_service_event_mutation();

-- -----------------------------------------------------------------------------
-- 4. Product offers ("Make an Offer")
--
-- Distinct from `sell_trade_offers`, which is one leg of a sell/trade
-- negotiation. This is a customer naming a price for a listed piece. The history
-- table carries every response, so the current `status` column is only a cache of
-- the latest event.
-- -----------------------------------------------------------------------------

create table public.product_offers (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products (id) on delete cascade,
  inquiry_id    uuid references public.inquiries (id) on delete set null,
  user_id       uuid references auth.users (id) on delete set null,

  amount_cents  bigint not null,
  currency      char(3) not null default 'USD',
  message       text,
  name          text not null,
  email         extensions.citext not null,
  phone         text,

  status        public.offer_status not null default 'pending',
  -- Set when this offer is a response to an earlier one, so a negotiation reads
  -- as a chain rather than as unrelated offers.
  counter_of    uuid references public.product_offers (id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint product_offers_amount_positive check (amount_cents > 0),
  constraint product_offers_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint product_offers_name_length check (char_length(trim(name)) between 1 and 200),
  constraint product_offers_email_length check (char_length(email::text) between 3 and 320),
  constraint product_offers_message_length check (
    message is null or char_length(trim(message)) between 1 and 4000
  ),
  -- An offer cannot be its own counter.
  constraint product_offers_counter_not_self check (counter_of is null or counter_of <> id)
);

comment on table public.product_offers is
  'A customer naming a price for a listed product. Never implies a sale: only an '
  'accepted status, recorded by staff, means anything was agreed.';

create index product_offers_product_idx on public.product_offers (product_id, created_at desc);
create index product_offers_user_idx on public.product_offers (user_id, created_at desc);

create trigger product_offers_set_updated_at
  before update on public.product_offers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Appointment availability
--
-- The showroom's bookable hours, configured by the business. A recurring weekly
-- shape covers a showroom; a one-off closure is expressed by deactivating the
-- row for that weekday.
-- -----------------------------------------------------------------------------

create table public.appointment_availability (
  id           uuid primary key default gen_random_uuid(),
  -- 0 = Sunday, matching `extract(dow)`, so the check reads the same as the query.
  day_of_week  integer not null,
  start_time   time not null,
  end_time     time not null,
  slot_minutes integer not null default 60,
  -- Null means every appointment purpose is accepted in this window.
  purpose      text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint appointment_availability_dow_range check (day_of_week between 0 and 6),
  constraint appointment_availability_slot_positive check (slot_minutes between 15 and 480),
  constraint appointment_availability_window_order check (end_time > start_time),
  constraint appointment_availability_window_within_day check (
    start_time >= time '00:00' and end_time <= time '23:59'
  )
);

comment on table public.appointment_availability is
  'The bookable showroom hours. A requested time that does not fall in an active '
  'window on a slot boundary is refused by request_appointment().';

create index appointment_availability_dow_idx
  on public.appointment_availability (day_of_week) where is_active;

create trigger appointment_availability_set_updated_at
  before update on public.appointment_availability
  for each row execute function public.set_updated_at();

-- The slot a request is for, stored so the conflict rule can be an index rather
-- than a query that races.
alter table public.appointments
  add column if not exists slot_start timestamptz;

alter table public.appointments
  add column if not exists workflow_status text not null default 'requested';

comment on column public.appointments.slot_start is
  'The availability slot this request occupies. Unique among live appointments, '
  'which is what prevents two bookings in one slot.';

-- The conflict rule, enforced by the database rather than by a check-then-insert
-- in application code, which two concurrent requests would both pass.
--
-- Scoped to the live statuses: a cancelled appointment frees its slot again, and
-- a completed one is in the past so it cannot collide with a new request.
create unique index appointments_slot_start_key
  on public.appointments (slot_start)
  where slot_start is not null and status in ('requested', 'confirmed');

-- -----------------------------------------------------------------------------
-- 6. Storage buckets for customer uploads
--
-- Guarded, because a plain Postgres has no `storage` schema and this migration
-- must still apply under `scripts/db-verify.sh`. On Supabase the schema exists and
-- the buckets are created; the check is what keeps the test suite honest instead
-- of forcing a shim for a schema we do not own.
--
-- Both buckets are private. Nothing in them is ever served by public URL: a
-- customer's photograph of a watch they are selling is personal data, and the
-- only route to it is a short-lived signed URL issued after a permission check.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values
      ('sell-trade-photos', 'sell-trade-photos', false, 10485760,
       array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
      ('repair-photos', 'repair-photos', false, 10485760,
       array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;
end
$$;

-- Storage policies, also guarded. An authenticated customer may write into a
-- folder named for their own user id and nowhere else; reading is staff-only, so
-- there is deliberately no select policy for `authenticated` here. Staff read
-- through the service role after an application-level permission check, which is
-- what makes the signed URL short-lived and deliberate.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute $policy$
      drop policy if exists sell_trade_photos_insert_own on storage.objects
    $policy$;
    execute $policy$
      create policy sell_trade_photos_insert_own on storage.objects
        for insert to authenticated
        with check (
          bucket_id = 'sell-trade-photos'
          and (storage.foldername(name))[1] = (select auth.uid())::text
        )
    $policy$;
    execute $policy$
      drop policy if exists repair_photos_insert_own on storage.objects
    $policy$;
    execute $policy$
      create policy repair_photos_insert_own on storage.objects
        for insert to authenticated
        with check (
          bucket_id = 'repair-photos'
          and (storage.foldername(name))[1] = (select auth.uid())::text
        )
    $policy$;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- 7. Fix: product_questions leaked the asker's email to anyone
--
-- `product_questions_public_read` is a correct row-level policy — it exposes only
-- published, answered rows. It says nothing about columns, and the table still
-- carried the table-level `select` grant, so `anon` could read `email`, `name`
-- and `user_id` for every published question. That is the Phase 6 mistake again
-- (see AGENTS.md): a row policy restricts rows, not columns.
--
-- The public surface is the question and its answer. The asker's identity is not
-- part of it, so `name` and `email` are withheld outright rather than filtered,
-- and the Q&A renders without attributing the question to a person.
-- -----------------------------------------------------------------------------

revoke select on public.product_questions from anon, authenticated;

-- The public surface is the question and its answer. The asker's identity is not
-- part of it, so `name` and `email` are withheld from both roles, and the Q&A
-- renders without attributing the question to a person.
grant select (
  id, product_id, question, answer, answered_at, is_published, created_at
) on public.product_questions to anon;

-- `authenticated` additionally reads `user_id`, and only for that: the
-- `service_status_events` policy below derives ownership by comparing it with
-- `auth.uid()`, and a policy body runs with the querying role's privileges. The
-- asker's name and email stay withheld from both roles.
grant select (
  id, product_id, question, answer, answered_at, is_published, created_at, user_id
) on public.product_questions to authenticated;

-- Same reasoning for the two tables that hold a submission's own metadata. The
-- grants here are stated explicitly so a column added later is a decision, not an
-- inheritance.
revoke select on public.inquiries from anon, authenticated;
grant select (
  id, type, status, user_id, product_id, name, email, phone, message, reference,
  created_at, updated_at
) on public.inquiries to authenticated;
-- `anon` keeps no grant: a guest reads their submission through the function
-- below, which requires the reference and a matching access token.

revoke select on public.contact_submissions from anon, authenticated;
grant select (
  id, name, email, phone, subject, message, is_handled, handled_at, created_at
) on public.contact_submissions to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Row level security on the new tables
-- -----------------------------------------------------------------------------

alter table public.service_status_events    enable row level security;
alter table public.product_offers           enable row level security;
alter table public.appointment_availability enable row level security;

-- The showroom's opening hours are public information; they are what the booking
-- form offers. No personal data is involved.
create policy appointment_availability_public_read on public.appointment_availability
  for select to anon, authenticated
  using (is_active);

create policy appointment_availability_staff_write on public.appointment_availability
  for all to authenticated
  using (public.has_permission('inquiries.write'))
  with check (public.has_permission('inquiries.write'));

-- A status event is visible to the customer it concerns, when it is marked
-- customer-visible, and to staff who can read inquiries. The join is on the
-- entity the event describes, so ownership is derived from the request rather
-- than trusted from the event row.
create policy service_status_events_select_own on public.service_status_events
  for select to authenticated
  using (
    (is_customer_visible and (
      (entity_type = 'sell_trade' and exists (
        select 1 from public.sell_trade_requests r
          join public.inquiries i on i.id = r.inquiry_id
         where r.id = entity_id and i.user_id = (select auth.uid())))
      or (entity_type = 'sourcing' and exists (
        select 1 from public.sourcing_requests r
          join public.inquiries i on i.id = r.inquiry_id
         where r.id = entity_id and i.user_id = (select auth.uid())))
      or (entity_type = 'repair' and exists (
        select 1 from public.repair_requests r
          join public.inquiries i on i.id = r.inquiry_id
         where r.id = entity_id and i.user_id = (select auth.uid())))
      or (entity_type = 'appointment' and exists (
        select 1 from public.appointments a
         where a.id = entity_id and a.user_id = (select auth.uid())))
      or (entity_type = 'product_offer' and exists (
        select 1 from public.product_offers o
         where o.id = entity_id and o.user_id = (select auth.uid())))
      or (entity_type = 'product_question' and exists (
        select 1 from public.product_questions q
         where q.id = entity_id and q.user_id = (select auth.uid())))
      or (entity_type = 'contact' and exists (
        select 1 from public.inquiries i
         where i.id = entity_id and i.user_id = (select auth.uid())))
    ))
    or public.has_permission('inquiries.read')
  );

-- Staff may append an event, and only through a permission check. There is no
-- update or delete policy at all, which is what makes the trigger above a second
-- line of defence rather than the only one.
create policy service_status_events_staff_insert on public.service_status_events
  for insert to authenticated
  with check (public.has_permission('inquiries.write'));

create policy product_offers_select_own on public.product_offers
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('inquiries.read'));

create policy product_offers_staff_write on public.product_offers
  for update to authenticated
  using (public.has_permission('inquiries.write'))
  with check (public.has_permission('inquiries.write'));

-- Column grants for the new tables, stated explicitly for the same reason as
-- every table above: a column added later is a decision, not an inheritance.
revoke select on public.service_status_events from anon, authenticated;
grant select (
  id, entity_type, entity_id, from_status, to_status, note, is_customer_visible, created_at
) on public.service_status_events to authenticated;

revoke select on public.product_offers from anon, authenticated;
grant select (
  id, product_id, inquiry_id, user_id, amount_cents, currency, message, name, email,
  phone, status, counter_of, created_at, updated_at
) on public.product_offers to authenticated;

revoke select on public.appointment_availability from anon, authenticated;
grant select (
  id, day_of_week, start_time, end_time, slot_minutes, purpose, is_active
) on public.appointment_availability to anon, authenticated;

-- `workflow_status` and `appointments.slot_start` are added above, *after* 0014
-- wrote its column lists. A column added to a table with a public-read policy is
-- readable by default only if the table-level grant is still in place; these
-- tables have had theirs revoked, so an ungranted column is a hard denial. The
-- account portal reads exactly these two, so without this grant the customer sees
-- a request with no status and an appointment with no time — the portal would
-- appear to work while showing nothing useful.
grant select (workflow_status) on public.sell_trade_requests to authenticated;
grant select (workflow_status) on public.sourcing_requests to authenticated;
grant select (workflow_status) on public.repair_requests to authenticated;
grant select (workflow_status, slot_start) on public.appointments to authenticated;

-- =============================================================================
-- 9. Reference numbers for submissions that have no order
--
-- `generate_order_reference()` (0001) draws from `order_reference_seq`, which
-- exists because a duplicate order reference is a serious problem: two customers
-- quoting the same number. A service inquiry has the same problem for the same
-- reason — a customer quotes the reference in a follow-up email and staff must be
-- able to find exactly one row.
--
-- These flows originally built a reference from `now()`, taking the epoch seconds
-- modulo a million. That collides: two submissions in the same second return the
-- same reference, and the test suite showed five submissions 73 ms apart all
-- sharing one. A single-submission test cannot see that, which is why it survived
-- to the browser stage.
--
-- A dedicated sequence, not a shared one, so the `LW-C-` and `LW-A-` namespaces
-- stay disjoint and a contact reference can never be mistaken for an appointment
-- one.
-- =============================================================================

create sequence if not exists public.service_reference_seq;

-- `security definer` and executable by the public, because the submission
-- functions are themselves definer functions. The sequence is not granted to
-- `anon`, so this is the only way a visitor can obtain a reference — and it only
-- ever mints one, it never reads a table.
create or replace function public.generate_service_reference(p_prefix text)
returns text
language sql
security definer
set search_path = ''
as $$
  select 'LW-' || p_prefix || '-' || to_char(now(), 'YY') || '-' ||
         lpad(nextval('public.service_reference_seq')::text, 6, '0');
$$;

comment on function public.generate_service_reference(text) is
  'Mints a unique customer-facing reference for a service submission. '
  'Sequence-backed, not clock-derived: a clock-derived reference collides for '
  'two submissions in the same second.';

revoke all on function public.generate_service_reference(text) from public;
grant execute on function public.generate_service_reference(text) to anon, authenticated;


-- -----------------------------------------------------------------------------
-- 10. The rate-limit helper for public forms
--
-- `enforce_rate_limit` (0013) is granted to `service_role` only, because it is
-- called from inside other definer functions. A public form needs the same
-- behaviour, so this wrapper is the one the submission functions call. It is
-- `security definer` too, so the caller never touches `rate_limit_counters`.
-- -----------------------------------------------------------------------------

create or replace function public.service_form_guard(
  p_scope        text,
  p_email        text,
  p_global_limit integer default 20,
  p_email_limit  integer default 5
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_count  integer;
  v_key    text;
begin
  insert into public.rate_limit_counters (bucket, window_start, count)
  values (p_scope || ':global:' || v_window::text, v_window, 1)
  on conflict (bucket, window_start) do update
    set count = public.rate_limit_counters.count + 1
  returning count into v_count;

  if v_count > p_global_limit then
    raise exception 'Too many submissions have been received. Please try again later.'
      using errcode = 'check_violation';
  end if;

  v_key := lower(btrim(coalesce(p_email, '')));

  -- A submission with no usable email is still rate-limited, on the scope alone,
  -- rather than skipping the per-address counter and getting a free pass.
  if v_key = '' then
    return;
  end if;

  insert into public.rate_limit_counters (bucket, window_start, count)
  values (p_scope || ':email:' || v_key || ':' || v_window::text, v_window, 1)
  on conflict (bucket, window_start) do update
    set count = public.rate_limit_counters.count + 1
  returning count into v_count;

  if v_count > p_email_limit then
    raise exception 'Too many submissions have been received from this address. Please try again later.'
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function public.service_form_guard(text, text, integer, integer) is
  'Per-scope and per-address hourly rate limit for the public service forms.';

revoke all on function public.service_form_guard(text, text, integer, integer) from public;
grant execute on function public.service_form_guard(text, text, integer, integer)
  to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 11. Shape validation, shared by every submission function
--
-- One helper rather than the same six checks repeated, so a bound cannot be
-- tightened in one flow and left loose in another.
-- -----------------------------------------------------------------------------

create or replace function public.assert_submission_shape(
  p_name    text,
  p_email   text,
  p_message text
)
returns void
language plpgsql
immutable
as $$
begin
  if p_name is null or char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 200 then
    raise exception 'A name between 1 and 200 characters is required'
      using errcode = 'check_violation';
  end if;

  if p_email is null or char_length(btrim(p_email)) < 3 or char_length(btrim(p_email)) > 320
     or position('@' in p_email) < 2
     or position('.' in split_part(p_email, '@', 2)) < 2 then
    raise exception 'A valid email address is required' using errcode = 'check_violation';
  end if;

  if p_message is null or char_length(btrim(p_message)) < 1 or char_length(btrim(p_message)) > 8000 then
    raise exception 'A message between 1 and 8000 characters is required'
      using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function public.assert_submission_shape(text, text, text) from public;

-- -----------------------------------------------------------------------------
-- 12. The service-flow submission functions
--
-- Each creates the inquiry, the type-specific detail row and the opening history
-- event, and returns the reference. All of it in one transaction: a detail row
-- without its inquiry, or a request with no opening event, would be a row the
-- portal cannot render and the flow cannot leave.
-- -----------------------------------------------------------------------------

create or replace function public.submit_sell_trade_request(
  p_name               text,
  p_email              text,
  p_phone              text,
  p_brand_name         text,
  p_model_name         text,
  p_reference_number   text,
  p_production_year    integer,
  p_condition_notes    text,
  p_has_box            boolean,
  p_has_papers         boolean,
  p_asking_price_cents bigint,
  p_transaction_type   text,
  p_description        text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inquiry_id uuid;
  v_reference  text;
  v_request_id uuid;
begin
  perform public.assert_submission_shape(p_name, p_email, p_description);
  perform public.service_form_guard('sell_trade', p_email, 10, 3);

  if p_production_year is not null and (p_production_year < 1800 or p_production_year > 2200) then
    raise exception 'A production year between 1800 and 2200 is required'
      using errcode = 'check_violation';
  end if;

  if p_asking_price_cents is not null and p_asking_price_cents < 0 then
    raise exception 'An asking price cannot be negative' using errcode = 'check_violation';
  end if;

  if p_transaction_type is not null
     and p_transaction_type not in ('sell', 'trade') then
    raise exception 'The transaction type must be sell or trade'
      using errcode = 'check_violation';
  end if;

  insert into public.inquiries (type, user_id, name, email, phone, message)
  values (
    'sell_trade',
    (select auth.uid()),
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''),
    btrim(p_description)
  )
  returning id, reference into v_inquiry_id, v_reference;

  insert into public.sell_trade_requests (
    inquiry_id, brand_name, model_name, reference_number, production_year,
    condition_notes, has_box, has_papers, asking_price_cents, workflow_status
  )
  values (
    v_inquiry_id,
    nullif(btrim(coalesce(p_brand_name, '')), ''),
    nullif(btrim(coalesce(p_model_name, '')), ''),
    nullif(btrim(coalesce(p_reference_number, '')), ''),
    p_production_year,
    nullif(btrim(coalesce(p_condition_notes, '')), ''),
    p_has_box,
    p_has_papers,
    p_asking_price_cents,
    'submitted'
  )
  returning id into v_request_id;

  insert into public.service_status_events (
    entity_type, entity_id, to_status, actor_id, actor_label, is_customer_visible
  )
  values ('sell_trade', v_request_id, 'submitted', (select auth.uid()), 'customer', true);

  return v_reference;
end;
$$;

comment on function public.submit_sell_trade_request(
  text, text, text, text, text, text, integer, text, boolean, boolean, bigint, text, text
) is
  'Creates a sell/trade request and its opening history event, and returns the '
  'reference. Validates shape, bounds and rate limit inside the database.';

create or replace function public.submit_sourcing_request(
  p_name             text,
  p_email            text,
  p_phone            text,
  p_brand_name       text,
  p_model_name       text,
  p_reference_number text,
  p_dial_color       text,
  p_bracelet_type    text,
  p_min_year         integer,
  p_max_year         integer,
  p_max_budget_cents bigint,
  p_notes            text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inquiry_id uuid;
  v_reference  text;
  v_request_id uuid;
begin
  perform public.assert_submission_shape(p_name, p_email, p_notes);
  perform public.service_form_guard('sourcing', p_email, 10, 3);

  if (p_min_year is not null and (p_min_year < 1800 or p_min_year > 2200))
     or (p_max_year is not null and (p_max_year < 1800 or p_max_year > 2200)) then
    raise exception 'A year between 1800 and 2200 is required'
      using errcode = 'check_violation';
  end if;

  if p_min_year is not null and p_max_year is not null and p_min_year > p_max_year then
    raise exception 'The earliest year cannot be after the latest year'
      using errcode = 'check_violation';
  end if;

  if p_max_budget_cents is not null and p_max_budget_cents < 0 then
    raise exception 'A budget cannot be negative' using errcode = 'check_violation';
  end if;

  insert into public.inquiries (type, user_id, name, email, phone, message)
  values (
    'sourcing',
    (select auth.uid()),
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''),
    btrim(p_notes)
  )
  returning id, reference into v_inquiry_id, v_reference;

  insert into public.sourcing_requests (
    inquiry_id, brand_name, model_name, reference_number, dial_color,
    bracelet_type, min_year, max_year, max_budget_cents, workflow_status
  )
  values (
    v_inquiry_id,
    nullif(btrim(coalesce(p_brand_name, '')), ''),
    nullif(btrim(coalesce(p_model_name, '')), ''),
    nullif(btrim(coalesce(p_reference_number, '')), ''),
    nullif(btrim(coalesce(p_dial_color, '')), ''),
    nullif(btrim(coalesce(p_bracelet_type, '')), ''),
    p_min_year,
    p_max_year,
    p_max_budget_cents,
    'submitted'
  )
  returning id into v_request_id;

  insert into public.service_status_events (
    entity_type, entity_id, to_status, actor_id, actor_label, is_customer_visible
  )
  values ('sourcing', v_request_id, 'submitted', (select auth.uid()), 'customer', true);

  return v_reference;
end;
$$;

create or replace function public.submit_repair_request(
  p_name             text,
  p_email            text,
  p_phone            text,
  p_brand_name       text,
  p_model_name       text,
  p_reference_number text,
  p_service_type     text,
  p_issue_summary    text,
  p_is_insured       boolean,
  p_preferred_contact text,
  p_description      text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inquiry_id uuid;
  v_reference  text;
  v_request_id uuid;
begin
  perform public.assert_submission_shape(p_name, p_email, p_description);
  perform public.service_form_guard('repair', p_email, 10, 3);

  insert into public.inquiries (type, user_id, name, email, phone, message)
  values (
    'repair',
    (select auth.uid()),
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''),
    btrim(p_description)
  )
  returning id, reference into v_inquiry_id, v_reference;

  insert into public.repair_requests (
    inquiry_id, brand_name, model_name, reference_number, service_type,
    issue_summary, is_watch_insured, preferred_contact_method, workflow_status
  )
  values (
    v_inquiry_id,
    nullif(btrim(coalesce(p_brand_name, '')), ''),
    nullif(btrim(coalesce(p_model_name, '')), ''),
    nullif(btrim(coalesce(p_reference_number, '')), ''),
    nullif(btrim(coalesce(p_service_type, '')), ''),
    nullif(btrim(coalesce(p_issue_summary, '')), ''),
    p_is_insured,
    nullif(btrim(coalesce(p_preferred_contact, '')), ''),
    'submitted'
  )
  returning id into v_request_id;

  insert into public.service_status_events (
    entity_type, entity_id, to_status, actor_id, actor_label, is_customer_visible
  )
  values ('repair', v_request_id, 'submitted', (select auth.uid()), 'customer', true);

  return v_reference;
end;
$$;

-- Contact has no lifecycle and no detail row, so it writes the submission and a
-- history event and stops. `contact_submissions` is the table 0005 already
-- defines for exactly this.
create or replace function public.submit_contact_message(
  p_name    text,
  p_email   text,
  p_phone   text,
  p_subject text,
  p_message text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id        uuid;
  v_reference text;
begin
  perform public.assert_submission_shape(p_name, p_email, p_message);
  perform public.service_form_guard('contact', p_email, 20, 5);

  insert into public.contact_submissions (name, email, phone, subject, message)
  values (
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''),
    nullif(btrim(coalesce(p_subject, '')), ''),
    btrim(p_message)
  )
  returning id into v_id;

  -- The history event is keyed to the submission's id and gives staff the same
  -- audit trail the other flows have. The reference is sequence-backed (section
  -- 9), because two people writing in the same second must not be handed the
  -- same number.
  insert into public.service_status_events (
    entity_type, entity_id, to_status, actor_id, actor_label, is_customer_visible
  )
  values ('contact', v_id, 'new', (select auth.uid()), 'customer', false);

  v_reference := public.generate_service_reference('C');

  return v_reference;
end;
$$;

-- A price the customer is offering for a listed piece. The amount is stored, and
-- stored only as an offer: nothing here marks a product sold or reserved.
create or replace function public.submit_product_offer(
  p_product_slug text,
  p_name         text,
  p_email        text,
  p_phone        text,
  p_amount_cents bigint,
  p_message      text,
  p_counter_of   uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_inquiry_id uuid;
  v_reference  text;
  v_offer_id   uuid;
  v_message    text;
begin
  perform public.assert_submission_shape(p_name, p_email,
    coalesce(nullif(btrim(coalesce(p_message, '')), ''), 'Offer for a listed piece'));
  perform public.service_form_guard('product_offer', p_email, 20, 5);

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'An offer amount greater than zero is required'
      using errcode = 'check_violation';
  end if;

  select p.id into v_product_id
    from public.products p
   where p.slug = p_product_slug
     and p.status = 'published';

  if v_product_id is null then
    raise exception 'Unknown product' using errcode = 'no_data_found';
  end if;

  v_message := coalesce(nullif(btrim(coalesce(p_message, '')), ''), 'Offer for a listed piece');

  insert into public.inquiries (type, user_id, product_id, name, email, phone, message)
  values (
    'product_question',
    (select auth.uid()),
    v_product_id,
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''),
    v_message
  )
  returning id, reference into v_inquiry_id, v_reference;

  insert into public.product_offers (
    product_id, inquiry_id, user_id, amount_cents, message, name, email, phone,
    status, counter_of
  )
  values (
    v_product_id, v_inquiry_id, (select auth.uid()), p_amount_cents, v_message,
    btrim(p_name), lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''), 'pending', p_counter_of
  )
  returning id into v_offer_id;

  insert into public.service_status_events (
    entity_type, entity_id, to_status, actor_id, actor_label, is_customer_visible
  )
  values ('product_offer', v_offer_id, 'pending', (select auth.uid()), 'customer', true);

  return v_reference;
end;
$$;

comment on function public.submit_product_offer(text, text, text, text, bigint, text, uuid) is
  'Records an offer for a published product and returns the enquiry reference. '
  'Records an offer only: no product is reserved or sold by this function.';

-- -----------------------------------------------------------------------------
-- 13. Appointment requests
--
-- The requested time must fall inside an active availability window, on a slot
-- boundary. The unique index added above is what actually prevents a double
-- booking; the window check is what makes the request meaningful. Both run in
-- the database, so a client that skips the form cannot book outside opening
-- hours or into a taken slot.
-- -----------------------------------------------------------------------------

create or replace function public.request_appointment(
  p_name          text,
  p_email         text,
  p_phone         text,
  p_purpose       text,
  p_slot_start    timestamptz,
  p_customer_note text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id        uuid;
  v_reference text;
  v_window    public.appointment_availability;
  v_dow       integer;
  v_local     timestamp;
begin
  perform public.assert_submission_shape(p_name, p_email,
    coalesce(nullif(btrim(coalesce(p_customer_note, '')), ''), 'Appointment request'));
  perform public.service_form_guard('appointment', p_email, 10, 3);

  if p_slot_start is null then
    raise exception 'A preferred time is required' using errcode = 'check_violation';
  end if;

  if p_slot_start < now() then
    raise exception 'The requested time is in the past' using errcode = 'check_violation';
  end if;

  v_local := p_slot_start::timestamp;
  v_dow   := extract(dow from v_local)::integer;

  select * into v_window
    from public.appointment_availability a
   where a.day_of_week = v_dow
     and a.is_active
     and (a.purpose is null or a.purpose = p_purpose)
     and v_local::time >= a.start_time
     and v_local::time < a.end_time
     -- On a slot boundary: an arbitrary time is not a bookable slot.
     and mod(
           (extract(epoch from (v_local::time - a.start_time)))::integer,
           a.slot_minutes * 60
         ) = 0
   order by a.start_time
   limit 1;

  if not found then
    raise exception 'That time is not available. Please choose one of the offered slots.'
      using errcode = 'check_violation';
  end if;

  -- The availability check above is the friendly early answer, but it is not the
  -- guarantee: two requests can pass it in the same instant. The partial unique
  -- index is what actually keeps one booking per live slot, so the loser of that
  -- race must be told to pick another time rather than shown a constraint name.
  begin
    insert into public.appointments (
      user_id, name, email, phone, purpose, requested_at, slot_start, status,
      customer_note, workflow_status
    )
    values (
      (select auth.uid()),
      btrim(p_name),
      lower(btrim(p_email)),
      nullif(btrim(coalesce(p_phone, '')), ''),
      nullif(btrim(coalesce(p_purpose, '')), ''),
      now(),
      p_slot_start,
      'requested',
      nullif(btrim(coalesce(p_customer_note, '')), ''),
      'requested'
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'That time has just been taken. Please choose another.'
        using errcode = 'check_violation';
  end;

  insert into public.service_status_events (
    entity_type, entity_id, to_status, actor_id, actor_label, is_customer_visible
  )
  values ('appointment', v_id, 'requested', (select auth.uid()), 'customer', true);

  v_reference := public.generate_service_reference('A');

  return v_reference;
end;
$$;

comment on function public.request_appointment(text, text, text, text, timestamptz, text) is
  'Requests an appointment in an available slot. The status is `requested`, never '
  '`confirmed`: only a member of staff confirming it makes it an appointment.';

-- -----------------------------------------------------------------------------
-- 14. Grants on the submission functions
--
-- `anon` must be able to call them — that is the whole point of a public form —
-- and must have no direct table access, which is why every table above was
-- revoked. Each function is its own validation and rate-limit boundary.
-- -----------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.submit_sell_trade_request(text,text,text,text,text,text,integer,text,boolean,boolean,bigint,text,text)',
    'public.submit_sourcing_request(text,text,text,text,text,text,text,text,integer,integer,bigint,text)',
    'public.submit_repair_request(text,text,text,text,text,text,text,text,boolean,text,text)',
    'public.submit_contact_message(text,text,text,text,text)',
    'public.submit_product_offer(text,text,text,text,bigint,text,uuid)',
    'public.request_appointment(text,text,text,text,timestamptz,text)'
  ]
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end
$$;


-- =============================================================================
-- 0019 — the service intake fields the forms collected and the database dropped
--
-- -----------------------------------------------------------------------------
-- THE DEFECT THIS PINS
-- -----------------------------------------------------------------------------
--
-- `submit_sell_trade_request` validated `p_transaction_type` against
-- ('sell','trade') and the action quoted it in the notification email, but the
-- insert never wrote it and `sell_trade_requests` had no column to write it to.
-- A customer who chose "trade" was therefore stored as a sell request with no
-- trace of the choice anywhere but an email. The validation made the parameter
-- look handled; the row is the only thing staff actually read.
--
-- The same shape of gap left several fields the forms ask for with nowhere to
-- land: material, movement and the trade-in target on sell/trade; condition,
-- box/papers requirement and material preference on sourcing; budget on repair.
--
-- -----------------------------------------------------------------------------
-- WHY THE NEW PARAMETERS GO LAST
-- -----------------------------------------------------------------------------
--
-- The existing call sites in `supabase/tests/50_service_flows.sql` pass these
-- functions positionally. Appending the new parameters keeps every one of those
-- calls valid, so the suite continues to prove what it already proved rather
-- than being rewritten to accommodate a signature change. A new parameter is
-- optional and defaults to null; a caller that does not know about it is not
-- broken by it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------

alter table public.sell_trade_requests
  add column if not exists transaction_type text,
  add column if not exists material         text,
  add column if not exists movement         text,
  add column if not exists trade_in_target  text;

-- A check rather than an enum: the value is one of two words and the column is
-- nullable for rows written before this migration. `transaction_type` is what
-- decides whether `trade_in_target` or `asking_price_cents` is the meaningful
-- figure, so an unrecognised value would make the row unreadable, not merely
-- untidy.
alter table public.sell_trade_requests
  drop constraint if exists sell_trade_requests_transaction_type_check;
alter table public.sell_trade_requests
  add constraint sell_trade_requests_transaction_type_check
  check (transaction_type is null or transaction_type in ('sell', 'trade'));

alter table public.sourcing_requests
  add column if not exists condition_preference text,
  add column if not exists requires_box         boolean,
  add column if not exists requires_papers      boolean,
  add column if not exists material             text;

alter table public.repair_requests
  add column if not exists budget_cents bigint;

alter table public.repair_requests
  drop constraint if exists repair_requests_budget_non_negative;
alter table public.repair_requests
  add constraint repair_requests_budget_non_negative
  check (budget_cents is null or budget_cents >= 0);

comment on column public.sell_trade_requests.transaction_type is
  'Whether the customer wants to sell outright or trade in. Previously validated '
  'by the submission function and then discarded.';
comment on column public.sell_trade_requests.trade_in_target is
  'For a trade, the piece the customer wants in exchange. Free text, because a '
  'customer may describe it more loosely than a catalogue reference.';

-- -----------------------------------------------------------------------------
-- 2. The submission functions, redefined with the extra parameters
--
-- The old signatures are dropped first. `create or replace` cannot change a
-- parameter list — it would create a second overload, and PostgREST would then
-- refuse the ambiguous call. Dropping also drops the execute grants, so they are
-- re-issued at the end of this file.
-- -----------------------------------------------------------------------------

drop function if exists public.submit_sell_trade_request(
  text, text, text, text, text, text, integer, text, boolean, boolean, bigint, text, text);
drop function if exists public.submit_sourcing_request(
  text, text, text, text, text, text, text, text, integer, integer, bigint, text);
drop function if exists public.submit_repair_request(
  text, text, text, text, text, text, text, text, boolean, text, text);

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
  p_description        text,
  p_material           text default null,
  p_movement           text default null,
  p_trade_in_target    text default null
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
    condition_notes, has_box, has_papers, asking_price_cents, transaction_type,
    material, movement, trade_in_target, workflow_status
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
    p_transaction_type,
    nullif(btrim(coalesce(p_material, '')), ''),
    nullif(btrim(coalesce(p_movement, '')), ''),
    nullif(btrim(coalesce(p_trade_in_target, '')), ''),
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
  text, text, text, text, text, text, integer, text, boolean, boolean, bigint, text, text,
  text, text, text
) is
  'Creates a sell/trade request and its opening history event, and returns the '
  'reference. Validates shape, bounds and rate limit inside the database, and '
  'persists the sell-versus-trade intent it validates.';

create or replace function public.submit_sourcing_request(
  p_name                 text,
  p_email                text,
  p_phone                text,
  p_brand_name           text,
  p_model_name           text,
  p_reference_number     text,
  p_dial_color           text,
  p_bracelet_type        text,
  p_min_year             integer,
  p_max_year             integer,
  p_max_budget_cents     bigint,
  p_notes                text,
  p_condition_preference text default null,
  p_requires_box         boolean default null,
  p_requires_papers      boolean default null,
  p_material             text default null
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
    bracelet_type, min_year, max_year, max_budget_cents, condition_preference,
    requires_box, requires_papers, material, workflow_status
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
    nullif(btrim(coalesce(p_condition_preference, '')), ''),
    p_requires_box,
    p_requires_papers,
    nullif(btrim(coalesce(p_material, '')), ''),
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
  p_name              text,
  p_email             text,
  p_phone             text,
  p_brand_name        text,
  p_model_name        text,
  p_reference_number  text,
  p_service_type      text,
  p_issue_summary     text,
  p_is_insured        boolean,
  p_preferred_contact text,
  p_description       text,
  p_budget_cents      bigint default null
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

  if p_budget_cents is not null and p_budget_cents < 0 then
    raise exception 'A budget cannot be negative' using errcode = 'check_violation';
  end if;

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
    issue_summary, is_watch_insured, preferred_contact_method, budget_cents,
    workflow_status
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
    p_budget_cents,
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

-- -----------------------------------------------------------------------------
-- 3. Grants
--
-- The drops above removed the execute grants with the old functions, so these
-- are not a formality: without them the public forms would fail with a
-- permission error rather than a validation message.
-- -----------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.submit_sell_trade_request(text,text,text,text,text,text,integer,text,boolean,boolean,bigint,text,text,text,text,text)',
    'public.submit_sourcing_request(text,text,text,text,text,text,text,text,integer,integer,bigint,text,text,boolean,boolean,text)',
    'public.submit_repair_request(text,text,text,text,text,text,text,text,boolean,text,text,bigint)'
  ]
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated, service_role', f);
  end loop;
end
$$;

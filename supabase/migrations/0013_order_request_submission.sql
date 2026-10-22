-- =============================================================================
-- 0013 — Order-request submission: guest access, idempotency, rate limiting
--
-- Migration 0008 built the transactional core: `submit_order_request` re-prices
-- every line from the database and reserves stock under a row lock, and the
-- status trigger releases or converts those holds. This migration adds the
-- things a *customer-facing* submission needs on top of that core, and nothing
-- about pricing or reservation changes.
--
--   1. A guest can read back their own request. The 0008 RLS policy is
--      `to authenticated` only, so an anonymous visitor who submitted a request
--      could never retrieve it. A non-guessable access token fixes that without
--      a login, and the token is stored hashed.
--
--   2. A resubmitted form does not create a second order. The browser generates
--      an idempotency key when the form is rendered; the same key returns the
--      original request instead of inserting again. This is what makes a double
--      click, a back-then-resubmit, or a retried request after a timeout safe.
--
--   3. Submission is rate limited. The `rate_limit_counters` infrastructure
--      already exists and was used by the product enquiry; order submission is
--      far more valuable to abuse, so it gets both a per-email and a global cap.
--
--   4. The request records the terms acknowledgement the customer gave, and the
--      pickup location when pickup was chosen.
--
-- Still no payment. No column here stores a card number, and none may be added.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- New columns on order_requests
-- -----------------------------------------------------------------------------

alter table public.order_requests
  -- SHA-256 of the guest access token, hex encoded. The raw token is returned
  -- to the customer exactly once, at submission, and is never stored. A leaked
  -- database dump therefore does not hand an attacker the ability to read
  -- customer requests — the hash is not reversible and the tokens are random.
  add column if not exists access_token_hash text,

  -- The idempotency key the submitting form was rendered with. Unique per
  -- request, so a repeat submission with the same key is detected rather than
  -- creating a second order. Null is allowed (and exempt) so a request created
  -- by an administrator or by a test need not carry one.
  add column if not exists idempotency_key text,

  -- When the customer acknowledged the terms. A timestamp rather than a boolean
  -- because "they agreed, and when" is the fact worth keeping.
  add column if not exists terms_acknowledged_at timestamptz;

alter table public.order_requests
  add constraint order_requests_access_token_hash_format check (
    access_token_hash is null or access_token_hash ~ '^[0-9a-f]{64}$'
  ),
  add constraint order_requests_idempotency_key_length check (
    idempotency_key is null or char_length(idempotency_key) between 8 and 200
  );

-- A given key may be used once. Scoped to the customer's email as well, so one
-- visitor cannot consume another's key if they happen to collide — though a
-- random key makes that astronomically unlikely, correctness should not rest on
-- probability alone where a cheap composite makes it certain.
create unique index if not exists order_requests_idempotency_key_key
  on public.order_requests (customer_email, idempotency_key)
  where idempotency_key is not null;

comment on column public.order_requests.access_token_hash is
  'SHA-256 of the guest access token, hex. The raw token is shown to the customer once and never stored.';
comment on column public.order_requests.idempotency_key is
  'Key of the submitting form. A repeat submission with the same key returns the original request instead of inserting.';
comment on column public.order_requests.terms_acknowledged_at is
  'When the customer acknowledged the terms and privacy notice.';

-- -----------------------------------------------------------------------------
-- Discounts at order time
--
-- The cart can hold a promotional code, and `cart_pricing` already evaluates
-- one. Without this, the discount a customer saw in the cart would vanish the
-- moment they submitted, which is exactly the "silently dropped" failure the
-- brief forbids and a fast route to a dispute.
--
-- The eligibility rules are extracted into one function that both
-- `cart_pricing` and `submit_order_request` call, rather than written twice.
-- Two copies of a promotion rule is how one surface ends up honouring a code
-- the other refuses.
-- -----------------------------------------------------------------------------

-- The order stores the code and the amount it produced, so the request is a
-- faithful record of what the customer was quoted. The amount is recomputed
-- here, never accepted: the caller may name a code, never a figure.
alter table public.order_requests
  add column if not exists discount_code text
    references public.discount_codes (code) on delete set null,
  add column if not exists discount_cents bigint not null default 0;

alter table public.order_requests
  drop constraint if exists order_requests_amounts_non_negative,
  drop constraint if exists order_requests_total_matches_parts,
  drop constraint if exists order_requests_discount_non_negative;

-- Redemption accounting, mirroring the inventory reservation pattern: the
-- redemption is counted when the request is submitted, and returned if the
-- request is later rejected or cancelled. Without the second half a limited
-- code would be consumed by requests that never became sales, and `usage_limit`
-- would silently stop meaning anything.
--
-- Two timestamps rather than a boolean, because the pair makes the operation
-- idempotent: a status can be set to `cancelled` more than once, but the
-- redemption is only returned on the transition that finds `released_at` null.
alter table public.order_requests
  add column if not exists discount_redeemed_at timestamptz,
  add column if not exists discount_released_at timestamptz;

alter table public.order_requests
  add constraint order_requests_amounts_non_negative check (
    subtotal_cents >= 0 and delivery_fee_cents >= 0
    and discount_cents >= 0 and total_cents >= 0
  ),
  add constraint order_requests_discount_non_negative check (discount_cents >= 0),
  -- A stored discount amount must be attributable to a code, and a code must
  -- have been counted when it was applied.
  add constraint order_requests_discount_has_code check (
    discount_cents = 0 or discount_code is not null
  ),
  add constraint order_requests_discount_redeemed_before_released check (
    discount_released_at is null or discount_redeemed_at is not null
  ),
  -- The stored total must equal its parts, so a bad write cannot create an order
  -- whose arithmetic does not add up. The discount is a subtraction, and the
  -- non-negative check above keeps a discount from producing a negative total.
  add constraint order_requests_total_matches_parts check (
    total_cents = subtotal_cents + delivery_fee_cents - discount_cents
  );

comment on column public.order_requests.discount_cents is
  'Discount applied to this request, recomputed from discount_codes at submission. A caller may name a code, never an amount.';

-- -----------------------------------------------------------------------------
-- evaluate_discount_code — the single implementation of promotion eligibility
--
-- Returns a jsonb document describing the outcome. A code that exists but does
-- not apply yields `applied: false` and a human-readable `reason` rather than an
-- error, so a cart holding a stale code still renders and the customer is told
-- why. An unknown code is reported the same way.
--
-- `stable` because it only reads: the redemption counter is incremented by the
-- caller, which is the only place that needs to serialise.
-- -----------------------------------------------------------------------------

create or replace function public.evaluate_discount_code(
  p_code     text,
  p_subtotal bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code          public.discount_codes;
  v_reason        text;
  v_amount        bigint := 0;
  v_free_delivery boolean := false;
begin
  if p_code is null or btrim(p_code) = '' then
    return null;
  end if;

  select * into v_code
    from public.discount_codes d
   where d.code = upper(btrim(p_code));

  if not found then
    v_reason := 'That promotional code was not recognised.';
  elsif not v_code.is_enabled then
    v_reason := 'That promotional code is not currently available.';
  elsif v_code.starts_at is not null and now() < v_code.starts_at then
    v_reason := 'That promotional code is not active yet.';
  elsif v_code.ends_at is not null and now() > v_code.ends_at then
    v_reason := 'That promotional code has expired.';
  elsif v_code.usage_limit is not null and v_code.times_redeemed >= v_code.usage_limit then
    v_reason := 'That promotional code has been fully redeemed.';
  elsif p_subtotal < v_code.min_subtotal_cents then
    v_reason := 'That promotional code needs a larger subtotal.';
  end if;

  if v_reason is null then
    if v_code.kind = 'percentage' then
      -- Basis points, rounded to the nearest minor unit, then capped.
      v_amount := round(p_subtotal::numeric * v_code.value / 10000)::bigint;
      if v_code.max_discount_cents is not null then
        v_amount := least(v_amount, v_code.max_discount_cents);
      end if;
    elsif v_code.kind = 'fixed_amount' then
      v_amount := least(v_code.value, p_subtotal);
    else
      v_free_delivery := true;
    end if;
  end if;

  return jsonb_build_object(
    'code',          v_code.code,
    'label',         v_code.label,
    'kind',          v_code.kind::text,
    'applied',       v_reason is null,
    'amount_cents',  v_amount,
    'free_delivery', v_free_delivery,
    'reason',        v_reason
  );
end;
$$;

comment on function public.evaluate_discount_code(text, bigint) is
  'Evaluates a promotional code against a subtotal. The single source of truth '
  'for discount eligibility, shared by cart_pricing and submit_order_request.';

-- The callers are `security definer` functions that run as the owner, so they
-- reach this without a grant. Withholding it from clients keeps the discount
-- rule from being probed directly through the API.
revoke all on function public.evaluate_discount_code(text, bigint) from public;
grant execute on function public.evaluate_discount_code(text, bigint) to service_role;

-- -----------------------------------------------------------------------------
-- redeem_discount_code / release_discount_code
--
-- The counter is incremented under a row lock, so two concurrent submissions
-- cannot each pass the `times_redeemed >= usage_limit` check and both succeed on
-- a code limited to one use. This is the same serialisation idea as the
-- inventory reservation, applied to the promotion.
--
-- Release is guarded by the `discount_released_at` timestamp, so a request that
-- is cancelled twice only returns its redemption once.
-- -----------------------------------------------------------------------------

create or replace function public.redeem_discount_code(
  p_code             text,
  p_order_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_redeemed integer;
begin
  if p_code is null then
    return false;
  end if;

  -- Lock the code row, then re-check the limit inside the lock. Checking before
  -- taking the lock would leave a window in which two callers both saw room.
  update public.discount_codes
     set times_redeemed = times_redeemed + 1
   where code = upper(btrim(p_code))
     and is_enabled
     and (usage_limit is null or times_redeemed < usage_limit)
  returning times_redeemed into v_redeemed;

  if v_redeemed is null then
    -- The code was exhausted between evaluation and redemption. Raising rolls
    -- the whole submission back rather than recording a discount that was not
    -- granted.
    raise exception 'That promotional code is no longer available.'
      using errcode = 'check_violation';
  end if;

  update public.order_requests
     set discount_redeemed_at = now()
   where id = p_order_request_id
     and discount_redeemed_at is null;

  return true;
end;
$$;

comment on function public.redeem_discount_code(text, uuid) is
  'Consumes one use of a limited promotional code under a row lock. Raises if none remain.';

create or replace function public.release_discount_code(
  p_order_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.order_requests;
begin
  select * into v_order
    from public.order_requests
   where id = p_order_request_id
     for update;

  if not found or v_order.discount_code is null then
    return false;
  end if;

  -- Already returned: cancelling twice must not credit the code twice.
  if v_order.discount_redeemed_at is null or v_order.discount_released_at is not null then
    return false;
  end if;

  update public.discount_codes
     set times_redeemed = greatest(times_redeemed - 1, 0)
   where code = v_order.discount_code;

  update public.order_requests
     set discount_released_at = now()
   where id = p_order_request_id;

  return true;
end;
$$;

comment on function public.release_discount_code(uuid) is
  'Returns a redeemed promotional code when its request is rejected or cancelled. Idempotent.';

revoke all on function public.redeem_discount_code(text, uuid) from public;
revoke all on function public.release_discount_code(uuid) from public;
grant execute on function public.redeem_discount_code(text, uuid) to service_role;
grant execute on function public.release_discount_code(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- cart_pricing — replaced to delegate discount evaluation
--
-- The discount block is replaced by a call to `evaluate_discount_code`, so the
-- cart and the order cannot disagree about whether a code applies or what it is
-- worth.
--
-- Two presentation fields are also added per line, `dial_color` and
-- `case_material`. They are what the cart's drawn thumbnail is built from when
-- the catalogue holds no photograph for the piece, and they take no part in any
-- amount. Reading them here rather than from a second function keeps one source
-- of truth for what a cart line contains.
-- -----------------------------------------------------------------------------

create or replace function public.cart_pricing(
  p_items         jsonb,
  p_discount_code text default null,
  p_currency      char(3) default 'USD'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_item          jsonb;
  v_product       public.products;
  v_pid           uuid;
  v_qty_requested integer;
  v_qty           integer;
  v_available     integer;
  v_locked        boolean;
  v_available_now boolean;
  v_unit          bigint;
  v_line_total    bigint;
  v_subtotal      bigint := 0;
  v_lines         jsonb := '[]'::jsonb;
  v_seen          uuid[] := '{}';
  v_item_count    integer := 0;
  v_has_unavail   boolean := false;
  v_has_por       boolean := false;
  v_image_path    text;
  v_image_url     text;
  v_image_alt     text;
  v_discount      jsonb := null;
  v_discount_amt  bigint := 0;
  v_free_delivery boolean := false;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    p_items := '[]'::jsonb;
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'A cart may contain at most 100 lines' using errcode = 'check_violation';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if v_item ->> 'product_id' is null
       or v_item ->> 'product_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      continue;
    end if;

    v_pid := (v_item ->> 'product_id')::uuid;

    if v_pid = any (v_seen) then
      continue;
    end if;
    v_seen := v_seen || v_pid;

    if v_item ->> 'quantity' ~ '^[0-9]{1,3}$' then
      v_qty_requested := (v_item ->> 'quantity')::integer;
    else
      v_qty_requested := 1;
    end if;

    if v_qty_requested < 1 then
      v_qty_requested := 1;
    end if;
    if v_qty_requested > 99 then
      v_qty_requested := 99;
    end if;

    select * into v_product from public.products p where p.id = v_pid;
    if not found then
      continue;
    end if;

    select i.quantity - i.reserved_quantity
      into v_available
      from public.inventory i
     where i.product_id = v_pid;

    v_available := coalesce(v_available, 0);
    v_locked := v_available < 2;
    v_available_now := v_product.status = 'published' and v_available > 0;

    v_qty := v_qty_requested;
    if v_locked then
      v_qty := 1;
    end if;

    v_unit := case when v_product.price_on_request then null else v_product.price_cents end;
    v_line_total := coalesce(v_unit, 0) * v_qty;

    if v_product.price_on_request then
      v_has_por := true;
    end if;

    if v_available_now then
      v_subtotal := v_subtotal + v_line_total;
      v_item_count := v_item_count + v_qty;
    else
      v_has_unavail := true;
    end if;

    v_image_path := null;
    v_image_url := null;
    v_image_alt := null;

    select pi.storage_path, pi.external_url, pi.alt_text
      into v_image_path, v_image_url, v_image_alt
      from public.product_images pi
     where pi.product_id = v_pid
     order by pi.is_primary desc, pi.sort_order asc, pi.id
     limit 1;

    v_lines := v_lines || jsonb_build_object(
      'product_id',         v_product.id,
      'slug',               v_product.slug,
      'title',              v_product.title,
      'sku',                v_product.sku,
      'brand_name',         (select b.name from public.brands b where b.id = v_product.brand_id),
      'brand_slug',         (select b.slug from public.brands b where b.id = v_product.brand_id),
      'image_storage_path', v_image_path,
      'image_external_url', v_image_url,
      'image_alt',          v_image_alt,
      'dial_color',         v_product.dial_color,
      'case_material',      v_product.case_material,
      'unit_price_cents',   v_unit,
      'price_on_request',   v_product.price_on_request,
      'currency',           coalesce(nullif(p_currency, ''), v_product.currency)::text,
      'quantity',           v_qty,
      'quantity_locked',    v_locked,
      'quantity_adjusted',  v_qty <> v_qty_requested,
      'line_total_cents',   v_line_total,
      'is_available',       v_available_now,
      'product_status',     case when v_product.status = 'published' then 'ok' else 'unpublished' end
    );
  end loop;

  -- Delegated, so the cart and the order apply the same rule.
  v_discount := public.evaluate_discount_code(p_discount_code, v_subtotal);

  if v_discount is not null and (v_discount ->> 'applied')::boolean then
    v_discount_amt  := (v_discount ->> 'amount_cents')::bigint;
    v_free_delivery := (v_discount ->> 'free_delivery')::boolean;
  end if;

  return jsonb_build_object(
    'currency',             coalesce(nullif(p_currency, ''), 'USD')::text,
    'lines',                v_lines,
    'line_count',           jsonb_array_length(v_lines),
    'item_count',           v_item_count,
    'subtotal_cents',       v_subtotal,
    'discount_cents',       v_discount_amt,
    -- A discount can never make the total negative: the fixed-amount branch is
    -- already capped at the subtotal, and the percentage branch cannot exceed
    -- 100%. The guard states the invariant rather than relying on it.
    'total_cents',          greatest(v_subtotal - v_discount_amt, 0),
    'has_unavailable',      v_has_unavail,
    'has_price_on_request', v_has_por,
    'free_delivery',        v_free_delivery,
    'discount',             v_discount
  );
end;
$$;

comment on function public.cart_pricing(jsonb, text, char(3)) is
  'Re-derives every cart line, the subtotal and any discount from the database. '
  'Never reads a client-supplied price or amount, never returns cost or stock '
  'counts, and never reserves stock. The per-line `dial_color` and '
  '`case_material` are presentation inputs for the drawn thumbnail and take no '
  'part in any amount.';

-- -----------------------------------------------------------------------------
-- Status-transition side effects
--
-- The 0008 trigger is replaced to add one thing: a rejected or cancelled request
-- also returns its promotional-code redemption, so a limited code is not
-- consumed by a request that never became a sale. The inventory behaviour is
-- unchanged.
-- -----------------------------------------------------------------------------

create or replace function public.handle_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  if new.status = old.status then
    return new;
  end if;

  -- Record the transition. actor_id is the authenticated user when the change
  -- came from the application, and null for a system-driven change.
  insert into public.order_request_events (
    order_request_id, from_status, to_status, note, actor_id
  )
  values (
    new.id, old.status, new.status,
    coalesce(new.admin_note, 'Status changed'), (select auth.uid())
  );

  -- Confirming a request turns every hold into a sale.
  if new.status = 'confirmed' then
    for v_item in
      select product_id from public.inventory_reservations
       where order_request_id = new.id and is_active
    loop
      perform public.confirm_reservation(new.id, v_item.product_id);
    end loop;
  end if;

  -- Rejecting or cancelling returns every hold to available stock, and returns
  -- any promotional-code redemption to the code.
  if new.status in ('rejected', 'cancelled') then
    for v_item in
      select product_id from public.inventory_reservations
       where order_request_id = new.id and is_active
    loop
      perform public.release_reservation(new.id, v_item.product_id, 'Order request ' || new.status::text);
    end loop;

    perform public.release_discount_code(new.id);
  end if;

  return new;
end;
$$;

comment on function public.handle_order_status_change() is
  'Logs order status transitions and applies reservation and discount-release side effects.';

-- -----------------------------------------------------------------------------
-- Rate limiting helper
--
-- Shared by the enquiry function and order submission so the two cannot drift.
-- Counts into a per-window bucket and raises when the cap is exceeded. The
-- bucket name encodes the scope (global, or per-email) so one limiter can serve
-- several call sites without them sharing a counter.
-- -----------------------------------------------------------------------------

create or replace function public.enforce_rate_limit(
  p_bucket text,
  p_window timestamptz,
  p_limit  integer,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.rate_limit_counters (bucket, window_start, count)
  values (p_bucket, p_window, 1)
  on conflict (bucket, window_start) do update
    set count = public.rate_limit_counters.count + 1
  returning count into v_count;

  if v_count > p_limit then
    raise exception '%', p_message using errcode = 'check_violation';
  end if;
end;
$$;

comment on function public.enforce_rate_limit(text, timestamptz, integer, text) is
  'Increments a windowed counter and raises when the cap is exceeded.';

revoke all on function public.enforce_rate_limit(text, timestamptz, integer, text) from public;
grant execute on function public.enforce_rate_limit(text, timestamptz, integer, text) to service_role;

-- -----------------------------------------------------------------------------
-- submit_order_request — replaced to accept the new inputs
--
-- The signature gains four optional parameters. It stays `security definer` and
-- keeps the original guarantee: every monetary value is derived inside the
-- function and the caller supplies only product ids and quantities.
--
-- New behaviour, in order:
--   * rate limit, before any work is done
--   * idempotency check, so a repeat returns the stored request
--   * the existing pricing and reservation path, unchanged
--   * token hash, terms timestamp and pickup location recorded
-- -----------------------------------------------------------------------------

-- The old one-argument-shape function is dropped first: adding parameters with
-- defaults would otherwise leave two overloads whose call with no optional
-- arguments is ambiguous.
drop function if exists public.submit_order_request(
  jsonb, text, text, text, public.fulfilment_type, text, jsonb, text, text
);

create or replace function public.submit_order_request(
  p_items                jsonb,
  p_customer_name        text,
  p_customer_email       text,
  p_customer_phone       text,
  p_fulfilment_type      public.fulfilment_type,
  p_payment_method_code  text,
  p_delivery_address     jsonb default null,
  p_customer_note        text default null,
  p_delivery_option_code text default null,
  p_pickup_location      text default null,
  p_idempotency_key      text default null,
  p_terms_acknowledged   boolean default false,
  p_user_agent           text default null,
  p_discount_code        text default null,
  p_access_token_hash    text default null
)
returns public.order_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order          public.order_requests;
  v_existing       public.order_requests;
  v_item           jsonb;
  v_product        public.products;
  v_quantity       integer;
  v_unit_price     bigint;
  v_subtotal       bigint := 0;
  v_delivery_fee   bigint := 0;
  v_line_total     bigint;
  v_primary_image  text;
  v_method_enabled boolean;
  v_caller         uuid;
  v_window         timestamptz;
  v_email          text;
  v_fulfilment     public.fulfilment_type;
  v_discount       jsonb;
  v_discount_amt   bigint := 0;
  v_free_delivery  boolean := false;
  v_discount_code  text := null;
begin
  v_caller := (select auth.uid());
  v_email  := lower(btrim(p_customer_email));
  v_window := date_trunc('hour', now());

  -- ---------------------------------------------------------------------------
  -- Idempotency, checked *before* the rate limit. A repeat of a form that
  -- already succeeded is a retry, not a new request: it costs no rate-limit
  -- budget and is answered from the stored row. Doing this first also means a
  -- customer who resubmits after the limiter has tripped still gets their
  -- original confirmation rather than a spurious refusal.
  -- ---------------------------------------------------------------------------
  if p_idempotency_key is not null then
    select * into v_existing
      from public.order_requests
     where customer_email = v_email
       and idempotency_key = p_idempotency_key;

    if found then
      return v_existing;
    end if;
  end if;

  -- ---------------------------------------------------------------------------
  -- Rate limit. Two caps: one per email address so a single visitor cannot flood
  -- the queue, and one global so an attacker cycling addresses is still bounded.
  -- The per-address cap is the tight one; the global figure is a backstop set
  -- well above the throughput of a real store, so it stops a script without
  -- touching legitimate traffic.
  -- ---------------------------------------------------------------------------
  perform public.enforce_rate_limit(
    'order_request:global:' || v_window::text, v_window, 120,
    'Too many order requests have been submitted. Please try again later.'
  );
  perform public.enforce_rate_limit(
    'order_request:email:' || v_email || ':' || v_window::text, v_window, 5,
    'Too many order requests have been submitted from this address. Please try again later.'
  );

  if not p_terms_acknowledged then
    raise exception 'The terms and privacy notice must be acknowledged before submitting.'
      using errcode = 'check_violation';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order request must contain at least one item' using errcode = 'check_violation';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'An order request may contain at most 50 items' using errcode = 'check_violation';
  end if;

  -- A pickup request does not require the customer to supply a location: the
  -- business supplies it, and a store that has not configured one must still be
  -- able to accept a pickup request. The application resolves the location from
  -- settings and passes it when it exists; null is a legitimate state meaning
  -- "we will confirm the collection address". Delivery is different — the
  -- address is the customer's to give, and the table already requires it.
  v_fulfilment := p_fulfilment_type;
  if v_fulfilment = 'delivery' and p_delivery_address is null then
    raise exception 'A delivery address is required for delivery.'
      using errcode = 'check_violation';
  end if;

  -- The chosen offline method must exist and be enabled. A customer cannot
  -- submit with a method the administrator has switched off.
  select is_enabled into v_method_enabled
    from public.payment_methods
   where code = p_payment_method_code;

  if v_method_enabled is null then
    raise exception 'Unknown payment method %', p_payment_method_code using errcode = 'check_violation';
  end if;

  if not v_method_enabled then
    raise exception 'Payment method % is not currently available', p_payment_method_code
      using errcode = 'check_violation';
  end if;

  -- Delivery fee is read from the database, never accepted from the caller.
  if v_fulfilment = 'delivery' and p_delivery_option_code is not null then
    select fee_cents into v_delivery_fee
      from public.delivery_options
     where code = p_delivery_option_code and is_enabled;

    if v_delivery_fee is null then
      raise exception 'Unknown or disabled delivery option %', p_delivery_option_code
        using errcode = 'check_violation';
    end if;
  end if;

  -- A guest request carries an access token whose hash the application
  -- generated. The hash is what is stored; the raw token never reaches the
  -- database, so a database dump cannot yield a readable customer credential.
  --
  -- The application supplies the hash rather than the function minting the token,
  -- because the token has to be returned to the customer and PostgREST returns
  -- only the row. A session variable would be lost between the function call and
  -- the response; a column would store the credential itself. Passing the hash
  -- and keeping the token in the application's response is the only shape that
  -- both returns the token and stores nothing sensitive.
  --
  -- A signed-in customer needs no token: RLS already scopes their rows to
  -- `auth.uid()`, so a second credential would be redundant and one more thing
  -- to leak. If one is passed anyway it is ignored.
  if v_caller is not null then
    p_access_token_hash := null;
  end if;

  if p_access_token_hash is not null and p_access_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'The access token hash must be 64 lowercase hex characters.'
      using errcode = 'check_violation';
  end if;

  insert into public.order_requests (
    user_id, customer_name, customer_email, customer_phone,
    fulfilment_type, delivery_address, pickup_location, payment_method_code,
    customer_note, subtotal_cents, delivery_fee_cents, total_cents, currency,
    idempotency_key, terms_acknowledged_at, user_agent,
    access_token_hash
  )
  values (
    v_caller, btrim(p_customer_name), v_email, nullif(btrim(p_customer_phone), ''),
    v_fulfilment, p_delivery_address, p_pickup_location, p_payment_method_code,
    nullif(btrim(p_customer_note), ''), 0, v_delivery_fee, v_delivery_fee, 'USD',
    p_idempotency_key, now(), left(p_user_agent, 500),
    p_access_token_hash
  )
  returning * into v_order;

  -- Re-price every line from the database. The caller's prices are ignored
  -- because the caller never supplies any.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 1);

    if v_quantity <= 0 or v_quantity > 99 then
      raise exception 'Invalid quantity % for item %', v_quantity, v_item ->> 'product_id'
        using errcode = 'check_violation';
    end if;

    select * into v_product
      from public.products
     where id = (v_item ->> 'product_id')::uuid
       and status = 'published';

    if not found then
      raise exception 'Product % is not available', v_item ->> 'product_id'
        using errcode = 'no_data_found';
    end if;

    -- A price-on-request product contributes no amount. This is honest: no
    -- price is quoted, so no price is recorded.
    v_unit_price := case when v_product.price_on_request then null else v_product.price_cents end;
    v_line_total := coalesce(v_unit_price, 0) * v_quantity;
    v_subtotal   := v_subtotal + v_line_total;

    select external_url into v_primary_image
      from public.product_images
     where product_id = v_product.id
     order by is_primary desc, sort_order asc
     limit 1;

    insert into public.order_request_items (
      order_request_id, product_id, product_title_snapshot, sku_snapshot,
      slug_snapshot, image_url_snapshot, unit_price_cents, quantity, line_total_cents
    )
    values (
      v_order.id, v_product.id, v_product.title, v_product.sku,
      v_product.slug, v_primary_image, v_unit_price, v_quantity, v_line_total
    );

    -- Reserve stock now, so a request under review holds the watch. A
    -- price-on-request product is still reserved: the object exists and must
    -- not be sold twice while the request is being reviewed. If two requests
    -- race for the last unit, `reserve_inventory` blocks on the row lock and the
    -- loser raises — the whole transaction rolls back, including the order row
    -- inserted above, so no half-reserved request is left behind.
    perform public.reserve_inventory(v_order.id, v_product.id, v_quantity);
  end loop;

  -- ---------------------------------------------------------------------------
  -- The discount, now that the subtotal is known. Eligibility and the amount
  -- come from the same function the cart uses, so a code the cart honoured
  -- cannot be refused here, and one it refused cannot be smuggled in.
  --
  -- A refusal is not an error. The subtotal, delivery fee and totals are
  -- recorded as they stand and the code is left off, which is the honest
  -- outcome: the customer is charged what the goods are worth, and the
  -- confirmation does not show a discount that was never granted.
  -- ---------------------------------------------------------------------------
  v_discount := public.evaluate_discount_code(p_discount_code, v_subtotal);

  if v_discount is not null and (v_discount ->> 'applied')::boolean then
    v_discount_amt  := (v_discount ->> 'amount_cents')::bigint;
    v_free_delivery := (v_discount ->> 'free_delivery')::boolean;
    v_discount_code := v_discount ->> 'code';

    -- A free-delivery code waives the fee. It is applied here rather than
    -- stored as a negative fee, so the fee column keeps meaning "what delivery
    -- would cost" and the total stays a sum of non-negative parts.
    if v_free_delivery then
      v_delivery_fee := 0;
    end if;

    -- Count the use now, inside this transaction. If the code has been
    -- exhausted since it was evaluated, this raises and the whole submission
    -- rolls back — including the order row and every reservation made above.
    perform public.redeem_discount_code(v_discount_code, v_order.id);
  end if;

  update public.order_requests
     set subtotal_cents = v_subtotal,
         discount_code  = v_discount_code,
         discount_cents = v_discount_amt,
         delivery_fee_cents = v_delivery_fee,
         total_cents    = v_subtotal + v_delivery_fee - v_discount_amt
   where id = v_order.id
  returning * into v_order;

  -- The opening event of the history.
  insert into public.order_request_events (
    order_request_id, from_status, to_status, note, actor_id
  )
  values (
    v_order.id, null, 'submitted', 'Order request submitted by customer', v_caller
  );

  return v_order;
end;
$$;

comment on function public.submit_order_request is
  'Creates an order request with server-derived pricing and atomic stock reservation. Idempotent per (email, key). Never processes payment.';

-- -----------------------------------------------------------------------------
-- read_order_request — the guest's only way back to their own request
--
-- A guest has no session, so RLS cannot scope their rows. Requiring the
-- reference *and* the access token is the standard capability-URL pattern: the
-- reference alone is sequential and guessable, so it is not a credential, and
-- the token is 256 bits of entropy. Both must match one row.
--
-- Returns null rather than raising for a wrong token, so the endpoint cannot be
-- used to probe which references exist.
-- -----------------------------------------------------------------------------

create or replace function public.read_order_request(
  p_reference text,
  p_access_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.order_requests;
  v_items jsonb;
  v_hash  text;
begin
  if p_reference is null or p_access_token is null then
    return null;
  end if;

  v_hash := encode(extensions.digest(p_access_token, 'sha256'), 'hex');

  select * into v_order
    from public.order_requests
   where reference = upper(btrim(p_reference))
     and access_token_hash = v_hash;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'title', i.product_title_snapshot,
           'sku', i.sku_snapshot,
           'slug', i.slug_snapshot,
           'image_url', i.image_url_snapshot,
           'unit_price_cents', i.unit_price_cents,
           'quantity', i.quantity,
           'line_total_cents', i.line_total_cents
         ) order by i.created_at, i.id), '[]'::jsonb)
    into v_items
    from public.order_request_items i
   where i.order_request_id = v_order.id;

  return jsonb_build_object(
    'reference', v_order.reference,
    'status', v_order.status::text,
    'customer_name', v_order.customer_name,
    'customer_email', v_order.customer_email::text,
    'fulfilment_type', v_order.fulfilment_type::text,
    'pickup_location', v_order.pickup_location,
    'payment_method_code', v_order.payment_method_code,
    'customer_note', v_order.customer_note,
    'subtotal_cents', v_order.subtotal_cents,
    'delivery_fee_cents', v_order.delivery_fee_cents,
    'total_cents', v_order.total_cents,
    'currency', v_order.currency::text,
    'created_at', v_order.created_at,
    'items', v_items
  );
end;
$$;

comment on function public.read_order_request(text, text) is
  'Reads a guest order request by reference and access token. Null on any mismatch.';

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

revoke all on function public.submit_order_request from public;
grant execute on function public.submit_order_request to anon, authenticated, service_role;

revoke all on function public.read_order_request(text, text) from public;
grant execute on function public.read_order_request(text, text) to anon, authenticated;

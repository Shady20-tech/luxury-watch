-- =============================================================================
-- 0012 — Wishlist and cart
--
-- Phase 7. Two features, one migration, because they share the same rule: the
-- browser is a display surface, never a source of truth.
--
-- -----------------------------------------------------------------------------
-- WHAT THIS MIGRATION ADDS
-- -----------------------------------------------------------------------------
--
--   1. `discount_kind` and `discount_codes` — administrator-configured
--      promotional codes. There is no public read policy, so the list of codes
--      cannot be enumerated through the API.
--   2. `carts.discount_code` — the code a customer has applied, stored as a
--      reference to the code rather than as an amount.
--   3. `cart_pricing(...)` — the single source of truth for every number the
--      cart displays. It re-reads each product, decides availability, decides
--      whether the product model permits a quantity above one, and recomputes
--      the discount. It is `security definer` because it must see unpublished
--      rows (to report them honestly) and must never return `cost_cents`.
--   4. `catalogue_by_ids(...)` — the published product card rows for a set of
--      ids. The wishlist needs this because `wishlist_items` can reference a
--      product that has since been unpublished, and a wishlist that showed a
--      draft would be a leak.
--
-- -----------------------------------------------------------------------------
-- WHAT A CART DOES NOT DO
-- -----------------------------------------------------------------------------
--
-- A cart does not reserve stock. Nothing in this migration decrements
-- `inventory`, writes `inventory_reservations` or touches
-- `inventory_transactions`. Adding a watch to a cart is a statement of intent;
-- the piece is only held when an order request is submitted and an
-- administrator confirms it. Any copy claiming otherwise would be false, and
-- `cart_pricing` deliberately reports availability rather than claiming a hold.
--
-- -----------------------------------------------------------------------------
-- WHY PRICING LIVES IN THE DATABASE
-- -----------------------------------------------------------------------------
--
-- The cart's numbers are read by an anonymous visitor holding a public anon key
-- as well as by a signed-in customer, and the same numbers are re-derived when
-- an order request is submitted. Deriving them in Postgres means there is one
-- implementation of "what does this line cost", used by the cart, the drawer
-- and the order path, rather than an application copy that can drift from the
-- order path's copy. It is the same reasoning as `submit_order_request` (0008).
--
-- -----------------------------------------------------------------------------
-- WHAT `cart_pricing` DELIBERATELY DOES NOT REVEAL
-- -----------------------------------------------------------------------------
--
--   * `cost_cents` and `compare_at_cents` — never selected. Migration 0011
--     revoked the column grants from the public roles; this function runs as the
--     owner, so it *could* read them, and the point is that it does not.
--   * Exact stock counts. The result carries booleans, never a number:
--     `is_available` (any unreserved unit) and `quantity_locked` (fewer than two
--     unreserved units, so the stepper must stay at one). Reporting a maximum
--     quantity would let a caller binary-search the business's inventory
--     position, which is exactly the oracle 0009 exists to prevent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- discount_kind
--
-- `free_delivery` is a real kind rather than a special case of `fixed_amount`:
-- it changes the delivery fee on the order request, not the goods subtotal, and
-- modelling it as a zero-value amount would lose that distinction.
-- -----------------------------------------------------------------------------

create type public.discount_kind as enum ('percentage', 'fixed_amount', 'free_delivery');

-- -----------------------------------------------------------------------------
-- discount_codes
--
-- `value` is basis points for a percentage (0–10000, so 1250 is 12.5%) and minor
-- currency units for a fixed amount. Storing a percentage as basis points keeps
-- money and rates in integers, which is the same reason prices are `bigint`
-- cents rather than `numeric`.
--
-- The code is stored upper-cased and compared upper-cased, so `save10` and
-- `SAVE10` are the same code. `code` is the natural key, because the order
-- request records the code the customer quoted, not a surrogate id.
-- -----------------------------------------------------------------------------

create table public.discount_codes (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null,
  label              text not null,
  description        text,
  kind               public.discount_kind not null default 'percentage',
  value              bigint not null default 0,
  -- The discount only applies once the goods subtotal reaches this figure.
  min_subtotal_cents bigint not null default 0,
  -- Caps a percentage discount, so "20% off" cannot become unbounded on a
  -- six-figure piece. Null means no cap.
  max_discount_cents bigint,
  starts_at          timestamptz,
  ends_at            timestamptz,
  is_enabled         boolean not null default false,
  -- Null means unlimited. Redemptions are counted when an order request using
  -- the code is confirmed; the cart only reads this figure.
  usage_limit        integer,
  times_redeemed     integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint discount_codes_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  constraint discount_codes_label_length check (char_length(trim(label)) between 1 and 120),
  constraint discount_codes_value_non_negative check (value >= 0),
  constraint discount_codes_min_subtotal_non_negative check (min_subtotal_cents >= 0),
  constraint discount_codes_max_discount_non_negative check (
    max_discount_cents is null or max_discount_cents >= 0
  ),
  -- A percentage is a rate in basis points and can never exceed 100%.
  constraint discount_codes_percentage_bounds check (
    kind <> 'percentage' or value between 0 and 10000
  ),
  -- A fixed amount with no value would be a code that does nothing.
  constraint discount_codes_fixed_amount_positive check (
    kind <> 'fixed_amount' or value > 0
  ),
  constraint discount_codes_window_order check (
    starts_at is null or ends_at is null or starts_at <= ends_at
  ),
  constraint discount_codes_usage_limit_positive check (usage_limit is null or usage_limit > 0),
  constraint discount_codes_redeemed_non_negative check (times_redeemed >= 0),
  constraint discount_codes_redeemed_within_limit check (
    usage_limit is null or times_redeemed <= usage_limit
  )
);

comment on table public.discount_codes is
  'Administrator-configured promotional codes. Eligibility and the discount '
  'amount are always recomputed in the database; a client-supplied amount is '
  'never accepted.';

create unique index discount_codes_code_key on public.discount_codes (code);
create index discount_codes_enabled_idx on public.discount_codes (is_enabled);

create trigger discount_codes_set_updated_at
  before update on public.discount_codes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- carts.discount_code
--
-- The applied code is stored as a reference, not as a discount amount. If the
-- administrator disables the code, or its window closes, the cart stops
-- applying it on the next read without anything having to be recalculated
-- eagerly. `on delete set null` means removing a code cannot break a cart.
-- -----------------------------------------------------------------------------

alter table public.carts
  add column discount_code text references public.discount_codes (code) on delete set null;

comment on column public.carts.discount_code is
  'The promotional code the customer applied. The amount is derived from this on '
  'every read; no discount figure is ever stored on the cart.';

-- -----------------------------------------------------------------------------
-- Row Level Security for discount_codes
--
-- There is deliberately NO read policy for `anon` or `authenticated`. A public
-- read policy would let anyone holding the anon key enumerate every live code,
-- including codes that have not been announced. A customer learns whether their
-- own code applies from `cart_pricing`, which returns a reason string and never
-- a list.
--
-- Writes are staff-only, gated on the same `settings.write` permission that
-- already guards `payment_methods` and `delivery_options`.
-- -----------------------------------------------------------------------------

alter table public.discount_codes enable row level security;

create policy discount_codes_staff_write on public.discount_codes
  for all to authenticated
  using (public.has_permission('settings.write'))
  with check (public.has_permission('settings.write'));

-- -----------------------------------------------------------------------------
-- cart_pricing — the single source of truth for every number the cart shows
--
-- Input:  `p_items`          an array of `{"product_id": uuid, "quantity": int}`
--         `p_discount_code`  the code the customer typed, or null
--         `p_currency`       the display currency
--
-- Output: a jsonb document:
--
--   {
--     "currency": "USD",
--     "lines": [
--       {
--         "product_id": "...", "slug": "...", "title": "...", "sku": "...",
--         "brand_name": null|string, "brand_slug": null|string,
--         "image_storage_path": null|string, "image_external_url": null|string,
--         "image_alt": null|string,
--         "dial_color": null|string,      -- drawn-thumbnail input, not an amount
--         "case_material": null|string,   -- drawn-thumbnail input, not an amount
--         "unit_price_cents": null|int,   -- null for price-on-request
--         "price_on_request": bool,
--         "quantity": int,                -- what the line will hold
--         "quantity_locked": bool,        -- a unique piece: only one is possible
--         "quantity_adjusted": bool,      -- the requested quantity was reduced
--         "line_total_cents": int,
--         "is_available": bool,
--         "product_status": "ok"|"unpublished"
--       }
--     ],
--     "line_count": int, "item_count": int,
--     "subtotal_cents": int, "discount_cents": int, "total_cents": int,
--     "has_unavailable": bool, "has_price_on_request": bool,
--     "free_delivery": bool,
--     "discount": null | {
--       "code": "...", "label": "...", "kind": "...", "applied": bool,
--       "amount_cents": int, "reason": null|string
--     }
--   }
--
-- A line whose product is unpublished or unavailable is still returned, marked,
-- and excluded from the subtotal. Silently dropping it would mean a customer's
-- cart quietly loses an item, which is the failure mode the brief calls out.
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
  -- Three scalars rather than a `record`: a `SELECT INTO` a record variable that
  -- matches no row leaves it unassigned, and reading a field then raises.
  v_image_path    text;
  v_image_url     text;
  v_image_alt     text;
  v_code          public.discount_codes;
  v_reason        text;
  v_discount_amt  bigint := 0;
  v_free_delivery boolean := false;
  v_discount      jsonb := null;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    p_items := '[]'::jsonb;
  end if;

  -- Bounded, like the catalogue's page size. The API is reachable with the
  -- public anon key, so the limit is enforced here rather than only in the UI.
  if jsonb_array_length(p_items) > 100 then
    raise exception 'A cart may contain at most 100 lines' using errcode = 'check_violation';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Validate the id's shape before casting. A malformed value would otherwise
    -- raise inside the cast, turning a bad request into a 500.
    if v_item ->> 'product_id' is null
       or v_item ->> 'product_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      continue;
    end if;

    v_pid := (v_item ->> 'product_id')::uuid;

    -- The same product twice is one line. `cart_items` already enforces this for
    -- the stored cart; the guard here means a caller cannot inflate a subtotal by
    -- repeating a line.
    if v_pid = any (v_seen) then
      continue;
    end if;
    v_seen := v_seen || v_pid;

    -- The quantity is parsed through a shape check rather than a bare cast, so a
    -- non-numeric or absurd value becomes the default rather than an error.
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
      -- A hard-deleted product cascades its cart rows away, so this is a
      -- defensive branch rather than an expected state.
      continue;
    end if;

    select i.quantity - i.reserved_quantity
      into v_available
      from public.inventory i
     where i.product_id = v_pid;

    v_available := coalesce(v_available, 0);

    -- A unique object: fewer than two unreserved units means the product model
    -- permits a quantity of exactly one. This is the rule the brief calls
    -- "change quantity only when the product model permits it".
    v_locked := v_available < 2;

    v_available_now := v_product.status = 'published' and v_available > 0;

    v_qty := v_qty_requested;
    if v_locked then
      v_qty := 1;
    end if;

    -- A price-on-request piece contributes no amount. That is honest: no price
    -- is quoted, so none is recorded or shown.
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

  -- ---------------------------------------------------------------------------
  -- The discount. Every figure is recomputed here; the caller supplies a code
  -- and nothing else. An eligibility failure is reported as a reason rather than
  -- an error, so a cart with a stale code still renders.
  -- ---------------------------------------------------------------------------
  if p_discount_code is not null and btrim(p_discount_code) <> '' then
    select * into v_code
      from public.discount_codes d
     where d.code = upper(btrim(p_discount_code));

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
    elsif v_subtotal < v_code.min_subtotal_cents then
      v_reason := 'That promotional code needs a larger subtotal.';
    end if;

    if v_reason is null then
      if v_code.kind = 'percentage' then
        -- Basis points, rounded to the nearest minor unit, then capped.
        v_discount_amt := round(v_subtotal::numeric * v_code.value / 10000)::bigint;
        if v_code.max_discount_cents is not null then
          v_discount_amt := least(v_discount_amt, v_code.max_discount_cents);
        end if;
      elsif v_code.kind = 'fixed_amount' then
        v_discount_amt := least(v_code.value, v_subtotal);
      else
        v_free_delivery := true;
      end if;
    end if;

    v_discount := jsonb_build_object(
      'code',         v_code.code,
      'label',        v_code.label,
      'kind',         v_code.kind::text,
      'applied',      v_reason is null,
      'amount_cents', v_discount_amt,
      'reason',       v_reason
    );
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
  'counts, and never reserves stock.';

-- -----------------------------------------------------------------------------
-- catalogue_by_ids — published product cards for a set of ids
--
-- The wishlist stores product ids, and a saved product can since have been
-- unpublished, archived or deleted. This function returns a row only for a
-- product that is still published and whose brand and model are still active,
-- so a wishlist cannot be used to confirm that a draft exists — the same gate
-- `catalogue_similar` applies (0011).
--
-- The column list matches `catalogue_search` minus its pagination fields, so the
-- wishlist reuses the catalogue card mapping unchanged and cannot describe a
-- watch differently from the grid.
-- -----------------------------------------------------------------------------

create or replace function public.catalogue_by_ids(p_product_ids uuid[])
returns table (
  id                uuid,
  slug              text,
  title             text,
  brand_name        text,
  brand_slug        text,
  model_name        text,
  model_slug        text,
  reference_number  text,
  production_year   integer,
  condition         text,
  case_size_mm      numeric,
  case_material     text,
  movement          text,
  dial_color        text,
  bracelet_material text,
  gender            text,
  box_and_papers    boolean,
  price_cents       bigint,
  currency          text,
  price_on_request  boolean,
  published_at      timestamptz,
  is_featured       boolean,
  image_storage_path text,
  image_external_url text,
  image_alt         text,
  is_available      boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.slug,
    p.title,
    b.name,
    b.slug,
    m.name,
    m.slug,
    p.reference_number,
    p.production_year,
    p.condition::text,
    p.case_size_mm,
    p.case_material,
    p.movement,
    p.dial_color,
    p.bracelet_material,
    p.gender,
    p.box_and_papers,
    p.price_cents,
    p.currency::text,
    p.price_on_request,
    p.published_at,
    p.is_featured,
    img.storage_path,
    img.external_url,
    img.alt_text,
    public.is_product_available(p.id)
  from public.products p
  -- An inactive brand or model is excluded, exactly as the catalogue's own
  -- active-taxonomy gate does, so a wishlist cannot surface a product the shop
  -- grid would hide.
  left join public.brands b on b.id = p.brand_id and b.is_active
  left join public.models m on m.id = p.model_id and m.is_active
  left join lateral (
    select pi.storage_path, pi.external_url, pi.alt_text
      from public.product_images pi
     where pi.product_id = p.id
     order by pi.is_primary desc, pi.sort_order asc, pi.id
     limit 1
  ) img on true
  where p.id = any (p_product_ids)
    and p.status = 'published'
    and (p.brand_id is null or b.id is not null)
    and (p.model_id is null or m.id is not null)
  order by p.published_at desc nulls last, p.id;
$$;

comment on function public.catalogue_by_ids(uuid[]) is
  'Published product card rows for a set of ids, for the wishlist. Returns no '
  'row for an unpublished, archived or unknown product, and none for a product '
  'whose brand or model has been deactivated.';

-- -----------------------------------------------------------------------------
-- Grants
--
-- `security definer` changes whose privileges the body runs with, not who may
-- call it. Postgres grants EXECUTE to PUBLIC by default, so the REVOKEs are
-- load-bearing.
--
-- Both functions are callable by an anonymous visitor: the cart and the guest
-- wishlist both exist before sign-in. Neither returns anything a signed-out
-- visitor is not entitled to see — `cart_pricing` reports only the products the
-- caller already named, and `catalogue_by_ids` returns only published rows.
-- -----------------------------------------------------------------------------

revoke all on function public.cart_pricing(jsonb, text, char(3)) from public;
grant execute on function public.cart_pricing(jsonb, text, char(3)) to anon, authenticated;

revoke all on function public.catalogue_by_ids(uuid[]) from public;
grant execute on function public.catalogue_by_ids(uuid[]) to anon, authenticated;

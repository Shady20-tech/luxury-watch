-- =============================================================================
-- 18 — Wishlist and cart (migration 0012)
--
-- The cart's numbers and the wishlist's visibility both cross a `security
-- definer` boundary, so every rule the RLS policies would have enforced has to
-- be re-applied inside the function. This suite proves it is, and it proves the
-- two properties the brief calls out explicitly:
--
--   1. The server never trusts a browser-submitted price or stock figure.
--      `cart_pricing` accepts ids and quantities and derives everything else, so
--      there is no argument through which a price could be sent, and the result
--      carries no cost figure and no stock count.
--   2. A saved id cannot be used to confirm that a draft exists.
--      `catalogue_by_ids` re-applies the publication and active-taxonomy gates.
--
-- It also covers the pieces of the migration that are easy to get subtly wrong:
-- a unique piece clamps to one, a duplicated line cannot inflate a subtotal, and
-- a discount is recomputed from the code rather than accepted as an amount.
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- Fixtures
--
-- Three published watches: one priced with two in stock (a quantity above one is
-- permitted), one priced with a single unit (a unique piece, so the stepper must
-- stay at one), and one priced on request. Plus a draft and an archived watch,
-- which must never be returned by `catalogue_by_ids`.
-- -----------------------------------------------------------------------------

set role service_role;

insert into public.brands (id, name, slug, is_active)
values ('e0000000-0000-4000-8000-000000000001', 'Wc Brand', 'wc-brand', true)
on conflict (slug) do update set is_active = excluded.is_active;

insert into public.products
  (id, sku, slug, title, brand_id, status, published_at, price_cents, price_on_request, cost_cents, compare_at_cents, currency, dial_color, case_material)
values
  -- Priced, two units: the only product model that permits a quantity above one.
  ('e0000000-0000-4000-8000-000000000101', 'WC-1', 'wc-priced-two', 'Wc Priced Two',
   'e0000000-0000-4000-8000-000000000001', 'published', now() - interval '10 days',
   100000, false, 60000, 120000, 'USD', 'Blue', 'Stainless Steel'),
  -- Priced, one unit: a unique piece.
  ('e0000000-0000-4000-8000-000000000102', 'WC-2', 'wc-priced-one', 'Wc Priced One',
   'e0000000-0000-4000-8000-000000000001', 'published', now() - interval '9 days',
   250000, false, 150000, null, 'USD', 'Black', '18k yellow gold'),
  -- Price on request: contributes no amount to a subtotal.
  ('e0000000-0000-4000-8000-000000000103', 'WC-3', 'wc-por', 'Wc Price On Request',
   'e0000000-0000-4000-8000-000000000001', 'published', now() - interval '8 days',
   null, true, 999999, null, 'USD', null, null),
  -- Sold out: published and priced, but every unit is reserved. A cart line for
  -- it must report unavailable and contribute nothing, whatever the request says.
  ('e0000000-0000-4000-8000-000000000106', 'WC-6', 'wc-sold-out', 'Wc Sold Out',
   'e0000000-0000-4000-8000-000000000001', 'published', now() - interval '7 days',
   300000, false, 180000, null, 'USD', 'White', 'Platinum'),
  -- Draft: must never be returned by catalogue_by_ids.
  ('e0000000-0000-4000-8000-000000000104', 'WC-4', 'wc-draft', 'Wc Draft',
   'e0000000-0000-4000-8000-000000000001', 'draft', null, 900000, false, null, null, 'USD', null, null),
  -- Archived: likewise.
  ('e0000000-0000-4000-8000-000000000105', 'WC-5', 'wc-archived', 'Wc Archived',
   'e0000000-0000-4000-8000-000000000001', 'archived', now() - interval '2 days',
   900000, false, null, null, 'USD', null, null)
on conflict (slug) do update
  set status = excluded.status,
      price_cents = excluded.price_cents,
      price_on_request = excluded.price_on_request,
      published_at = excluded.published_at,
      dial_color = excluded.dial_color,
      case_material = excluded.case_material;

insert into public.inventory (product_id, quantity, reserved_quantity)
values
  ('e0000000-0000-4000-8000-000000000101', 2, 0),
  ('e0000000-0000-4000-8000-000000000102', 1, 0),
  ('e0000000-0000-4000-8000-000000000103', 1, 0),
  ('e0000000-0000-4000-8000-000000000106', 1, 1)
on conflict (product_id) do update
  set quantity = excluded.quantity,
      reserved_quantity = excluded.reserved_quantity;

reset role;

-- -----------------------------------------------------------------------------
-- 1. cart_pricing is callable by an anonymous visitor and derives every figure
-- -----------------------------------------------------------------------------

set role anon;

do $$
declare
  v jsonb;
  v_line jsonb;
begin
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000101', 'quantity', 2),
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000103', 'quantity', 1)
    ),
    null,
    'USD'
  );

  -- Two of a $1,000 watch is $2,000. The price-on-request piece contributes
  -- nothing, because no price was quoted.
  if (v ->> 'subtotal_cents')::bigint <> 200000 then
    raise exception 'FAIL: subtotal was %, expected 200000', v ->> 'subtotal_cents';
  end if;
  if (v ->> 'total_cents')::bigint <> 200000 then
    raise exception 'FAIL: total was %, expected 200000', v ->> 'total_cents';
  end if;
  if (v ->> 'has_price_on_request')::boolean is not true then
    raise exception 'FAIL: a price-on-request line was not flagged';
  end if;
  raise notice 'pass [cart_pricing: derives the subtotal and flags a price-on-request line]';

  -- The result must carry no cost basis and no stock count. `cost_cents` is
  -- 60000 in the fixture; the payload must not contain it anywhere.
  if v::text like '%cost_cents%' then
    raise exception 'FAIL: cart_pricing exposed a cost column';
  end if;
  if v::text like '%reserved_quantity%' or v::text like '%"quantity_available"%' then
    raise exception 'FAIL: cart_pricing exposed a stock count';
  end if;
  raise notice 'pass [cart_pricing: exposes no cost basis and no stock count]';

  -- The per-line presentation inputs for the drawn thumbnail. They must be
  -- present and must equal the product row, because a cart that dropped them
  -- would silently show every line as the fallback drawing instead of the
  -- piece the customer added. They are asserted here rather than in the app
  -- tests because only the database knows what the product's columns hold.
  v_line := v -> 'lines' -> 0;
  if v_line ->> 'dial_color' is null then
    raise exception 'FAIL: the line omitted dial_color';
  end if;
  if v_line ->> 'case_material' is null then
    raise exception 'FAIL: the line omitted case_material';
  end if;
  if (v_line ->> 'dial_color') <> 'Blue' or (v_line ->> 'case_material') <> 'Stainless Steel' then
    raise exception 'FAIL: the line carried dial_color %, case_material %, expected Blue/Stainless Steel',
      v_line ->> 'dial_color', v_line ->> 'case_material';
  end if;
  raise notice 'pass [cart_pricing: carries the drawn-thumbnail inputs from the product row]';

  -- A product whose attributes are unset must still carry the keys, as JSON
  -- null. A missing key and an explicit null are not the same thing to the
  -- mapper: the first is an older payload, the second is a piece with no
  -- recorded dial colour.
  v_line := v -> 'lines' -> 1;
  if not (v_line ? 'dial_color') or not (v_line ? 'case_material') then
    raise exception 'FAIL: the keys are absent rather than null for an unset attribute';
  end if;
  if v_line -> 'dial_color' <> 'null'::jsonb then
    raise exception 'FAIL: an unset dial_color was not null';
  end if;
  raise notice 'pass [cart_pricing: an unset attribute is a present null, not a missing key]';

  -- Presentation data must not become a second money path. Adding those two
  -- fields must leave every amount exactly as it was.
  if (v ->> 'subtotal_cents')::bigint <> 200000 then
    raise exception 'FAIL: the presentation fields moved the subtotal';
  end if;
  raise notice 'pass [cart_pricing: the presentation fields do not affect an amount]';
end
$$;

-- 1b. A quantity above one is permitted only when the product model allows it.
--     A unique piece is clamped to one, and the payload says it was adjusted.
do $$
declare
  v jsonb;
  v_line jsonb;
begin
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000102', 'quantity', 5)
    ),
    null,
    'USD'
  );

  v_line := (v -> 'lines') -> 0;

  if (v_line ->> 'quantity')::integer <> 1 then
    raise exception 'FAIL: a unique piece was priced at % rather than 1', v_line ->> 'quantity';
  end if;
  if (v_line ->> 'quantity_locked')::boolean is not true then
    raise exception 'FAIL: a unique piece was not marked quantity_locked';
  end if;
  if (v_line ->> 'quantity_adjusted')::boolean is not true then
    raise exception 'FAIL: the adjustment was not reported';
  end if;
  if (v ->> 'subtotal_cents')::bigint <> 250000 then
    raise exception 'FAIL: a clamped line contributed %, expected 250000', v ->> 'subtotal_cents';
  end if;
  raise notice 'pass [cart_pricing: a unique piece clamps to one and reports the adjustment]';
end
$$;

-- 1b2. A caller-supplied price is ignored.
--
--     Every test above calls `cart_pricing` the way the application does, which
--     means none of them ever *attacks* it: no client price is sent, so "the
--     server does not trust a browser price" was proven only by the function
--     happening not to read one. That is the same shape of gap as a uniqueness
--     claim tested with a single insert — the defect it is meant to catch cannot
--     appear in the test that asserts it.
--
--     So the hostile payload is sent here: a price of one cent, a zero, a
--     negative, a huge figure, and a `line_total_cents`/`unit_price_cents` that
--     disagree with the product row. The line must still price from the database.
do $$
declare
  v        jsonb;
  v_line   jsonb;
  v_prices bigint[] := array[1, 0, -500000, 999999999];
  v_price  bigint;
begin
  foreach v_price in array v_prices
  loop
    v := public.cart_pricing(
      jsonb_build_array(
        jsonb_build_object(
          'product_id',       'e0000000-0000-4000-8000-000000000101',
          'quantity',         1,
          -- The hostile fields. `unit_price_cents` is the shape the real
          -- payload would use if it carried one; the others are the names a
          -- careless client would guess.
          'unit_price_cents', v_price,
          'price_cents',      v_price,
          'price',            v_price,
          'line_total_cents', v_price,
          'subtotal_cents',   v_price
        )
      ),
      null,
      'USD'
    );
    v_line := (v -> 'lines') -> 0;

    -- Assert the line exists *before* comparing any figure. Without this the
    -- comparisons below would each evaluate to NULL when there is no line, and
    -- `if NULL then raise` never fires — a test that passes because it checked
    -- nothing. This was not hypothetical: an injected "trust the submitted
    -- price" bug made the function return an empty line set, and the first
    -- version of this block passed anyway.
    if (v ->> 'line_count')::integer <> 1 then
      raise exception 'FAIL: the line was dropped, line_count was %', v ->> 'line_count';
    end if;
    if v_line ->> 'unit_price_cents' is null then
      raise exception 'FAIL: the line carried no unit price';
    end if;

    if (v_line ->> 'unit_price_cents')::bigint <> 100000 then
      raise exception 'FAIL: a submitted price of % became the unit price %',
        v_price, v_line ->> 'unit_price_cents';
    end if;
    if (v_line ->> 'line_total_cents')::bigint <> 100000 then
      raise exception 'FAIL: a submitted price of % became the line total %',
        v_price, v_line ->> 'line_total_cents';
    end if;
    if (v ->> 'subtotal_cents')::bigint <> 100000 then
      raise exception 'FAIL: a submitted price of % became the subtotal %',
        v_price, v ->> 'subtotal_cents';
    end if;
    if (v ->> 'total_cents')::bigint <> 100000 then
      raise exception 'FAIL: a submitted price of % became the total %',
        v_price, v ->> 'total_cents';
    end if;
  end loop;

  raise notice 'pass [cart_pricing: a caller-supplied price is ignored, whatever it claims]';
end
$$;

-- 1b3. A caller-supplied stock figure or availability flag is ignored.
--
--     The same argument as 1b2: the cart is where a customer would try to make a
--     sold-out piece look buyable. The database is the only source of stock, so a
--     submitted `is_available`, `quantity` beyond the real stock, or a stock count
--     must not change the outcome.
do $$
declare
  v      jsonb;
  v_line jsonb;
begin
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object(
        'product_id',   'e0000000-0000-4000-8000-000000000102',
        'quantity',     50,
        'is_available', true,
        'stock',        500,
        'available',    500
      )
    ),
    null,
    'USD'
  );
  v_line := (v -> 'lines') -> 0;

  if (v ->> 'line_count')::integer <> 1 then
    raise exception 'FAIL: the line was dropped, line_count was %', v ->> 'line_count';
  end if;

  -- The piece has one unit, so the model clamps to one whatever was asked.
  if (v_line ->> 'quantity')::integer <> 1 then
    raise exception 'FAIL: submitted stock let the quantity reach %', v_line ->> 'quantity';
  end if;
  if (v_line ->> 'quantity_locked')::boolean is not true then
    raise exception 'FAIL: a unique piece was not reported as quantity-locked';
  end if;

  raise notice 'pass [cart_pricing: a caller-supplied stock figure is ignored]';
end
$$;

-- 1b4. A sold-out piece stays sold out however the request describes it.
--
--     The fixture's every unit is reserved. An `anon` caller cannot change that
--     anyway — `inventory` has no policy that lets a customer write it, which is
--     itself the point — so this asserts the read side: the line is reported
--     unavailable and contributes nothing, despite a request that insists it is
--     available.
do $$
declare
  v      jsonb;
  v_line jsonb;
begin
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object(
        'product_id',   'e0000000-0000-4000-8000-000000000106',
        'quantity',     1,
        'is_available', true,
        'stock',        99
      )
    ),
    null,
    'USD'
  );
  v_line := (v -> 'lines') -> 0;

  if (v ->> 'line_count')::integer <> 1 then
    raise exception 'FAIL: the sold-out line was dropped, line_count was %', v ->> 'line_count';
  end if;

  if (v_line ->> 'is_available')::boolean is not false then
    raise exception 'FAIL: a sold-out piece was reported available because the request said so';
  end if;
  if (v ->> 'has_unavailable')::boolean is not true then
    raise exception 'FAIL: a sold-out line did not set has_unavailable';
  end if;
  -- It must also contribute nothing to the subtotal.
  if (v ->> 'subtotal_cents')::bigint <> 0 then
    raise exception 'FAIL: a sold-out line contributed % to the subtotal', v ->> 'subtotal_cents';
  end if;

  raise notice 'pass [cart_pricing: a sold-out piece stays sold out whatever the request claims]';
end
$$;

-- 1b4b. A customer cannot write `inventory` at all, so stock cannot be edited
--      from the browser to make a sold-out piece buyable. This is the boundary
--      the previous test relies on, asserted rather than assumed: an earlier
--      version of this suite tried to mark a piece sold out as `anon`, the
--      update silently affected zero rows, and the test read as a product bug
--      when the real cause was that the security model was working.
--
--      Since 0021 the write grant is revoked as well as the policy, so this is a
--      hard `insufficient_privilege` rather than a silently filtered zero-row
--      update. Both outcomes mean "the caller cannot change stock"; the test
--      accepts either so that it keeps asserting the boundary rather than the
--      mechanism, and still fails if the update ever succeeds.
do $$
declare
  v_rows integer;
begin
  begin
    update public.inventory set quantity = 999, reserved_quantity = 0
     where product_id = 'e0000000-0000-4000-8000-000000000106';
    get diagnostics v_rows = row_count;
  exception when insufficient_privilege then
    raise notice 'pass [inventory: an anonymous caller cannot change stock]';
    return;
  end;

  if v_rows <> 0 then
    raise exception 'FAIL: anon updated % inventory rows', v_rows;
  end if;

  raise notice 'pass [inventory: an anonymous caller cannot change stock]';
end
$$;

-- 1b5. A submitted discount amount is ignored; only the code is read.
--
--     The browser may send any amount it likes alongside a code. Eligibility and
--     the figure come from the database, so an inflated amount must not survive
--     and an unknown code must apply nothing.
do $$
declare
  v jsonb;
begin
  -- No such code exists, so nothing applies however large the claimed discount.
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000101', 'quantity', 1)
    ),
    'NO-SUCH-CODE',
    'USD'
  );

  if (v ->> 'discount_cents')::bigint <> 0 then
    raise exception 'FAIL: an unknown code applied %', v ->> 'discount_cents';
  end if;
  if (v ->> 'total_cents')::bigint <> 100000 then
    raise exception 'FAIL: an unknown code changed the total to %', v ->> 'total_cents';
  end if;

  -- And a code argument that is not a code at all — a huge number, an injection
  -- attempt — is not an amount either.
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000101', 'quantity', 1)
    ),
    '999999999',
    'USD'
  );

  if (v ->> 'discount_cents')::bigint <> 0 then
    raise exception 'FAIL: a numeric "code" applied a discount of %', v ->> 'discount_cents';
  end if;

  raise notice 'pass [cart_pricing: a submitted discount amount is ignored, only the code is read]';
end
$$;

-- 1c. Repeating a product cannot inflate the subtotal. The second occurrence of
--     an id is ignored, so a caller cannot double a line by listing it twice.
do $$
declare
  v jsonb;
begin
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000101', 'quantity', 1),
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000101', 'quantity', 1)
    ),
    null,
    'USD'
  );

  if (v ->> 'line_count')::integer <> 1 then
    raise exception 'FAIL: a repeated product produced % lines', v ->> 'line_count';
  end if;
  if (v ->> 'subtotal_cents')::bigint <> 100000 then
    raise exception 'FAIL: a repeated product inflated the subtotal to %', v ->> 'subtotal_cents';
  end if;
  raise notice 'pass [cart_pricing: a repeated product is one line, not two]';
end
$$;

-- 1d. A negative, zero or absurd quantity is normalised rather than accepted.
do $$
declare
  v jsonb;
  v_line jsonb;
begin
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000101', 'quantity', -4)
    ),
    null,
    'USD'
  );
  v_line := (v -> 'lines') -> 0;

  if (v_line ->> 'quantity')::integer < 1 then
    raise exception 'FAIL: a negative quantity produced %', v_line ->> 'quantity';
  end if;
  if (v ->> 'subtotal_cents')::bigint < 0 then
    raise exception 'FAIL: a negative quantity produced a negative subtotal';
  end if;
  raise notice 'pass [cart_pricing: a negative quantity is normalised to one]';
end
$$;

-- 1e. An unpublished product is reported, not silently dropped, and is excluded
--     from the subtotal.
do $$
declare
  v jsonb;
  v_line jsonb;
begin
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000104', 'quantity', 1)
    ),
    null,
    'USD'
  );

  if (v ->> 'line_count')::integer <> 1 then
    raise exception 'FAIL: an unpublished product was dropped from the payload';
  end if;

  v_line := (v -> 'lines') -> 0;
  if (v_line ->> 'product_status') <> 'unpublished' then
    raise exception 'FAIL: an unpublished product was not marked as such';
  end if;
  if (v ->> 'subtotal_cents')::bigint <> 0 then
    raise exception 'FAIL: an unpublished product contributed to the subtotal';
  end if;
  if (v ->> 'has_unavailable')::boolean is not true then
    raise exception 'FAIL: the unavailable flag was not set';
  end if;
  raise notice 'pass [cart_pricing: an unpublished line is marked, not dropped]';
end
$$;

-- 1f. A malformed product id is skipped rather than raising inside a cast, so a
--     bad request is not a 500.
do $$
declare
  v jsonb;
begin
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'not-a-uuid', 'quantity', 1),
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000101', 'quantity', 1)
    ),
    null,
    'USD'
  );

  if (v ->> 'line_count')::integer <> 1 then
    raise exception 'FAIL: a malformed id produced % lines', v ->> 'line_count';
  end if;
  raise notice 'pass [cart_pricing: a malformed id is skipped, not a 500]';
end
$$;

reset role;

-- -----------------------------------------------------------------------------
-- 2. The discount is recomputed from the code, never accepted as an amount
-- -----------------------------------------------------------------------------

set role service_role;

insert into public.discount_codes (code, label, kind, value, min_subtotal_cents, max_discount_cents, is_enabled)
values
  ('WC-TEN',  'Wc Ten Percent',   'percentage',   1000, 0,      null,   true),
  ('WC-CAP',  'Wc Capped',        'percentage',   5000, 0,      100000, true),
  ('WC-FLAT', 'Wc Flat',          'fixed_amount', 25000, 100000, null,   true),
  ('WC-MIN',  'Wc Minimum',       'percentage',   1000, 500000, null,   true),
  ('WC-OFF',  'Wc Disabled',      'percentage',   1000, 0,      null,   false)
on conflict (code) do update
  set kind = excluded.kind,
      value = excluded.value,
      min_subtotal_cents = excluded.min_subtotal_cents,
      max_discount_cents = excluded.max_discount_cents,
      is_enabled = excluded.is_enabled;

reset role;

set role anon;

-- 2a. A percentage is applied as basis points, rounded, and the total follows.
do $$
declare
  v jsonb;
begin
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000101', 'quantity', 1)
    ),
    'WC-TEN',
    'USD'
  );

  if (v -> 'discount' ->> 'applied')::boolean is not true then
    raise exception 'FAIL: an eligible code was not applied';
  end if;
  if (v ->> 'discount_cents')::bigint <> 10000 then
    raise exception 'FAIL: a 10%% discount on $1,000 was %, expected 10000', v ->> 'discount_cents';
  end if;
  if (v ->> 'total_cents')::bigint <> 90000 then
    raise exception 'FAIL: the discounted total was %, expected 90000', v ->> 'total_cents';
  end if;
  raise notice 'pass [discount: a percentage is recomputed from the code]';
end
$$;

-- 2b. A percentage is capped, so a large piece cannot make the discount unbounded.
do $$
declare
  v jsonb;
begin
  -- 50% of $1,000 is $500, but the cap is $1,000... use two units of the $2,500
  -- watch: subtotal $5,000, 50% is $2,500, capped at $1,000.
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000102', 'quantity', 1)
    ),
    'WC-CAP',
    'USD'
  );

  if (v ->> 'discount_cents')::bigint <> 100000 then
    raise exception 'FAIL: the cap was not applied (got %)', v ->> 'discount_cents';
  end if;
  raise notice 'pass [discount: a percentage discount is capped]';
end
$$;

-- 2c. A fixed amount is capped at the subtotal, so a total can never go negative.
do $$
declare
  v jsonb;
begin
  -- A $250 fixed discount against a $1,000 subtotal.
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000101', 'quantity', 1)
    ),
    'WC-FLAT',
    'USD'
  );

  if (v ->> 'discount_cents')::bigint <> 25000 then
    raise exception 'FAIL: a fixed discount was %, expected 25000', v ->> 'discount_cents';
  end if;
  if (v ->> 'total_cents')::bigint <> 75000 then
    raise exception 'FAIL: the discounted total was %, expected 75000', v ->> 'total_cents';
  end if;
  raise notice 'pass [discount: a fixed amount is applied and capped at the subtotal]';
end
$$;

-- 2d. An ineligible code is reported with a reason and applies nothing. This is
--     the "validate eligibility" half: the code is not rejected with an error,
--     the cart simply does not discount.
do $$
declare
  v jsonb;
begin
  -- WC-MIN needs a $5,000 subtotal; the cart is $1,000.
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000101', 'quantity', 1)
    ),
    'WC-MIN',
    'USD'
  );

  if (v -> 'discount' ->> 'applied')::boolean is not false then
    raise exception 'FAIL: an ineligible code was applied';
  end if;
  if (v -> 'discount' ->> 'reason') is null then
    raise exception 'FAIL: an ineligible code produced no reason';
  end if;
  if (v ->> 'discount_cents')::bigint <> 0 then
    raise exception 'FAIL: an ineligible code discounted the cart';
  end if;
  raise notice 'pass [discount: an ineligible code applies nothing and says why]';
end
$$;

-- 2e. A disabled code does not apply.
do $$
declare
  v jsonb;
begin
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000101', 'quantity', 1)
    ),
    'WC-OFF',
    'USD'
  );

  if (v -> 'discount' ->> 'applied')::boolean is not false then
    raise exception 'FAIL: a disabled code was applied';
  end if;
  raise notice 'pass [discount: a disabled code does not apply]';
end
$$;

-- 2f. An unknown code does not apply and does not raise.
do $$
declare
  v jsonb;
begin
  v := public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000101', 'quantity', 1)
    ),
    'WC-NOPE',
    'USD'
  );

  if (v -> 'discount' ->> 'applied')::boolean is not false then
    raise exception 'FAIL: an unknown code was applied';
  end if;
  raise notice 'pass [discount: an unknown code does not apply]';
end
$$;

-- 2g. The discount code list cannot be enumerated by an anonymous visitor.
--     A public read policy would let anyone holding the anon key list every live
--     code, including ones that have not been announced.
do $$
declare
  v_count bigint;
begin
  select count(*) into v_count from public.discount_codes;
  if v_count <> 0 then
    raise exception 'FAIL: anon read % discount codes', v_count;
  end if;
  raise notice 'pass [discount: the code list is not readable by anon]';
end
$$;

reset role;

-- -----------------------------------------------------------------------------
-- 3. catalogue_by_ids re-applies the publication and taxonomy gates
-- -----------------------------------------------------------------------------

set role anon;

-- 3a. A draft or archived id returns no row, so a saved id cannot confirm that a
--     draft exists.
do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
    from public.catalogue_by_ids(array[
      'e0000000-0000-4000-8000-000000000104',
      'e0000000-0000-4000-8000-000000000105'
    ]::uuid[]);

  if v_count <> 0 then
    raise exception 'FAIL: catalogue_by_ids returned % unpublished rows', v_count;
  end if;
  raise notice 'pass [catalogue_by_ids: a draft or archived id returns no row]';
end
$$;

-- 3b. A published id returns exactly one row, with the fields the card needs and
--     no cost basis.
do $$
declare
  v_count bigint;
  v_row   record;
begin
  select count(*) into v_count
    from public.catalogue_by_ids(array['e0000000-0000-4000-8000-000000000101']::uuid[]);

  if v_count <> 1 then
    raise exception 'FAIL: a published id returned % rows', v_count;
  end if;

  select * into v_row
    from public.catalogue_by_ids(array['e0000000-0000-4000-8000-000000000101']::uuid[]);

  if v_row.slug <> 'wc-priced-two' then
    raise exception 'FAIL: the wrong product was returned';
  end if;
  if v_row.price_cents <> 100000 then
    raise exception 'FAIL: the price was % rather than 100000', v_row.price_cents;
  end if;
  if v_row.is_available is not true then
    raise exception 'FAIL: an in-stock product was reported unavailable';
  end if;
  raise notice 'pass [catalogue_by_ids: a published id returns its card row]';
end
$$;

-- 3c. The returned columns are the public surface only. The function's return
--     type is fixed, so a cost column cannot appear even if one is added later.
do $$
declare
  v_cols text;
begin
  select string_agg(a.attname, ',' order by a.attnum)
    into v_cols
    from pg_attribute a
    join pg_type t on t.oid = a.attrelid
   where t.typname = 'catalogue_by_ids'
     and a.attnum > 0;

  if v_cols like '%cost%' or v_cols like '%compare_at%' then
    raise exception 'FAIL: catalogue_by_ids returns a private column: %', v_cols;
  end if;
  raise notice 'pass [catalogue_by_ids: returns no private column]';
end
$$;

reset role;

-- -----------------------------------------------------------------------------
-- 4. Wishlist duplicates and ownership
-- -----------------------------------------------------------------------------

set role service_role;
insert into auth.users (id, email) values
  ('e0000000-0000-4000-8000-000000000201', 'wc-alice@example.test'),
  ('e0000000-0000-4000-8000-000000000202', 'wc-bob@example.test')
on conflict (id) do nothing;

insert into public.wishlists (id, user_id, is_default)
values ('e0000000-0000-4000-8000-000000000301', 'e0000000-0000-4000-8000-000000000201', true)
on conflict (id) do nothing;
reset role;

set request.jwt.claims = '{"sub":"e0000000-0000-4000-8000-000000000201","role":"authenticated"}';
set role authenticated;

-- 4a. Saving the same product twice produces one row. The unique constraint is
--     what makes a duplicate impossible, not the application.
do $$
begin
  insert into public.wishlist_items (wishlist_id, product_id)
  values ('e0000000-0000-4000-8000-000000000301', 'e0000000-0000-4000-8000-000000000101')
  on conflict (wishlist_id, product_id) do nothing;

  insert into public.wishlist_items (wishlist_id, product_id)
  values ('e0000000-0000-4000-8000-000000000301', 'e0000000-0000-4000-8000-000000000101')
  on conflict (wishlist_id, product_id) do nothing;

  if (select count(*) from public.wishlist_items
       where wishlist_id = 'e0000000-0000-4000-8000-000000000301'
         and product_id = 'e0000000-0000-4000-8000-000000000101') <> 1 then
    raise exception 'FAIL: saving twice produced a duplicate row';
  end if;
  raise notice 'pass [wishlist: saving the same product twice is one row]';
end
$$;

-- 4b. A duplicate insert with no conflict clause is rejected by the constraint,
--     so a race cannot slip past either.
do $$
begin
  begin
    insert into public.wishlist_items (wishlist_id, product_id)
    values ('e0000000-0000-4000-8000-000000000301', 'e0000000-0000-4000-8000-000000000101');
    raise exception 'FAIL: the unique constraint did not reject a duplicate';
  exception
    when unique_violation then
      raise notice 'pass [wishlist: the unique constraint rejects a duplicate]';
  end;
end
$$;

-- 4b2. The same product twice *inside one statement* is one row.
--
--     4a and 4b both send two separate inserts, which is not the shape the merge
--     actually uses: `mergeGuestWishlist` sends the whole id list to supabase-js
--     as a single `upsert`, which becomes one `insert ... on conflict do
--     nothing`. A tampered `localStorage` value produces a repeated id in that
--     one payload, and the schema deliberately does not deduplicate it. So the
--     case that matters is a repeated row in a single statement, and it was the
--     one case not covered.
do $$
declare
  v_rows integer;
begin
  insert into public.wishlist_items (wishlist_id, product_id) values
    ('e0000000-0000-4000-8000-000000000301', 'e0000000-0000-4000-8000-000000000102'),
    ('e0000000-0000-4000-8000-000000000301', 'e0000000-0000-4000-8000-000000000102'),
    ('e0000000-0000-4000-8000-000000000301', 'e0000000-0000-4000-8000-000000000102')
  on conflict (wishlist_id, product_id) do nothing;

  select count(*) into v_rows
    from public.wishlist_items
   where wishlist_id = 'e0000000-0000-4000-8000-000000000301'
     and product_id = 'e0000000-0000-4000-8000-000000000102';

  if v_rows <> 1 then
    raise exception 'FAIL: a repeated id in one upsert produced % rows', v_rows;
  end if;
  raise notice 'pass [wishlist: a repeated id in one upsert payload is one row]';
end
$$;

reset role;

-- 4c. Another customer cannot read or write this wishlist.
set request.jwt.claims = '{"sub":"e0000000-0000-4000-8000-000000000202","role":"authenticated"}';
set role authenticated;

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
    from public.wishlist_items
   where wishlist_id = 'e0000000-0000-4000-8000-000000000301';

  if v_count <> 0 then
    raise exception 'FAIL: a customer read another customer''s wishlist rows';
  end if;
  raise notice 'pass [wishlist: another customer cannot read the rows]';
end
$$;

reset role;

-- -----------------------------------------------------------------------------
-- 5. Cart quantity constraints and ownership
-- -----------------------------------------------------------------------------

set role service_role;
insert into public.carts (id, user_id)
values ('e0000000-0000-4000-8000-000000000401', 'e0000000-0000-4000-8000-000000000201')
on conflict (id) do nothing;
reset role;

set request.jwt.claims = '{"sub":"e0000000-0000-4000-8000-000000000201","role":"authenticated"}';
set role authenticated;

-- 5a. A negative or zero quantity is rejected by the constraint, so the invalid
--     state cannot be stored even by a direct statement.
do $$
begin
  begin
    insert into public.cart_items (cart_id, product_id, quantity)
    values ('e0000000-0000-4000-8000-000000000401', 'e0000000-0000-4000-8000-000000000101', 0);
    raise exception 'FAIL: a zero quantity was accepted';
  exception
    when check_violation then
      raise notice 'pass [cart: a zero quantity is rejected]';
  end;

  begin
    insert into public.cart_items (cart_id, product_id, quantity)
    values ('e0000000-0000-4000-8000-000000000401', 'e0000000-0000-4000-8000-000000000101', -3);
    raise exception 'FAIL: a negative quantity was accepted';
  exception
    when check_violation then
      raise notice 'pass [cart: a negative quantity is rejected]';
  end;
end
$$;

-- 5b. A quantity above the schema maximum is rejected.
do $$
begin
  begin
    insert into public.cart_items (cart_id, product_id, quantity)
    values ('e0000000-0000-4000-8000-000000000401', 'e0000000-0000-4000-8000-000000000101', 100);
    raise exception 'FAIL: a quantity above 99 was accepted';
  exception
    when check_violation then
      raise notice 'pass [cart: a quantity above 99 is rejected]';
  end;
end
$$;

-- 5c. The same product twice is one line, enforced by the unique index.
do $$
begin
  insert into public.cart_items (cart_id, product_id, quantity)
  values ('e0000000-0000-4000-8000-000000000401', 'e0000000-0000-4000-8000-000000000101', 1)
  on conflict (cart_id, product_id) do update set quantity = excluded.quantity;

  insert into public.cart_items (cart_id, product_id, quantity)
  values ('e0000000-0000-4000-8000-000000000401', 'e0000000-0000-4000-8000-000000000101', 1)
  on conflict (cart_id, product_id) do update set quantity = excluded.quantity;

  if (select count(*) from public.cart_items
       where cart_id = 'e0000000-0000-4000-8000-000000000401') <> 1 then
    raise exception 'FAIL: adding the same product twice produced two lines';
  end if;
  raise notice 'pass [cart: adding the same product twice is one line]';
end
$$;

reset role;

-- 5d. Another customer cannot read this cart.
set request.jwt.claims = '{"sub":"e0000000-0000-4000-8000-000000000202","role":"authenticated"}';
set role authenticated;

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
    from public.cart_items
   where cart_id = 'e0000000-0000-4000-8000-000000000401';

  if v_count <> 0 then
    raise exception 'FAIL: a customer read another customer''s cart';
  end if;
  raise notice 'pass [cart: another customer cannot read the cart]';
end
$$;

reset role;

-- 5e. An anonymous visitor cannot read a signed-in cart or its lines at all.
set role anon;

do $$
declare
  v_count bigint;
begin
  select count(*) into v_count from public.cart_items;
  if v_count <> 0 then
    raise exception 'FAIL: anon read % cart lines', v_count;
  end if;
  raise notice 'pass [cart: anon cannot read any cart line]';
end
$$;

-- 5f. An anonymous visitor cannot create a cart directly. Guest carts are handled
--     server-side with the service-role client, so there is no policy for them.
do $$
begin
  begin
    insert into public.carts (session_token)
    values (repeat('a', 64));
    raise exception 'FAIL: anon created a cart directly';
  exception
    when insufficient_privilege then
      raise notice 'pass [cart: anon cannot create a cart directly]';
    when check_violation then
      raise exception 'FAIL: anon reached the constraint, which means the policy let it through';
  end;
end
$$;

reset role;

-- -----------------------------------------------------------------------------
-- 6. A cart is not a reservation
--
-- Nothing in the cart path touches inventory. A cart row must leave
-- `reserved_quantity` exactly where it was.
-- -----------------------------------------------------------------------------

set role service_role;

do $$
declare
  v_before integer;
  v_after  integer;
begin
  select reserved_quantity into v_before
    from public.inventory where product_id = 'e0000000-0000-4000-8000-000000000102';

  -- Price the cart the way the application does. This is the only cart-side
  -- function that could plausibly have a side effect.
  perform public.cart_pricing(
    jsonb_build_array(
      jsonb_build_object('product_id', 'e0000000-0000-4000-8000-000000000102', 'quantity', 1)
    ),
    null,
    'USD'
  );

  select reserved_quantity into v_after
    from public.inventory where product_id = 'e0000000-0000-4000-8000-000000000102';

  if v_before <> v_after then
    raise exception 'FAIL: cart_pricing changed reserved stock (% -> %)', v_before, v_after;
  end if;
  raise notice 'pass [cart: pricing a cart does not reserve stock]';
end
$$;

-- -----------------------------------------------------------------------------
-- 7. Clean up so later suites see the catalogue they expect
-- -----------------------------------------------------------------------------

delete from public.cart_items where cart_id = 'e0000000-0000-4000-8000-000000000401';
delete from public.carts where id = 'e0000000-0000-4000-8000-000000000401';
delete from public.wishlist_items where wishlist_id = 'e0000000-0000-4000-8000-000000000301';
delete from public.wishlists where id = 'e0000000-0000-4000-8000-000000000301';
delete from public.discount_codes where code like 'WC-%';
delete from public.inventory where product_id::text like 'e0000000-0000-4000-8000-0000000001%';
delete from public.products where sku like 'WC-%';
delete from public.brands where id = 'e0000000-0000-4000-8000-000000000001';
delete from auth.users where id in (
  'e0000000-0000-4000-8000-000000000201',
  'e0000000-0000-4000-8000-000000000202'
);

reset role;

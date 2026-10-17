-- =============================================================================
-- 0008 — Transactional order submission and inventory reservation
--
-- These functions are the only way an order request is created and the only way
-- stock is reserved. They are SECURITY DEFINER, so they run with the privileges
-- needed to bypass RLS, and they re-derive everything from the database:
--
--   * prices come from `products`, never from the caller
--   * the delivery fee comes from `delivery_options`, never from the caller
--   * the payment method must exist and be ENABLED
--   * stock is reserved with a row lock, so two concurrent requests for the last
--     watch cannot both succeed
--
-- Nothing here processes a payment. The function records which offline method
-- the customer chose and leaves settlement to an administrator.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- reserve_inventory — the concurrency-critical function
--
-- Correctness argument:
--
--   1. `select ... for update` takes a row-level lock on the inventory row. A
--      second concurrent caller blocks here until the first transaction ends.
--   2. The availability check reads the locked row, so it sees the first
--      transaction's committed effect once it unblocks.
--   3. The unique index `inventory_reservations_active_key` prevents the same
--      product being reserved twice for the same order request.
--   4. The ledger insert is applied to the balance by trigger inside the same
--      transaction, and the `inventory_reserved_within_quantity` check constraint
--      rejects any state where reserved exceeds on-hand.
--
-- A browser-side "is it in stock?" check is therefore never load-bearing.
-- -----------------------------------------------------------------------------

create or replace function public.reserve_inventory(
  p_order_request_id uuid,
  p_product_id       uuid,
  p_quantity         integer
)
returns public.inventory_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inventory   public.inventory;
  v_available   integer;
  v_reservation public.inventory_reservations;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Reservation quantity must be positive (got %)', p_quantity
      using errcode = 'check_violation';
  end if;

  -- Lock the row for the duration of the transaction. This is the serialisation
  -- point that makes concurrent reservation safe.
  select * into v_inventory
    from public.inventory
   where product_id = p_product_id
     for update;

  if not found then
    raise exception 'No inventory record exists for product %', p_product_id
      using errcode = 'no_data_found';
  end if;

  v_available := v_inventory.quantity - v_inventory.reserved_quantity;

  if v_available < p_quantity then
    raise exception 'Insufficient available stock for product % (requested %, available %)',
      p_product_id, p_quantity, v_available
      using errcode = 'check_violation';
  end if;

  insert into public.inventory_reservations (product_id, order_request_id, quantity)
  values (p_product_id, p_order_request_id, p_quantity)
  returning * into v_reservation;

  -- The ledger is the source of truth; the trigger applies this to the balance.
  insert into public.inventory_transactions (
    product_id, kind, quantity_delta, reserved_delta, order_request_id, actor_id, note
  )
  values (
    p_product_id, 'reservation', 0, p_quantity, p_order_request_id,
    (select auth.uid()), 'Reserved for order request'
  );

  return v_reservation;
end;
$$;

comment on function public.reserve_inventory(uuid, uuid, integer) is
  'Atomically reserves stock under a row lock. Raises if unavailable.';

-- -----------------------------------------------------------------------------
-- release_reservation — return held stock without selling it
--
-- Called when an administrator rejects or cancels a request, so the watch goes
-- back on sale automatically rather than being stranded by a forgotten step.
-- -----------------------------------------------------------------------------

create or replace function public.release_reservation(
  p_order_request_id uuid,
  p_product_id       uuid,
  p_reason           text default 'Released'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.inventory_reservations;
begin
  select * into v_reservation
    from public.inventory_reservations
   where order_request_id = p_order_request_id
     and product_id = p_product_id
     and is_active
     for update;

  if not found then
    -- Releasing something already released is not an error: it is the desired
    -- end state. Returning false lets the caller tell the difference.
    return false;
  end if;

  update public.inventory_reservations
     set is_active = false,
         released_at = now(),
         release_reason = p_reason
   where id = v_reservation.id;

  insert into public.inventory_transactions (
    product_id, kind, quantity_delta, reserved_delta, order_request_id, actor_id, note
  )
  values (
    p_product_id, 'reservation_release', 0, -v_reservation.quantity, p_order_request_id,
    (select auth.uid()), p_reason
  );

  return true;
end;
$$;

comment on function public.release_reservation(uuid, uuid, text) is
  'Returns reserved stock to availability. Idempotent.';

-- -----------------------------------------------------------------------------
-- confirm_reservation — convert a hold into a sale
--
-- Decrements on-hand quantity AND clears the reservation in one movement, so
-- the two can never drift apart.
-- -----------------------------------------------------------------------------

create or replace function public.confirm_reservation(
  p_order_request_id uuid,
  p_product_id       uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservation public.inventory_reservations;
begin
  select * into v_reservation
    from public.inventory_reservations
   where order_request_id = p_order_request_id
     and product_id = p_product_id
     and is_active
     for update;

  if not found then
    return false;
  end if;

  update public.inventory_reservations
     set is_active = false,
         released_at = now(),
         release_reason = 'Converted to sale'
   where id = v_reservation.id;

  -- Stock leaves and the hold clears together.
  insert into public.inventory_transactions (
    product_id, kind, quantity_delta, reserved_delta, order_request_id, actor_id, note
  )
  values (
    p_product_id, 'sale', -v_reservation.quantity, -v_reservation.quantity, p_order_request_id,
    (select auth.uid()), 'Order request confirmed'
  );

  return true;
end;
$$;

comment on function public.confirm_reservation(uuid, uuid) is
  'Converts a reservation into a completed sale, decrementing on-hand stock.';

-- -----------------------------------------------------------------------------
-- Status-transition side effects
--
-- A trigger rather than application code, because a status change made directly
-- in SQL must not be able to leave stock stranded.
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

  -- Rejecting or cancelling returns every hold to available stock.
  if new.status in ('rejected', 'cancelled') then
    for v_item in
      select product_id from public.inventory_reservations
       where order_request_id = new.id and is_active
    loop
      perform public.release_reservation(new.id, v_item.product_id, 'Order request ' || new.status::text);
    end loop;
  end if;

  return new;
end;
$$;

comment on function public.handle_order_status_change() is
  'Logs order status transitions and applies reservation side effects.';

create trigger order_requests_status_change
  after update of status on public.order_requests
  for each row execute function public.handle_order_status_change();

-- -----------------------------------------------------------------------------
-- submit_order_request — the single entry point for creating an order request
--
-- The caller supplies only product ids and quantities. Every monetary value,
-- the delivery fee and the payment-method validity are derived here, so a
-- tampered request cannot alter what is recorded.
-- -----------------------------------------------------------------------------

create or replace function public.submit_order_request(
  p_items                jsonb,
  p_customer_name        text,
  p_customer_email       text,
  p_customer_phone       text,
  p_fulfilment_type      public.fulfilment_type,
  p_payment_method_code  text,
  p_delivery_address     jsonb default null,
  p_customer_note        text default null,
  p_delivery_option_code text default null
)
returns public.order_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order          public.order_requests;
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
begin
  v_caller := (select auth.uid());

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'An order request must contain at least one item' using errcode = 'check_violation';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'An order request may contain at most 50 items' using errcode = 'check_violation';
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
  if p_fulfilment_type = 'delivery' and p_delivery_option_code is not null then
    select fee_cents into v_delivery_fee
      from public.delivery_options
     where code = p_delivery_option_code and is_enabled;

    if v_delivery_fee is null then
      raise exception 'Unknown or disabled delivery option %', p_delivery_option_code
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.order_requests (
    user_id, customer_name, customer_email, customer_phone,
    fulfilment_type, delivery_address, payment_method_code, customer_note,
    subtotal_cents, delivery_fee_cents, total_cents, currency
  )
  values (
    v_caller, p_customer_name, p_customer_email, p_customer_phone,
    p_fulfilment_type, p_delivery_address, p_payment_method_code, p_customer_note,
    0, v_delivery_fee, v_delivery_fee, 'USD'
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
    -- not be sold twice while the request is being reviewed.
    perform public.reserve_inventory(v_order.id, v_product.id, v_quantity);
  end loop;

  update public.order_requests
     set subtotal_cents = v_subtotal,
         total_cents    = v_subtotal + v_delivery_fee
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
  'Creates an order request with server-derived pricing and atomic stock reservation. Never processes payment.';

-- -----------------------------------------------------------------------------
-- Execution rights
--
-- The order-submission function is callable by an anonymous visitor (guest
-- checkout) and by an authenticated customer. The inventory functions are NOT
-- exposed to clients: stock is reserved only from inside submit_order_request
-- and from staff server-side code.
-- -----------------------------------------------------------------------------

revoke all on function public.reserve_inventory(uuid, uuid, integer) from public;
revoke all on function public.release_reservation(uuid, uuid, text) from public;
revoke all on function public.confirm_reservation(uuid, uuid) from public;

grant execute on function public.reserve_inventory(uuid, uuid, integer) to service_role;
grant execute on function public.release_reservation(uuid, uuid, text) to service_role;
grant execute on function public.confirm_reservation(uuid, uuid) to service_role;

revoke all on function public.submit_order_request from public;
grant execute on function public.submit_order_request to anon, authenticated, service_role;

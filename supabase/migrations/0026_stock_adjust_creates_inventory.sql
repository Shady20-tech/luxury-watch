-- -----------------------------------------------------------------------------
-- A stock adjustment on a product that has never been stocked
--
-- `admin_adjust_stock` (0020) read the existing balance and raised
-- `no_data_found` when there was none. Nothing in the application creates an
-- `inventory` row: `createProductAction` inserts `products` and, when asked to
-- publish, calls `admin_set_product_status`, and neither touches `inventory`.
-- `products` and `inventory` are 1:1 by intent, but the row is only created
-- lazily, and only by `apply_inventory_transaction` (0003) when a *ledger* row
-- is inserted for a product that has none.
--
-- So the two halves deadlocked for every product the admin created:
--
--   * the catalogue reads availability through `is_product_available`, which is
--     `exists (inventory row with quantity - reserved_quantity > 0)`. With no
--     row it reports `false`, and the card renders "Reserved" — the badge for a
--     piece that is genuinely spoken for. A brand-new piece is not reserved, it
--     has simply never been counted;
--   * `cart_pricing` coalesces the same missing row to 0, so the piece cannot be
--     added to a cart either;
--   * the one action that would fix it, `admin_adjust_stock`, refused because
--     there was no row to adjust.
--
-- A `SUPER_ADMIN` with `inventory.write` was therefore unable to set the first
-- unit of stock on a piece they had just created.
--
-- The fix is to let the first positive adjustment create the row, which is what
-- the ledger already does on its own path. The balance is still never written
-- here: the insert below is a single `inventory_transactions` row and
-- `apply_inventory_transaction` remains the only writer, so the ledger and the
-- balance stay in step by construction.
--
-- A first adjustment that would leave a negative balance is refused explicitly.
-- `apply_inventory_transaction` raises a less useful message in that case; more
-- importantly, negative stock on a product that has never been counted is not a
-- correction, it is a mis-specified delta, and it should say so.
-- -----------------------------------------------------------------------------

create or replace function public.admin_adjust_stock(
  p_product_id uuid,
  p_delta      integer,
  p_reason     text
)
returns public.inventory
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.inventory;
  v_after  public.inventory;
begin
  if not public.has_permission('inventory.write') then
    raise exception 'You do not have permission to adjust stock'
      using errcode = 'insufficient_privilege';
  end if;

  if p_delta = 0 then
    raise exception 'A stock adjustment of zero changes nothing'
      using errcode = 'check_violation';
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'A stock adjustment needs a reason of at least 3 characters'
      using errcode = 'check_violation';
  end if;

  -- The product must exist, and it must be one this archive holds. A missing
  -- product is a `no_data_found` rather than a silent no-op so a stale id in an
  -- admin form cannot look like a successful adjustment.
  if not exists (select 1 from public.products p where p.id = p_product_id) then
    raise exception 'No product %', p_product_id
      using errcode = 'no_data_found';
  end if;

  select * into v_before from public.inventory where product_id = p_product_id;
  if not found then
    -- No row yet: this is the first count for this piece.
    if p_delta < 0 then
      raise exception 'Stock cannot go below zero: % on hand, adjustment %',
        0, p_delta
        using errcode = 'check_violation';
    end if;
    -- Seed the row at zero so the ledger entry below is the only thing that
    -- moves it, exactly as it would for a product that already had a row.
    insert into public.inventory (product_id, quantity, reserved_quantity)
    values (p_product_id, 0, 0);
    select * into v_before from public.inventory where product_id = p_product_id;
  end if;

  -- The check constraints on `inventory` remain the last line of defence, but a
  -- negative result is refused here first so the caller gets a message that
  -- names the number rather than a constraint name.
  if v_before.quantity + p_delta < 0 then
    raise exception 'Stock cannot go below zero: % on hand, adjustment %',
      v_before.quantity, p_delta
      using errcode = 'check_violation';
  end if;

  if v_before.reserved_quantity > v_before.quantity + p_delta then
    raise exception 'Stock cannot drop below the % unit(s) already reserved',
      v_before.reserved_quantity
      using errcode = 'check_violation';
  end if;

  insert into public.inventory_transactions (product_id, kind, quantity_delta, actor_id, note)
  values (p_product_id, 'adjustment', p_delta, (select auth.uid()), trim(p_reason));

  select * into v_after from public.inventory where product_id = p_product_id;

  perform public.admin_write_audit_log(
    'inventory.adjust',
    'product',
    p_product_id,
    jsonb_build_object(
      'reason',          trim(p_reason),
      'delta',           p_delta,
      'quantity_before', v_before.quantity,
      'quantity_after',  v_after.quantity
    )
  );

  return v_after;
end;
$$;

comment on function public.admin_adjust_stock(uuid, integer, text) is
  'Adjusts stock through the ledger. The first positive adjustment on a product '
  'with no inventory row creates it, because nothing else does: a product '
  'created through the admin has no inventory row until its first count.';

revoke all on function public.admin_adjust_stock(uuid, integer, text) from public;
grant execute on function public.admin_adjust_stock(uuid, integer, text)
  to authenticated, service_role;

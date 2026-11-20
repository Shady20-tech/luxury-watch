-- =============================================================================
-- 0020 — the operations an administrator performs, as database functions
--
-- -----------------------------------------------------------------------------
-- WHY THESE ARE FUNCTIONS AND NOT APPLICATION-SIDE SEQUENCES
-- -----------------------------------------------------------------------------
--
-- Three of the admin actions have to be atomic to be correct, and each one is
-- atomic for a different reason:
--
--   1. **A stock adjustment** must write the ledger row and the audit row
--      together. The ledger already recomputes `inventory` from itself
--      (`apply_inventory_transaction`, 0003), so the balance is never written
--      directly — but if the audit row were written by a second statement from
--      the application, a failure between them would leave a stock change with
--      no record of who made it or why.
--
--   2. **An order status change** must not be able to reach `paid_offline`
--      without a settled-by identity, and must not be able to be reversed out of
--      a terminal state. Those are rules about the *transition*, not about the
--      row, so a `with check` on the table cannot express them: `with check` sees
--      the new row and has no memory of the old one.
--
--   3. **A service status change** must append its history row in the same
--      transaction as the status column it describes, or the portal shows a
--      state with no explanation of how it got there.
--
-- The application still performs its own permission check before calling any of
-- these. The function is the second gate, not the only one: it re-derives the
-- caller from `auth.uid()` and re-checks the permission itself, so a caller that
-- bypassed the TypeScript guard gains nothing.
--
-- -----------------------------------------------------------------------------
-- WHY THE AUDIT FUNCTION TAKES THE ACTOR FROM `auth.uid()`
-- -----------------------------------------------------------------------------
--
-- `admin_audit_logs` has no insert policy for any API role, deliberately (0006).
-- The only writer was meant to be a `SECURITY DEFINER` function, and until this
-- migration none existed — so no admin action could be audited at all. The
-- function below is that writer. It takes no actor argument: the actor is
-- whoever the session belongs to, exactly as the role helpers do it. A parameter
-- would be a value a caller could set to somebody else's id, which is the one
-- thing an audit trail must not permit.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The audit writer
-- -----------------------------------------------------------------------------

create or replace function public.admin_write_audit_log(
  p_action      text,
  p_entity_type text,
  p_entity_id   uuid,
  p_changes     jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_email  extensions.citext;
  v_id     uuid;
begin
  -- Fail closed. An audit row with a null actor is indistinguishable from a
  -- system action, so a privileged change made by nobody in particular would
  -- read as though no person made it. Refusing is the honest outcome.
  if v_actor is null then
    raise exception 'An administrative change must be attributable to a signed-in user'
      using errcode = 'insufficient_privilege';
  end if;

  -- The permission is checked here as well as in the application. `audit.read`
  -- is not the right gate for a write; the gate is "this caller is staff at
  -- all", because every staff role's actions are worth recording. A role that
  -- may not perform the action never reaches this function, because the action
  -- it belongs to checks its own permission first.
  if not public.is_staff() then
    raise exception 'Only staff may write an audit record'
      using errcode = 'insufficient_privilege';
  end if;

  select p.email into v_email from public.profiles p where p.id = v_actor;

  insert into public.admin_audit_logs (actor_id, actor_email, action, entity_type, entity_id, changes)
  values (v_actor, v_email, p_action, p_entity_type, p_entity_id, p_changes)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.admin_write_audit_log(text, text, uuid, jsonb) is
  'The only writer of admin_audit_logs. Derives the actor from auth.uid() so a '
  'caller cannot attribute an action to somebody else.';

revoke all on function public.admin_write_audit_log(text, text, uuid, jsonb) from public;
grant execute on function public.admin_write_audit_log(text, text, uuid, jsonb)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Stock adjustment
--
-- The balance is never written here. A ledger row is inserted and
-- `apply_inventory_transaction` (0003) moves the balance, which is what keeps
-- the two in step. The only thing this function adds is the pairing: the audit
-- row is written in the same transaction, so there is no window in which a stock
-- change exists without a record of who made it and why.
--
-- A reason is required. "Adjustment" on its own is not an explanation, and a
-- ledger that cannot explain a discrepancy is not an audit trail.
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

  select * into v_before from public.inventory where product_id = p_product_id;
  if not found then
    raise exception 'No inventory row for product %', p_product_id
      using errcode = 'no_data_found';
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
  'Adjusts stock through the ledger and writes the audit record in the same '
  'transaction. The balance is never written directly.';

revoke all on function public.admin_adjust_stock(uuid, integer, text) from public;
grant execute on function public.admin_adjust_stock(uuid, integer, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Order status transitions
--
-- The table already has `order_requests_staff_update`, which is a row-level
-- permission check. It cannot express a rule about *how* a row may change,
-- because `with check` sees only the new row. These are the rules that need the
-- old row as well:
--
--   - `paid_offline` requires a settled-by identity and a settled timestamp, and
--     only a role holding `orders.settle` may set it. This is the manual
--     verification step: staff confirmed payment outside the website.
--   - A terminal state (`fulfilled`, `cancelled`, `rejected`) may not silently
--     return to an earlier one. A cancellation that released the reservation
--     cannot be un-done by setting the status back, because the stock has
--     already been returned and may since have been sold.
--   - The transition itself is recorded. `handle_order_status_change` (0013)
--     writes the event row and moves the inventory; this function is what
--     guarantees the caller was allowed to cause that.
--
-- There is still no path to a payment status that implies an online charge:
-- `paid_offline` names the offline settlement explicitly, and nothing here
-- touches a gateway, because none exists.
-- -----------------------------------------------------------------------------

create or replace function public.admin_transition_order(
  p_order_id uuid,
  p_to_status public.order_status,
  p_note      text default null
)
returns public.order_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.order_requests;
  v_after  public.order_requests;
begin
  if not public.has_permission('orders.write') then
    raise exception 'You do not have permission to change an order'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_before from public.order_requests where id = p_order_id for update;
  if not found then
    raise exception 'No order request with id %', p_order_id
      using errcode = 'no_data_found';
  end if;

  if v_before.status = p_to_status then
    raise exception 'The order is already %', p_to_status
      using errcode = 'check_violation';
  end if;

  if v_before.status in ('fulfilled', 'cancelled', 'rejected') then
    raise exception 'An order that is % cannot change status', v_before.status
      using errcode = 'check_violation';
  end if;

  -- Manual payment verification. `orders.settle` is held by ADMIN and
  -- SALES_MANAGER only, so a support role that may otherwise move an order
  -- cannot assert that money arrived.
  if p_to_status = 'paid_offline' then
    if not public.has_permission('orders.settle') then
      raise exception 'You do not have permission to record an offline payment'
        using errcode = 'insufficient_privilege';
    end if;

    update public.order_requests
       set status             = p_to_status,
           settled_offline_at = now(),
           settled_offline_by = (select auth.uid()),
           admin_note         = coalesce(p_note, admin_note)
     where id = p_order_id
     returning * into v_after;
  else
    update public.order_requests
       set status     = p_to_status,
           admin_note = coalesce(p_note, admin_note)
     where id = p_order_id
     returning * into v_after;
  end if;

  perform public.admin_write_audit_log(
    'order.status_changed',
    'order_request',
    p_order_id,
    jsonb_build_object(
      'from', v_before.status,
      'to',   p_to_status,
      'note', p_note
    )
  );

  return v_after;
end;
$$;

comment on function public.admin_transition_order(uuid, public.order_status, text) is
  'Moves an order through its manual lifecycle. `paid_offline` requires the '
  'orders.settle permission and stamps the settling administrator.';

revoke all on function public.admin_transition_order(uuid, public.order_status, text) from public;
grant execute on function public.admin_transition_order(uuid, public.order_status, text)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Service status transitions
--
-- The status column and its history row must move together. Writing the history
-- from the application would leave a window in which the portal shows a new
-- state with no explanation, and a failed history write would be invisible: the
-- status change would have committed.
--
-- `service_status_events` already validates that `to_status` belongs to the
-- vocabulary of the entity (0015), so a typo is refused by the table rather than
-- rendered as an unrenderable state.
-- -----------------------------------------------------------------------------

create or replace function public.admin_set_service_status(
  p_entity_type       public.service_entity_type,
  p_entity_id         uuid,
  p_to_status         text,
  p_note              text default null,
  p_customer_visible  boolean default true
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from     text;
  v_actor    uuid := (select auth.uid());
  v_updated  integer;
begin
  if not public.has_permission('inquiries.write') then
    raise exception 'You do not have permission to update a service request'
      using errcode = 'insufficient_privilege';
  end if;

  -- Only the three flows that carry a `workflow_status` column can be moved by
  -- this function. The others are moved by their own tables' semantics, which
  -- this function does not attempt to guess.
  case p_entity_type
    when 'sell_trade' then
      select workflow_status::text into v_from
        from public.sell_trade_requests where id = p_entity_id;
    when 'sourcing' then
      select workflow_status::text into v_from
        from public.sourcing_requests where id = p_entity_id;
    when 'repair' then
      select workflow_status::text into v_from
        from public.repair_requests where id = p_entity_id;
    when 'appointment' then
      select workflow_status into v_from
        from public.appointments where id = p_entity_id;
    else
      raise exception 'Entity type % has no workflow status', p_entity_type
        using errcode = 'check_violation';
  end case;

  if v_from is null then
    raise exception 'No % request with id %', p_entity_type, p_entity_id
      using errcode = 'no_data_found';
  end if;

  if v_from = p_to_status then
    raise exception 'The request is already %', p_to_status
      using errcode = 'check_violation';
  end if;

  case p_entity_type
    when 'sell_trade' then
      update public.sell_trade_requests
         set workflow_status = p_to_status::public.sell_trade_status
       where id = p_entity_id;
      get diagnostics v_updated = row_count;
    when 'sourcing' then
      update public.sourcing_requests
         set workflow_status = p_to_status::public.sourcing_status
       where id = p_entity_id;
      get diagnostics v_updated = row_count;
    when 'repair' then
      update public.repair_requests
         set workflow_status = p_to_status::public.repair_status
       where id = p_entity_id;
      get diagnostics v_updated = row_count;
    when 'appointment' then
      update public.appointments
         set workflow_status = p_to_status
       where id = p_entity_id;
      get diagnostics v_updated = row_count;
  end case;

  -- The history row goes in the same transaction as the column it describes.
  -- `is_customer_visible = false` records an internal note without showing it in
  -- the portal, which is the difference between "we are still deciding" and
  -- "here is what we decided".
  insert into public.service_status_events (
    entity_type, entity_id, from_status, to_status, note, actor_id, is_customer_visible
  )
  values (
    p_entity_type, p_entity_id, v_from, p_to_status, p_note, v_actor, p_customer_visible
  );

  perform public.admin_write_audit_log(
    'service.status_changed',
    p_entity_type::text,
    p_entity_id,
    jsonb_build_object('from', v_from, 'to', p_to_status)
  );

  return p_to_status;
end;
$$;

comment on function public.admin_set_service_status(public.service_entity_type, uuid, text, text, boolean) is
  'Moves a service request through its workflow and appends the history row in '
  'the same transaction.';

revoke all on function public.admin_set_service_status(public.service_entity_type, uuid, text, text, boolean) from public;
grant execute on function public.admin_set_service_status(public.service_entity_type, uuid, text, text, boolean)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. Product publication
--
-- Publishing is the one catalogue change with a public consequence beyond the
-- row: the product appears in the sitemap and becomes orderable. It is recorded
-- separately from an ordinary edit so the trail can answer "when did this go
-- live, and who did it" without reconstructing it from a diff.
--
-- The status column itself is written here rather than by the caller so the
-- `published_at` stamp cannot be forgotten or set to an arbitrary time.
-- -----------------------------------------------------------------------------

create or replace function public.admin_set_product_status(
  p_product_id uuid,
  p_status     public.product_status
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.products;
  v_after  public.products;
begin
  if not public.has_permission('catalog.write') then
    raise exception 'You do not have permission to publish a product'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_before from public.products where id = p_product_id for update;
  if not found then
    raise exception 'No product with id %', p_product_id
      using errcode = 'no_data_found';
  end if;

  update public.products
     set status = p_status,
         -- Set on the transition into published and left alone otherwise, so a
         -- re-publish does not claim the piece is new again.
         published_at = case
           when p_status = 'published' and published_at is null then now()
           else published_at
         end
   where id = p_product_id
   returning * into v_after;

  perform public.admin_write_audit_log(
    'product.status_changed',
    'product',
    p_product_id,
    jsonb_build_object('from', v_before.status, 'to', p_status)
  );

  return v_after;
end;
$$;

comment on function public.admin_set_product_status(uuid, public.product_status) is
  'Publishes, unpublishes or archives a product, stamping published_at once and '
  'recording the change.';

revoke all on function public.admin_set_product_status(uuid, public.product_status) from public;
grant execute on function public.admin_set_product_status(uuid, public.product_status)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. The caller's roles and permissions, resolved once
--
-- The admin navigation has to render only the sections a person may actually
-- use, and every action has to re-check before it writes. Asking
-- `has_permission()` fifteen times to build one sidebar is fifteen round trips
-- for one answer that cannot change mid-request, so this returns the whole set
-- in a single call.
--
-- The wildcard is expanded here rather than in the application. `SUPER_ADMIN`
-- holds `'*'`, and a client that only understood named permissions would resolve
-- a super administrator to *no* permissions — the most privileged role getting
-- the least access, which is the kind of inversion that fails silently because
-- every screen simply renders as though the person were a junior.
--
-- It is `SECURITY DEFINER` and takes no arguments: the caller is `auth.uid()`,
-- exactly as `has_permission()` does it, so there is nothing to forge. A
-- signed-out or non-staff caller gets no rows.
-- -----------------------------------------------------------------------------

create or replace function public.current_admin_permissions()
returns table (role public.staff_role, permission text)
language sql
stable
security definer
set search_path = ''
as $$
  with held as (
    select ur.role
      from public.user_roles ur
     where ur.user_id = (select auth.uid())
       and (ur.expires_at is null or ur.expires_at > now())
  ),
  granted as (
    select h.role, unnest(public.role_permissions(h.role)) as permission
      from held h
  )
  select distinct g.role, g.permission
    from granted g
   where g.permission <> '*'
  union
  -- A role holding '*' is granted every permission the system defines. The list
  -- is written out so a caller receives concrete names; `'*'` itself would be
  -- meaningless to a client that checks `permissions.has('orders.write')`.
  select distinct g.role, p.permission
    from granted g
    cross join (values
      ('catalog.read'), ('catalog.write'),
      ('inventory.read'), ('inventory.write'),
      ('orders.read'), ('orders.write'), ('orders.settle'),
      ('inquiries.read'), ('inquiries.write'),
      ('customers.read'),
      ('content.read'), ('content.write'),
      ('settings.read'), ('settings.write'),
      ('audit.read')
    ) as p(permission)
   where g.permission = '*';
$$;

comment on function public.current_admin_permissions() is
  'The caller''s staff roles and the concrete permissions they grant, with the '
  'SUPER_ADMIN wildcard expanded. Derives the user from auth.uid(); fails closed.';

revoke all on function public.current_admin_permissions() from public;
grant execute on function public.current_admin_permissions() to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 7. An audit read surface for the dashboard
--
-- `admin_audit_logs` has a select policy gated on `audit.read`, and the table
-- grant is intact, so staff can already read it through PostgREST. This view
-- exists to join the actor's email in one place rather than repeating the join
-- in every admin query, and to give the dashboard a single ordered source.
-- -----------------------------------------------------------------------------

create or replace view public.admin_activity_feed
with (security_invoker = true)
as
select
  l.id,
  l.actor_id,
  l.actor_email,
  l.action,
  l.entity_type,
  l.entity_id,
  l.changes,
  l.created_at
from public.admin_audit_logs l
order by l.created_at desc
limit 100;

comment on view public.admin_activity_feed is
  'The 100 most recent administrative changes. `security_invoker` so the '
  'underlying policy on admin_audit_logs still decides who may read it.';

grant select on public.admin_activity_feed to authenticated;

-- =============================================================================
-- 60 — Admin operations: permission, atomicity and the audit trail
--
-- The admin application checks permission before it calls anything. That check
-- is not what this suite proves, because a suite that calls the function
-- directly has already bypassed it. What this proves is the *second* gate: each
-- function re-derives the caller from `auth.uid()`, re-checks the permission,
-- and refuses a change that the table's row policy cannot express.
--
-- The rules that need the old row as well as the new one are the interesting
-- ones — `with check` sees only the new row, so a table policy cannot say
-- "an order that is cancelled may not become confirmed again". Those live here.
--
-- Every negative assertion is written so that it would pass trivially if the
-- guard were removed. That is why each one asserts the *reason* as well as the
-- refusal: a call that fails for an unrelated reason (a missing product, a bad
-- enum cast) would otherwise look like a passing permission test.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert_raises(
  p_label    text,
  p_sql      text,
  p_sqlstate text,
  p_like     text default null
) returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when others then
      if sqlstate <> p_sqlstate then
        raise exception 'FAIL [%]: expected SQLSTATE %, got % (%)',
          p_label, p_sqlstate, sqlstate, sqlerrm;
      end if;
      if p_like is not null and sqlerrm not like p_like then
        raise exception 'FAIL [%]: expected message like %, got %',
          p_label, p_like, sqlerrm;
      end if;
      raise notice 'pass [%] (% )', p_label, sqlerrm;
      return;
  end;
  raise exception 'FAIL [%]: expected an exception, but the statement succeeded', p_label;
end;
$$;

create or replace function pg_temp.assert_eq(
  p_label text,
  p_sql   text,
  p_expected text
) returns void
language plpgsql
as $$
declare
  v_actual text;
begin
  execute p_sql into v_actual;
  if coalesce(v_actual, '<null>') <> coalesce(p_expected, '<null>') then
    raise exception 'FAIL [%]: expected %, got %', p_label, p_expected, v_actual;
  end if;
  raise notice 'pass [%]', p_label;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures: one product with stock, one order, and four callers.
--
-- The callers are distinct on purpose. A suite that only ever acts as an
-- administrator cannot tell "the permission check works" from "the permission
-- check is absent and everyone happens to be allowed".
-- -----------------------------------------------------------------------------

set role service_role;

-- Clean before, as well as after. A suite that only cleans up on success leaves
-- its fixtures behind when an assertion fails midway, and the next run then
-- counts the previous run's ledger rows. That is how a passing run becomes
-- unreproducible.
-- `service_status_events` is append-only by trigger, for every role including
-- `service_role` (0015). It cannot be cleaned up, and it must not be: the whole
-- point of the table is that history cannot be rewritten. The assertions below
-- therefore measure the *increase* over a baseline rather than an absolute
-- count, which is what makes the suite repeatable against a database that has
-- already run it.
delete from public.sell_trade_requests where id = 'e0000000-0000-0000-0000-0000000000e2';
delete from public.inquiries where id = 'e0000000-0000-0000-0000-0000000000e1';
delete from public.order_request_events where order_request_id in (
  'd0000000-0000-0000-0000-0000000000d1', 'd0000000-0000-0000-0000-0000000000d2');
delete from public.order_requests where id in (
  'd0000000-0000-0000-0000-0000000000d1', 'd0000000-0000-0000-0000-0000000000d2');
delete from public.admin_audit_logs where entity_id in (
  'c0000000-0000-0000-0000-0000000000c1',
  'd0000000-0000-0000-0000-0000000000d1',
  'e0000000-0000-0000-0000-0000000000e2');
delete from public.inventory_transactions where product_id = 'c0000000-0000-0000-0000-0000000000c1';

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'admin-adm60@example.test'),
  ('a0000000-0000-0000-0000-0000000000a2', 'support-adm60@example.test'),
  ('a0000000-0000-0000-0000-0000000000a3', 'customer-adm60@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'admin-adm60@example.test'),
  ('a0000000-0000-0000-0000-0000000000a2', 'support-adm60@example.test'),
  ('a0000000-0000-0000-0000-0000000000a3', 'customer-adm60@example.test')
on conflict (id) do nothing;

-- ADMIN holds orders.write, orders.settle, inventory.write, catalog.write and
-- audit.read. CUSTOMER_SUPPORT holds orders.read and inquiries.write but *not*
-- orders.settle and not inventory.write — which is what makes it the useful
-- negative control for the settlement and stock rules.
insert into public.user_roles (user_id, role) values
  ('a0000000-0000-0000-0000-0000000000a1', 'ADMIN'),
  ('a0000000-0000-0000-0000-0000000000a2', 'CUSTOMER_SUPPORT')
on conflict do nothing;

insert into public.brands (id, slug, name) values
  ('b0000000-0000-0000-0000-0000000000b1', 'admin-test-brand', 'Admin Test Brand')
on conflict (id) do nothing;

-- Created as a draft. `products_published_requires_timestamp` refuses a
-- published row with no `published_at`, so publication has to go through the
-- function that stamps it — which is exactly what section 4 exercises.
insert into public.products (id, sku, slug, title, brand_id, status, price_cents, price_on_request)
values (
  'c0000000-0000-0000-0000-0000000000c1',
  'ADM-TEST-1', 'admin-test-watch', 'Admin Test Watch',
  'b0000000-0000-0000-0000-0000000000b1', 'draft', 500000, false
)
on conflict (id) do nothing;

insert into public.inventory (product_id, quantity, reserved_quantity)
values ('c0000000-0000-0000-0000-0000000000c1', 5, 0)
on conflict (product_id) do update set quantity = 5, reserved_quantity = 0;

insert into public.order_requests (
  id, reference, customer_name, customer_email, fulfilment_type,
  pickup_location, payment_method_code, subtotal_cents, delivery_fee_cents,
  total_cents, status
) values (
  'd0000000-0000-0000-0000-0000000000d1', 'LW-AD-000001',
  'Admin Test Buyer', 'buyer-adm60@example.test', 'pickup',
  'Mayfair', 'bank_transfer', 500000, 0, 500000, 'submitted'
)
on conflict (id) do nothing;

-- A second order already in a terminal state, so the "cannot leave a terminal
-- state" rule can be exercised without first driving one there.
insert into public.order_requests (
  id, reference, customer_name, customer_email, fulfilment_type,
  pickup_location, payment_method_code, subtotal_cents, delivery_fee_cents,
  total_cents, status
) values (
  'd0000000-0000-0000-0000-0000000000d2', 'LW-AD-000002',
  'Cancelled Buyer', 'cancelled-adm60@example.test', 'pickup',
  'Mayfair', 'bank_transfer', 500000, 0, 500000, 'cancelled'
)
on conflict (id) do nothing;

reset role;

-- -----------------------------------------------------------------------------
-- 1. The audit writer refuses an unattributable change
--
-- This is the assertion that matters most in the whole file. An audit row with a
-- null actor reads as a system action, so a privileged change made by an
-- anonymous caller would be indistinguishable from one made by nobody.
-- -----------------------------------------------------------------------------

set role anon;
select pg_temp.assert_raises(
  'audit: an anonymous caller cannot write an audit row',
  $q$select public.admin_write_audit_log('test', 'product', null, null)$q$,
  '42501',
  '%must be attributable%'
);
reset role;

-- A signed-in customer is not staff, so the second gate refuses them even though
-- they have an identity to attribute the row to.
set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select pg_temp.assert_raises(
  'audit: a signed-in customer is not staff',
  $q$select public.admin_write_audit_log('test', 'product', null, null)$q$,
  '42501',
  '%Only staff%'
);
reset role;

-- -----------------------------------------------------------------------------
-- 2. The permission snapshot the admin navigation is built from
--
-- The wildcard expansion is the assertion that matters here. `SUPER_ADMIN` holds
-- `'*'` rather than a list, so a resolver that only understood named permissions
-- would hand the most privileged role *no* permissions and every screen would
-- render as though the person were a junior. That inversion fails silently,
-- which is exactly why it is asserted rather than assumed.
-- -----------------------------------------------------------------------------

set role service_role;
insert into public.user_roles (user_id, role) values
  ('a0000000-0000-0000-0000-0000000000a1', 'SUPER_ADMIN')
on conflict do nothing;
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select pg_temp.assert_eq(
  'permissions: SUPER_ADMIN resolves to the full set, wildcard expanded',
  $q$select count(distinct permission)::text from public.current_admin_permissions()$q$,
  '15'
);

select pg_temp.assert_eq(
  'permissions: SUPER_ADMIN holds a named sensitive permission',
  $q$select (bool_or(permission = 'orders.settle'))::text from public.current_admin_permissions()$q$,
  'true'
);

reset role;

-- Remove the SUPER_ADMIN grant so later sections test ADMIN on its own merits
-- rather than inheriting the wildcard.
set role service_role;
delete from public.user_roles
 where user_id = 'a0000000-0000-0000-0000-0000000000a1' and role = 'SUPER_ADMIN';
reset role;

-- A customer holds no staff role, so the snapshot is empty rather than partial.
set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select pg_temp.assert_eq(
  'permissions: a customer resolves to no permissions',
  $q$select count(*)::text from public.current_admin_permissions()$q$,
  '0'
);
reset role;

-- -----------------------------------------------------------------------------
-- 3. Stock adjustment
-- -----------------------------------------------------------------------------

-- A customer cannot move stock, whatever the request looks like.
set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select pg_temp.assert_raises(
  'stock: a customer cannot adjust stock',
  $q$select public.admin_adjust_stock('c0000000-0000-0000-0000-0000000000c1', 1, 'theft')$q$,
  '42501',
  '%permission%'
);
reset role;

-- Support holds orders.read but not inventory.write.
set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select pg_temp.assert_raises(
  'stock: support cannot adjust stock (no inventory.write)',
  $q$select public.admin_adjust_stock('c0000000-0000-0000-0000-0000000000c1', 1, 'support tried')$q$,
  '42501',
  '%permission%'
);
reset role;

-- An administrator can, and the balance moves through the ledger.
set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select pg_temp.assert_eq(
  'stock: balance before',
  $q$select quantity::text from public.inventory where product_id = 'c0000000-0000-0000-0000-0000000000c1'$q$,
  '5'
);

select public.admin_adjust_stock('c0000000-0000-0000-0000-0000000000c1', 3, 'Delivery from supplier');

select pg_temp.assert_eq(
  'stock: balance after +3',
  $q$select quantity::text from public.inventory where product_id = 'c0000000-0000-0000-0000-0000000000c1'$q$,
  '8'
);

-- The ledger is the source of truth, so the movement must be in it — not merely
-- reflected in the balance. A function that updated `inventory` directly would
-- pass the assertion above and fail this one.
select pg_temp.assert_eq(
  'stock: the movement is in the ledger',
  $q$select count(*)::text from public.inventory_transactions
      where product_id = 'c0000000-0000-0000-0000-0000000000c1'
        and kind = 'adjustment' and quantity_delta = 3$q$,
  '1'
);

-- And the audit row must name the person and the reason. The reason is what
-- makes the ledger explain a discrepancy later.
select pg_temp.assert_eq(
  'stock: the audit row names the actor and the reason',
  $q$select count(*)::text from public.admin_audit_logs
      where action = 'inventory.adjust'
        and entity_id = 'c0000000-0000-0000-0000-0000000000c1'
        and actor_id = 'a0000000-0000-0000-0000-0000000000a1'
        and changes->>'reason' = 'Delivery from supplier'
        and changes->>'delta' = '3'$q$,
  '1'
);

select pg_temp.assert_raises(
  'stock: a zero adjustment is refused',
  $q$select public.admin_adjust_stock('c0000000-0000-0000-0000-0000000000c1', 0, 'nothing')$q$,
  '23514',
  '%zero%'
);

select pg_temp.assert_raises(
  'stock: a reason is required',
  $q$select public.admin_adjust_stock('c0000000-0000-0000-0000-0000000000c1', 1, '  ')$q$,
  '23514',
  '%reason%'
);

-- Negative stock is refused with a message that names the numbers, not a
-- constraint name. The check constraint would also catch it; this is about the
-- message a human reads.
select pg_temp.assert_raises(
  'stock: cannot drive the balance negative',
  $q$select public.admin_adjust_stock('c0000000-0000-0000-0000-0000000000c1', -100, 'oversell')$q$,
  '23514',
  '%below zero%'
);

-- Restore the balance so later sections start from a known state.
select public.admin_adjust_stock('c0000000-0000-0000-0000-0000000000c1', -3, 'Test cleanup');

reset role;

-- -----------------------------------------------------------------------------
-- 4. Order transitions
--
-- The three rules a table policy cannot express: settlement needs a permission,
-- a terminal state is terminal, and the actor is stamped on the settlement.
-- -----------------------------------------------------------------------------

-- Support holds `orders.read` but not `orders.write`, so it cannot move an order
-- at all. It is still a useful caller here: it proves the first gate refuses a
-- signed-in staff member who is not permitted, which is a stronger statement
-- than refusing an anonymous stranger.
--
-- Note on `orders.settle`: the permission matrix currently grants `orders.write`
-- and `orders.settle` to the same two roles (ADMIN, SALES_MANAGER), so the
-- settlement guard inside `admin_transition_order` cannot be exercised as a
-- *distinguishing* rule from SQL — there is no caller that holds one and not the
-- other. The guard is kept because it is the rule that would matter if the
-- matrix were ever separated, and its absence would be silent. That it cannot
-- currently be tested independently is recorded in KNOWN_ISSUES rather than
-- papered over with a test that passes for the wrong reason.
set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select pg_temp.assert_raises(
  'order: support cannot move an order (no orders.write)',
  $q$select public.admin_transition_order('d0000000-0000-0000-0000-0000000000d1', 'under_review', 'Checking availability')$q$,
  '42501',
  '%permission%'
);

select pg_temp.assert_raises(
  'order: support cannot settle an order either',
  $q$select public.admin_transition_order('d0000000-0000-0000-0000-0000000000d1', 'paid_offline', 'I think it arrived')$q$,
  '42501',
  '%permission%'
);

reset role;

-- The administrator can, and settling must stamp who and when. A settlement with
-- no identity is a claim nobody made.
set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select public.admin_transition_order('d0000000-0000-0000-0000-0000000000d1', 'under_review', 'Checking availability');

select pg_temp.assert_eq(
  'order: the administrator moved the order to under_review',
  $q$select status::text from public.order_requests where id = 'd0000000-0000-0000-0000-0000000000d1'$q$,
  'under_review'
);

select public.admin_transition_order('d0000000-0000-0000-0000-0000000000d1', 'paid_offline', 'Bank transfer confirmed on statement');

reset role;

-- The settlement assertions read back as `service_role`, because
-- `settled_offline_by` and `admin_note` are staff-only columns and are not
-- granted to `authenticated` (0014). That is not a workaround: it is how the
-- admin application reads orders, and asserting as the wrong role would have
-- tested a surface no admin screen uses.
set role service_role;

select pg_temp.assert_eq(
  'order: settlement stamps the settling administrator',
  $q$select (settled_offline_by = 'a0000000-0000-0000-0000-0000000000a1')::text from public.order_requests where id = 'd0000000-0000-0000-0000-0000000000d1'$q$,
  'true'
);

select pg_temp.assert_eq(
  'order: settlement stamps a timestamp',
  $q$select (settled_offline_at is not null)::text from public.order_requests where id = 'd0000000-0000-0000-0000-0000000000d1'$q$,
  'true'
);

select pg_temp.assert_eq(
  'order: the settlement note is recorded',
  $q$select admin_note from public.order_requests where id = 'd0000000-0000-0000-0000-0000000000d1'$q$,
  'Bank transfer confirmed on statement'
);

-- The transition is in the order's own history, which is what the customer sees.
select pg_temp.assert_eq(
  'order: the transition is in the event history',
  $q$select count(*)::text from public.order_request_events
      where order_request_id = 'd0000000-0000-0000-0000-0000000000d1'
        and from_status = 'under_review' and to_status = 'paid_offline'$q$,
  '1'
);

-- And in the administrative audit trail, with the actor. Asserted on the
-- specific transition rather than a row count: the administrator moved this
-- order twice, so a count would be two and would say nothing about *which*
-- changes were recorded.
select pg_temp.assert_eq(
  'order: the settlement is in the audit trail with its actor',
  $q$select count(*)::text from public.admin_audit_logs
      where action = 'order.status_changed'
        and entity_id = 'd0000000-0000-0000-0000-0000000000d1'
        and actor_id = 'a0000000-0000-0000-0000-0000000000a1'
        and changes->>'from' = 'under_review'
        and changes->>'to' = 'paid_offline'$q$,
  '1'
);

select pg_temp.assert_eq(
  'order: both transitions were recorded',
  $q$select count(*)::text from public.admin_audit_logs
      where action = 'order.status_changed'
        and entity_id = 'd0000000-0000-0000-0000-0000000000d1'$q$,
  '2'
);

reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

-- A terminal order cannot be moved. This is the rule that protects the
-- inventory: cancellation already returned the stock, and that stock may since
-- have been sold to somebody else.
select pg_temp.assert_raises(
  'order: a cancelled order cannot change status',
  $q$select public.admin_transition_order('d0000000-0000-0000-0000-0000000000d2', 'confirmed', 'oops')$q$,
  '23514',
  '%cannot change status%'
);

select pg_temp.assert_raises(
  'order: a status cannot be set to what it already is',
  $q$select public.admin_transition_order('d0000000-0000-0000-0000-0000000000d2', 'cancelled', null)$q$,
  '23514'
);

reset role;

-- -----------------------------------------------------------------------------
-- 5. Product publication
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

-- Support has catalog.read, not catalog.write.
select pg_temp.assert_raises(
  'product: support cannot publish (no catalog.write)',
  $q$select public.admin_set_product_status('c0000000-0000-0000-0000-0000000000c1', 'draft')$q$,
  '42501',
  '%permission%'
);

reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select public.admin_set_product_status('c0000000-0000-0000-0000-0000000000c1', 'draft');

select pg_temp.assert_eq(
  'product: unpublishing records the change',
  $q$select count(*)::text from public.admin_audit_logs
      where action = 'product.status_changed'
        and entity_id = 'c0000000-0000-0000-0000-0000000000c1'
        and changes->>'to' = 'draft'$q$,
  '1'
);

-- `published_at` is stamped once, on the first publication. A re-publish must
-- not claim the piece is newly listed.
select public.admin_set_product_status('c0000000-0000-0000-0000-0000000000c1', 'published');
select pg_temp.assert_eq(
  'product: first publication stamps published_at',
  $q$select (published_at is not null)::text from public.products where id = 'c0000000-0000-0000-0000-0000000000c1'$q$,
  'true'
);

reset role;

-- -----------------------------------------------------------------------------
-- 6. Service status transitions
--
-- The history row and the status column must move together, and an internal note
-- must be recorded without being shown to the customer.
-- -----------------------------------------------------------------------------

set role service_role;
insert into public.inquiries (id, type, name, email, message, reference)
values (
  'e0000000-0000-0000-0000-0000000000e1', 'sell_trade',
  'Service Test', 'service-adm60@example.test', 'A watch to sell', 'LW-ST-900001'
) on conflict (id) do nothing;

insert into public.sell_trade_requests (id, inquiry_id, brand_name, model_name)
values ('e0000000-0000-0000-0000-0000000000e2', 'e0000000-0000-0000-0000-0000000000e1', 'Rolex', 'Submariner')
on conflict (id) do nothing;
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

-- Support holds inquiries.write, so this should succeed.
select count(*) as svc_events_before,
       count(*) filter (where from_status = 'submitted' and to_status = 'under_review') as svc_transition_before
  from public.service_status_events
 where entity_id = 'e0000000-0000-0000-0000-0000000000e2' \gset

select public.admin_set_service_status('sell_trade', 'e0000000-0000-0000-0000-0000000000e2', 'under_review', 'Looking at the photos', false);

select pg_temp.assert_eq(
  'service: the status column moved',
  $q$select workflow_status::text from public.sell_trade_requests where id = 'e0000000-0000-0000-0000-0000000000e2'$q$,
  'under_review'
);

select pg_temp.assert_eq(
  'service: the history row was appended in the same transaction',
  format($q$select count(*)::text from public.service_status_events
      where entity_id = 'e0000000-0000-0000-0000-0000000000e2'$q$),
  (:svc_events_before + 1)::text
);

select pg_temp.assert_eq(
  'service: the appended row records the transition',
  $q$select count(*)::text from public.service_status_events
      where entity_id = 'e0000000-0000-0000-0000-0000000000e2'
        and from_status = 'submitted' and to_status = 'under_review'$q$,
  (:svc_transition_before + 1)::text
);

select pg_temp.assert_eq(
  'service: an internal note is recorded as not customer-visible',
  $q$select is_customer_visible::text from public.service_status_events
      where entity_id = 'e0000000-0000-0000-0000-0000000000e2'
        and to_status = 'under_review'$q$,
  'false'
);

-- A status outside the flow's vocabulary must be refused, not stored and
-- rendered as an unrenderable state. It is refused by the enum cast (22P02)
-- before the table's check constraint is reached, which is the better outcome:
-- the failure names the bad value rather than a constraint.
select pg_temp.assert_raises(
  'service: an unknown status for the flow is refused',
  $q$select public.admin_set_service_status('sell_trade', 'e0000000-0000-0000-0000-0000000000e2', 'banana', null, true)$q$,
  '22P02',
  '%banana%'
);

reset role;

-- A customer cannot move a service request, because they do not hold
-- inquiries.write.
set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select pg_temp.assert_raises(
  'service: a customer cannot change a service status',
  $q$select public.admin_set_service_status('sell_trade', 'e0000000-0000-0000-0000-0000000000e2', 'accepted', null, true)$q$,
  '42501',
  '%permission%'
);
reset role;

-- -----------------------------------------------------------------------------
-- 7. The activity view respects the underlying policy
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select pg_temp.assert_eq(
  'audit: an administrator can read the activity feed',
  $q$select (count(*) > 0)::text from public.admin_activity_feed$q$,
  'true'
);

reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

-- A customer holds no permission on the audit table, so the view — which is
-- `security_invoker` — shows them nothing rather than exposing the trail.
select pg_temp.assert_eq(
  'audit: a customer sees nothing through the activity view',
  $q$select count(*)::text from public.admin_activity_feed$q$,
  '0'
);

reset role;

-- -----------------------------------------------------------------------------
-- Cleanup, so the suite can run twice against the same database.
-- -----------------------------------------------------------------------------

set role service_role;
-- `service_status_events` is append-only by trigger, for every role including
-- `service_role` (0015). It cannot be cleaned up, and it must not be: the whole
-- point of the table is that history cannot be rewritten. The assertions below
-- therefore measure the *increase* over a baseline rather than an absolute
-- count, which is what makes the suite repeatable against a database that has
-- already run it.
delete from public.sell_trade_requests where id = 'e0000000-0000-0000-0000-0000000000e2';
delete from public.inquiries where id = 'e0000000-0000-0000-0000-0000000000e1';
delete from public.order_request_events where order_request_id in (
  'd0000000-0000-0000-0000-0000000000d1', 'd0000000-0000-0000-0000-0000000000d2');
delete from public.order_requests where id in (
  'd0000000-0000-0000-0000-0000000000d1', 'd0000000-0000-0000-0000-0000000000d2');
delete from public.admin_audit_logs where entity_id in (
  'c0000000-0000-0000-0000-0000000000c1',
  'd0000000-0000-0000-0000-0000000000d1',
  'e0000000-0000-0000-0000-0000000000e2');
delete from public.inventory_transactions where product_id = 'c0000000-0000-0000-0000-0000000000c1';
delete from public.inventory where product_id = 'c0000000-0000-0000-0000-0000000000c1';
delete from public.products where id = 'c0000000-0000-0000-0000-0000000000c1';
delete from public.brands where id = 'b0000000-0000-0000-0000-0000000000b1';
-- The fixture users and their roles are deliberately left in place. Deleting a
-- user sets `actor_id` to null on every audit and status event they caused, and
-- that update is refused by the append-only trigger — which is the schema
-- saying, correctly, that the record of who did something may not be erased to
-- tidy up a test. The inserts above use `on conflict do nothing`, so a second run
-- reuses these rows rather than needing them gone.
reset role;

\echo '60_admin_operations: all assertions passed'

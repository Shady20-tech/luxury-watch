-- =============================================================================
-- 67 — Role management and product removal (migration 0033)
--
-- Six claims, each one something a table write alone would not guarantee:
--
--   1. Only a SUPER_ADMIN may grant or revoke; every other role is refused.
--   2. A super administrator cannot change their own roles.
--   3. The last unexpired SUPER_ADMIN cannot be removed, so the system cannot
--      lock itself out of role administration.
--   4. An expired SUPER_ADMIN grant does not count as cover for that guard.
--   5. Every grant and revocation writes an audit row, attributed to the actor.
--   6. `admin_remove_product` archives rather than deletes, is idempotent, and
--      leaves the order history that references the row intact.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert_raises(
  p_label text, p_sql text
) returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'pass [%] (raised: %)', p_label, sqlerrm;
    return;
  end;
  raise exception 'FAIL [%]: expected an error, but the statement succeeded', p_label;
end;
$$;

create or replace function pg_temp.assert_true(
  p_label text, p_sql text
) returns void
language plpgsql
as $$
declare v boolean;
begin
  execute p_sql into v;
  if v is not true then
    raise exception 'FAIL [%]: expected true, got %', p_label, coalesce(v::text, 'null');
  end if;
  raise notice 'pass [%]', p_label;
end;
$$;

-- -----------------------------------------------------------------------------
-- Identities. Two super administrators so a revocation has somewhere to go, a
-- second super administrator whose grant is expired, and one of every lesser
-- role to prove the door is shut for them.
-- -----------------------------------------------------------------------------

set role service_role;

insert into auth.users (id, email) values
  ('67000000-0000-4000-8000-000000000001', 'rm-super-a@example.test'),
  ('67000000-0000-4000-8000-000000000002', 'rm-super-b@example.test'),
  ('67000000-0000-4000-8000-000000000003', 'rm-admin@example.test'),
  ('67000000-0000-4000-8000-000000000004', 'rm-support@example.test'),
  ('67000000-0000-4000-8000-000000000005', 'rm-lapsed@example.test'),
  ('67000000-0000-4000-8000-000000000006', 'rm-customer@example.test')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role, expires_at) values
  ('67000000-0000-4000-8000-000000000001', 'SUPER_ADMIN', null),
  ('67000000-0000-4000-8000-000000000002', 'SUPER_ADMIN', null),
  ('67000000-0000-4000-8000-000000000003', 'ADMIN', null),
  ('67000000-0000-4000-8000-000000000004', 'CUSTOMER_SUPPORT', null),
  -- A lapsed super administrator. The lockout guard must not count this row.
  ('67000000-0000-4000-8000-000000000005', 'SUPER_ADMIN', now() - interval '1 day')
on conflict (user_id, role) do update set expires_at = excluded.expires_at;

reset role;

-- =============================================================================
-- 1. A lesser staff role cannot grant
-- =============================================================================

set role authenticated;
set request.jwt.claims = '{"sub":"67000000-0000-4000-8000-000000000003","role":"authenticated"}';

select pg_temp.assert_raises(
  'an ADMIN cannot grant a role',
  $$select public.admin_grant_role('67000000-0000-4000-8000-000000000006', 'ADMIN')$$);

select pg_temp.assert_raises(
  'a CUSTOMER_SUPPORT agent cannot revoke a role',
  $$select public.admin_revoke_role('67000000-0000-4000-8000-000000000003', 'ADMIN')$$);

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"67000000-0000-4000-8000-000000000004","role":"authenticated"}';

select pg_temp.assert_raises(
  'a CUSTOMER_SUPPORT agent cannot grant a role',
  $$select public.admin_grant_role('67000000-0000-4000-8000-000000000006', 'ADMIN')$$);

-- An ordinary customer, signed out of any staff role, is refused too.
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"67000000-0000-4000-8000-000000000006","role":"authenticated"}';

select pg_temp.assert_raises(
  'a customer cannot grant themselves a role',
  $$select public.admin_grant_role('67000000-0000-4000-8000-000000000006', 'SUPER_ADMIN')$$);

-- =============================================================================
-- 2. Self-service: a grant to yourself is refused, a step-down is not
--
-- The asymmetry is deliberate. Granting yourself a role is self-elevation: it
-- cannot give a super administrator a capability they lack, but it leaves an
-- audit trail that reads as though somebody promoted themselves. Changing your
-- own roles downward is a step-down, and refusing it would mean the only way to
-- leave a role was to ask somebody else — so it is allowed, and audited like any
-- other revocation.
-- =============================================================================

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"67000000-0000-4000-8000-000000000001","role":"authenticated"}';

select pg_temp.assert_raises(
  'a super administrator cannot grant themselves another role',
  $$select public.admin_grant_role('67000000-0000-4000-8000-000000000001', 'ADMIN')$$);

-- =============================================================================
-- 3. A super administrator may grant, and the grant is attributed and audited
-- =============================================================================

-- Grant ADMIN to the customer, as super administrator A.
select public.admin_grant_role('67000000-0000-4000-8000-000000000006', 'ADMIN');

select pg_temp.assert_true(
  'the grant exists',
  $$select exists (select 1 from public.user_roles
                     where user_id = '67000000-0000-4000-8000-000000000006' and role = 'ADMIN')$$);

select pg_temp.assert_true(
  'the grant is attributed to the actor',
  $$select exists (select 1 from public.user_roles
                     where user_id = '67000000-0000-4000-8000-000000000006'
                       and role = 'ADMIN'
                       and granted_by = '67000000-0000-4000-8000-000000000001')$$);

reset role;
set role service_role;

select pg_temp.assert_true(
  'the grant wrote an attributable audit row',
  $$select exists (select 1 from public.admin_audit_logs
                     where action = 'role.granted'
                       and entity_type = 'user_role'
                       and actor_id = '67000000-0000-4000-8000-000000000001'
                       and changes->>'role' = 'ADMIN'
                       and changes->>'user_id' = '67000000-0000-4000-8000-000000000006')$$);

reset role;

-- Granting the same role again refreshes rather than duplicates: the unique
-- constraint is (user_id, role), and the function upserts.
set role authenticated;
set request.jwt.claims = '{"sub":"67000000-0000-4000-8000-000000000001","role":"authenticated"}';

select public.admin_grant_role('67000000-0000-4000-8000-000000000006', 'ADMIN', now() + interval '7 days');

select pg_temp.assert_true(
  'a re-grant updates the expiry instead of duplicating the row',
  $$select count(*) = 1 from public.user_roles
     where user_id = '67000000-0000-4000-8000-000000000006' and role = 'ADMIN'$$);

-- =============================================================================
-- 4. A step-down is allowed, and audited; the lockout guard still holds
--
-- A revokes their own SUPER_ADMIN while B still holds one. That succeeds, is
-- attributed to A and audited. B is then the last unexpired super administrator:
-- the lapsed grant at 000005 is not access, so it does not count as cover, and B
-- cannot remove themselves.
-- =============================================================================

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"67000000-0000-4000-8000-000000000001","role":"authenticated"}';

select public.admin_revoke_role('67000000-0000-4000-8000-000000000001', 'SUPER_ADMIN');

reset role;
set role service_role;
select pg_temp.assert_true(
  'the step-down wrote an attributable audit row',
  $$select exists (select 1 from public.admin_audit_logs
                     where action = 'role.revoked'
                       and entity_type = 'user_role'
                       and actor_id = '67000000-0000-4000-8000-000000000001'
                       and changes->>'role' = 'SUPER_ADMIN'
                       and changes->>'user_id' = '67000000-0000-4000-8000-000000000001')$$);
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"67000000-0000-4000-8000-000000000002","role":"authenticated"}';

select pg_temp.assert_raises(
  'the last unexpired super administrator cannot be removed (self-revocation)',
  $$select public.admin_revoke_role('67000000-0000-4000-8000-000000000002', 'SUPER_ADMIN')$$);

-- =============================================================================
-- 5. Product removal is a soft delete
-- =============================================================================

reset role;
set role service_role;

insert into public.payment_methods (code, label, is_enabled)
values ('bank_transfer', 'Bank transfer', true)
on conflict (code) do nothing;

insert into public.products (id, sku, slug, title, status, published_at, price_on_request, price_cents)
values
  ('67000000-0000-4000-8000-0000000000a1', 'RM-WATCH-1', 'rm-watch-one', 'Rm Watch One',
   'published', now(), true, null),
  ('67000000-0000-4000-8000-0000000000a2', 'RM-WATCH-2', 'rm-watch-two', 'Rm Watch Two',
   'published', now(), false, 250000)
on conflict (slug) do nothing;

insert into public.order_requests (
  id, reference, customer_name, customer_email, fulfilment_type,
  pickup_location, payment_method_code, status
) values (
  '67000000-0000-4000-8000-0000000000b1', 'LW-RM-000001', 'Rm Customer',
  'rm-customer@example.test', 'pickup', 'Mayfair', 'bank_transfer', 'submitted'
)
on conflict (reference) do nothing;

insert into public.order_request_items (
  order_request_id, product_id, product_title_snapshot, sku_snapshot,
  unit_price_cents, quantity, line_total_cents
) values (
  '67000000-0000-4000-8000-0000000000b1', '67000000-0000-4000-8000-0000000000a1',
  'Rm Watch One', 'RM-WATCH-1', 100000, 1, 100000
);

reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"67000000-0000-4000-8000-000000000002","role":"authenticated"}';

select public.admin_remove_product('67000000-0000-4000-8000-0000000000a1');

reset role;
set role service_role;

select pg_temp.assert_true(
  'the product row still exists after removal',
  $$select exists (select 1 from public.products where id = '67000000-0000-4000-8000-0000000000a1')$$);

select pg_temp.assert_true(
  'the product is archived, not deleted',
  $$select status = 'archived' from public.products where id = '67000000-0000-4000-8000-0000000000a1'$$);

select pg_temp.assert_true(
  'the order history that references the product survives',
  $$select exists (select 1 from public.order_request_items
                     where order_request_id = '67000000-0000-4000-8000-0000000000b1'
                       and product_id = '67000000-0000-4000-8000-0000000000a1')$$);

select pg_temp.assert_true(
  'the removal wrote an audit row',
  $$select exists (select 1 from public.admin_audit_logs
                     where action = 'product.removed'
                       and entity_id = '67000000-0000-4000-8000-0000000000a1'
                       and changes->>'to' = 'archived')$$);

reset role;

-- Idempotent: removing an already-archived product returns rather than raising,
-- so a double click on a slow connection does not produce an error.
set role authenticated;
set request.jwt.claims = '{"sub":"67000000-0000-4000-8000-000000000002","role":"authenticated"}';

select public.admin_remove_product('67000000-0000-4000-8000-0000000000a1');

-- A caller without `catalog.write` is refused.
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"67000000-0000-4000-8000-000000000004","role":"authenticated"}';

select pg_temp.assert_raises(
  'a customer support agent cannot remove a product',
  $$select public.admin_remove_product('67000000-0000-4000-8000-0000000000a2')$$);

reset role;

-- =============================================================================
-- 6. The locked room: a revoked super administrator loses the ability to grant
-- =============================================================================

-- A was revoked above; they must now be refused. This is the property that
-- makes a revocation mean something in the same session it was made.
set role authenticated;
set request.jwt.claims = '{"sub":"67000000-0000-4000-8000-000000000001","role":"authenticated"}';

select pg_temp.assert_raises(
  'a revoked super administrator can no longer grant',
  $$select public.admin_grant_role('67000000-0000-4000-8000-000000000006', 'CONTENT_MANAGER')$$);

reset role;

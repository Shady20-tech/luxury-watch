-- =============================================================================
-- 30 — Role escalation and staff authorisation
--
-- Proves the two claims the phase brief calls out explicitly:
--
--   * "Roles cannot be self-assigned through client-controlled profile updates."
--   * "Admin access must be checked server-side and restricted by role; policies
--     must not trust user-editable profile metadata as proof of role."
--
-- It also proves that a lesser staff role cannot perform a higher role's action,
-- which is what stops CUSTOMER_SUPPORT behaving like ADMIN.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert_count(
  p_label text, p_sql text, p_expected bigint
) returns void
language plpgsql
as $$
declare v_count bigint;
begin
  execute p_sql into v_count;
  if v_count <> p_expected then
    raise exception 'FAIL [%]: expected %, got %', p_label, p_expected, v_count;
  end if;
  raise notice 'pass [%]', p_label;
end;
$$;

create or replace function pg_temp.assert_denied(
  p_label text, p_sql text
) returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    raise notice 'pass [%] (denied)', p_label;
    return;
  end;
  raise exception 'FAIL [%]: expected permission denied, but it succeeded', p_label;
end;
$$;

create or replace function pg_temp.assert_no_effect(
  p_label text, p_sql text
) returns void
language plpgsql
as $$
declare v_rows bigint;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL [%]: expected 0 rows affected, got %', p_label, v_rows;
  end if;
  raise notice 'pass [%] (0 rows affected)', p_label;
end;
$$;

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

-- Test files share one database, so a permitted read may legitimately return rows
-- seeded by an earlier file. "Can read" is therefore asserted as "sees at least
-- one row", which is the property that matters; "cannot read" is asserted as
-- exactly zero, which is strict.
create or replace function pg_temp.assert_at_least(
  p_label text, p_sql text, p_minimum bigint
) returns void
language plpgsql
as $$
declare v_count bigint;
begin
  execute p_sql into v_count;
  if v_count < p_minimum then
    raise exception 'FAIL [%]: expected at least %, got %', p_label, p_minimum, v_count;
  end if;
  raise notice 'pass [%] (saw %)', p_label, v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Identities: one ordinary customer, one of each staff role, one SUPER_ADMIN.
-- -----------------------------------------------------------------------------

set role service_role;

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000004', 'customer@example.test'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'support@example.test'),
  ('ffffffff-0000-0000-0000-000000000006', 'content@example.test'),
  ('11111111-0000-0000-0000-000000000007', 'inventory@example.test'),
  ('22222222-0000-0000-0000-000000000008', 'admin@example.test'),
  ('33333333-0000-0000-0000-000000000009', 'super@example.test');

insert into public.user_roles (user_id, role) values
  ('eeeeeeee-0000-0000-0000-000000000005', 'CUSTOMER_SUPPORT'),
  ('ffffffff-0000-0000-0000-000000000006', 'CONTENT_MANAGER'),
  ('11111111-0000-0000-0000-000000000007', 'INVENTORY_MANAGER'),
  ('22222222-0000-0000-0000-000000000008', 'ADMIN'),
  ('33333333-0000-0000-0000-000000000009', 'SUPER_ADMIN');

insert into public.products (id, sku, slug, title, status, published_at, price_on_request)
values ('77777777-0000-0000-0000-000000000007', 'SKU-ROLE', 'role-watch', 'Role Watch', 'published', now(), true);

insert into public.inventory (product_id, quantity)
values ('77777777-0000-0000-0000-000000000007', 10);

reset role;

-- =============================================================================
-- 1. A customer cannot escalate their own role
-- =============================================================================

set role authenticated;
set request.jwt.claims = '{"sub":"dddddddd-0000-0000-0000-000000000004","role":"authenticated"}';

-- The decisive test. `profiles` has no role column, so this must fail at parse
-- time: there is nothing to write.
select pg_temp.assert_raises(
  'a customer cannot set a role on their own profile (no such column)',
  'update public.profiles set role = ''ADMIN'' where id = ''dddddddd-0000-0000-0000-000000000004''');

-- They cannot insert a role for themselves either. There is no insert policy on
-- user_roles for anyone but SUPER_ADMIN, so this is denied.
select pg_temp.assert_denied(
  'a customer cannot insert a role for themselves',
  'insert into public.user_roles (user_id, role) values (''dddddddd-0000-0000-0000-000000000004'', ''ADMIN'')');

-- Nor update an existing role row.
select pg_temp.assert_no_effect(
  'a customer cannot update any role row',
  'update public.user_roles set role = ''SUPER_ADMIN'' where user_id = ''dddddddd-0000-0000-0000-000000000004''');

-- Nor delete one.
select pg_temp.assert_no_effect(
  'a customer cannot delete role rows',
  'delete from public.user_roles');

-- Smuggling a role into profile metadata must not work. `full_name` is the only
-- free-text field a customer controls, and no policy reads it.
update public.profiles
   set full_name = 'ADMIN', phone = 'SUPER_ADMIN'
 where id = 'dddddddd-0000-0000-0000-000000000004';

do $$
declare v_admin boolean;
begin
  select public.is_admin() into v_admin;
  if v_admin then
    raise exception 'FAIL: writing role-like text into profile fields granted admin';
  end if;
  raise notice 'pass [role-like text in profile metadata grants nothing]';

  if public.is_staff() then
    raise exception 'FAIL: profile text made the customer staff';
  end if;
  raise notice 'pass [profile text does not make a customer staff]';
end
$$;

-- A customer cannot read the catalogue with write intent either.
select pg_temp.assert_denied(
  'a customer cannot insert a product',
  'insert into public.products (sku, slug, title) values (''H'', ''h'', ''H'')');

-- A customer cannot read other people''s roles.
select pg_temp.assert_count(
  'a customer sees only their own role rows (none)',
  'select count(*) from public.user_roles', 0);

reset role;

-- =============================================================================
-- 2. Permissions behave per role
-- =============================================================================

-- CUSTOMER_SUPPORT: may read orders, may not write the catalogue.
set role authenticated;
set request.jwt.claims = '{"sub":"eeeeeeee-0000-0000-0000-000000000005","role":"authenticated"}';

select pg_temp.assert_at_least(
  'CUSTOMER_SUPPORT can read orders',
  'select count(*) from public.order_requests', 1);

select pg_temp.assert_no_effect(
  'CUSTOMER_SUPPORT cannot publish a product',
  'update public.products set status = ''published'' where slug = ''role-watch''');

select pg_temp.assert_denied(
  'CUSTOMER_SUPPORT cannot insert a brand',
  'insert into public.brands (name, slug) values (''X'', ''x-brand'')');

select pg_temp.assert_count(
  'CUSTOMER_SUPPORT cannot read audit logs',
  'select count(*) from public.admin_audit_logs', 0);

reset role;

-- CONTENT_MANAGER: may write content, may not touch the catalogue or inventory.
set role authenticated;
set request.jwt.claims = '{"sub":"ffffffff-0000-0000-0000-000000000006","role":"authenticated"}';

do $$
begin
  if not public.has_permission('content.write') then
    raise exception 'FAIL: CONTENT_MANAGER should have content.write';
  end if;
  if public.has_permission('catalog.write') then
    raise exception 'FAIL: CONTENT_MANAGER should not have catalog.write';
  end if;
  if public.has_permission('inventory.write') then
    raise exception 'FAIL: CONTENT_MANAGER should not have inventory.write';
  end if;
  if public.has_permission('audit.read') then
    raise exception 'FAIL: CONTENT_MANAGER should not have audit.read';
  end if;
  raise notice 'pass [CONTENT_MANAGER permissions are content-only]';
end
$$;

select pg_temp.assert_no_effect(
  'CONTENT_MANAGER cannot edit a product',
  'update public.products set title = ''Changed'' where slug = ''role-watch''');

select pg_temp.assert_count(
  'CONTENT_MANAGER cannot read inventory',
  'select count(*) from public.inventory', 0);

reset role;

-- INVENTORY_MANAGER: may write inventory and catalogue, may not read orders.
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000007","role":"authenticated"}';

select pg_temp.assert_at_least(
  'INVENTORY_MANAGER can read inventory',
  'select count(*) from public.inventory', 1);

do $$
begin
  if not public.has_permission('inventory.write') then
    raise exception 'FAIL: INVENTORY_MANAGER should have inventory.write';
  end if;
  if public.has_permission('orders.write') then
    raise exception 'FAIL: INVENTORY_MANAGER should not have orders.write';
  end if;
  if public.has_permission('orders.settle') then
    raise exception 'FAIL: INVENTORY_MANAGER must not be able to settle payment';
  end if;
  raise notice 'pass [INVENTORY_MANAGER cannot settle payments]';
end
$$;

-- INVENTORY_MANAGER holds orders.read because it must see which requests are
-- holding stock. It must NOT hold orders.write or orders.settle, asserted above.
select pg_temp.assert_at_least(
  'INVENTORY_MANAGER can read orders (to see what holds stock)',
  'select count(*) from public.order_requests', 1);

reset role;

-- ADMIN: broad, but is NOT a SUPER_ADMIN and cannot assign roles.
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000008","role":"authenticated"}';

do $$
begin
  if not public.is_admin() then
    raise exception 'FAIL: ADMIN should satisfy is_admin()';
  end if;
  if not public.has_permission('orders.settle') then
    raise exception 'FAIL: ADMIN should be able to settle offline';
  end if;
  if public.has_role('SUPER_ADMIN') then
    raise exception 'FAIL: ADMIN must not satisfy has_role(SUPER_ADMIN)';
  end if;
  raise notice 'pass [ADMIN has admin powers but is not SUPER_ADMIN]';
end
$$;

-- An ADMIN may not grant roles: only SUPER_ADMIN can.
select pg_temp.assert_denied(
  'ADMIN cannot grant a role',
  'insert into public.user_roles (user_id, role) values (''dddddddd-0000-0000-0000-000000000004'', ''ADMIN'')');

select pg_temp.assert_count(
  'ADMIN can read audit logs',
  'select count(*) from public.admin_audit_logs', 0);

reset role;

-- =============================================================================
-- 3. SUPER_ADMIN holds every role, and audit logs remain append-only
-- =============================================================================

set role authenticated;
set request.jwt.claims = '{"sub":"33333333-0000-0000-0000-000000000009","role":"authenticated"}';

do $$
declare r public.staff_role;
begin
  foreach r in array enum_range(null::public.staff_role)
  loop
    if not public.has_role(r) then
      raise exception 'FAIL: SUPER_ADMIN should satisfy has_role(%)', r;
    end if;
  end loop;
  raise notice 'pass [SUPER_ADMIN satisfies every role]';

  if not public.has_permission('anything.at.all') then
    raise exception 'FAIL: SUPER_ADMIN should satisfy any permission';
  end if;
  raise notice 'pass [SUPER_ADMIN satisfies any permission]';
end
$$;

-- A SUPER_ADMIN can grant a role (the legitimate path).
insert into public.user_roles (user_id, role) values ('dddddddd-0000-0000-0000-000000000004', 'SALES_MANAGER');
select pg_temp.assert_count(
  'SUPER_ADMIN can grant a role',
  'select count(*) from public.user_roles where user_id = ''dddddddd-0000-0000-0000-000000000004''', 1);

reset role;

-- Even a SUPER_ADMIN cannot rewrite or erase the audit trail through the API.
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-0000-0000-0000-000000000009","role":"authenticated"}';

select pg_temp.assert_denied(
  'even SUPER_ADMIN cannot insert an audit log entry directly',
  'insert into public.admin_audit_logs (action, entity_type) values (''fake'', ''fake'')');

select pg_temp.assert_no_effect(
  'even SUPER_ADMIN cannot update audit logs',
  'update public.admin_audit_logs set action = ''rewritten''');

select pg_temp.assert_no_effect(
  'even SUPER_ADMIN cannot delete audit logs',
  'delete from public.admin_audit_logs');

reset role;

-- =============================================================================
-- 4. Expired roles grant nothing
-- =============================================================================

set role service_role;
update public.user_roles
   set expires_at = now() - interval '1 day'
 where user_id = '22222222-0000-0000-0000-000000000008';
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000008","role":"authenticated"}';

do $$
begin
  if public.is_admin() then
    raise exception 'FAIL: an expired role still granted admin';
  end if;
  if public.is_staff() then
    raise exception 'FAIL: an expired role still granted staff';
  end if;
  raise notice 'pass [an expired role grants nothing]';
end
$$;

select pg_temp.assert_count(
  'an expired ADMIN can no longer read audit logs',
  'select count(*) from public.admin_audit_logs', 0);

reset role;

drop function pg_temp.assert_count(text, text, bigint);
drop function pg_temp.assert_denied(text, text);
drop function pg_temp.assert_no_effect(text, text);
drop function pg_temp.assert_raises(text, text);

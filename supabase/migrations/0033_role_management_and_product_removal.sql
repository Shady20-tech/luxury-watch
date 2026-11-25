-- =============================================================================
-- 0033 — Role management and product removal
-- =============================================================================
--
-- Two operations that the admin platform had no path for, and the reasons each
-- one needs a database function rather than a table write from the application.
--
-- -----------------------------------------------------------------------------
-- 1. WHY ROLE MANAGEMENT CANNOT BE A TABLE WRITE
-- -----------------------------------------------------------------------------
--
-- `user_roles` already has an `ALL` policy for `SUPER_ADMIN` (0007). That policy
-- is correct, and it is not enough. A grant is the single most consequential
-- write in the system: it decides whether a person can see every customer's
-- order, price the catalogue, or grant roles to somebody else. Three things must
-- hold on every grant, and none of them is expressible as a row policy:
--
--   * the actor holds `SUPER_ADMIN` *at the time of the grant*, not merely in a
--     session that was resolved before a role was revoked;
--   * the grant is attributable — `granted_by` is the actor, never a value the
--     caller supplied;
--   * the change is in the audit trail, in the same transaction, so a grant
--     cannot exist without a record of who made it.
--
-- It also has to refuse in two cases a policy cannot see:
--
--   * a caller granting themselves a role (self-elevation). A SUPER_ADMIN may
--     already do everything, so this is not an escalation in practice, but the
--     trail should never read as though someone promoted themselves. Revoking
--     your own role is *not* refused: that is a step-down, and making it
--     impossible would mean the only way out of a role was to ask somebody else;
--   * removing the last `SUPER_ADMIN`. A system with no super administrator has
--     no one who can appoint one, and the fix is a manual database intervention
--     at exactly the moment nobody has the access to do it. This is the classic
--     lockout, and it is cheap to refuse.
--
-- -----------------------------------------------------------------------------
-- 2. WHY PRODUCT REMOVAL IS A SOFT DELETE
-- -----------------------------------------------------------------------------
--
-- `products` is referenced by `order_request_items`, `cart_items`,
-- `wishlist_items`, `product_images`, `product_specs`, `inventory_ledger` and
-- the service-request tables. A hard `DELETE` would cascade the order history
-- with it: a customer's past order would lose the line that says what they
-- asked for. A row that a signed order refers to must not disappear.
--
-- So removal means `status = 'archived'`, which is already excluded from every
-- public catalogue query and from the sitemap. That is what the storefront's
-- "archived" state means, and reusing it keeps one definition of "not for sale"
-- instead of inventing a second. The function exists to make the intent explicit
-- and to record it as a removal rather than as an ordinary status edit.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Grant a role
-- -----------------------------------------------------------------------------

create or replace function public.admin_grant_role(
  p_user_id uuid,
  p_role    public.staff_role,
  p_expires_at timestamptz default null
)
returns public.user_roles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_row   public.user_roles;
begin
  -- Fail closed, and check the role rather than a cached permission: a session
  -- that resolved its permissions before a demotion must not still be able to
  -- grant. `has_role` reads `user_roles` directly.
  if v_actor is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Only a super administrator may change roles'
      using errcode = 'insufficient_privilege';
  end if;

  if p_user_id is null then
    raise exception 'A user is required' using errcode = 'invalid_parameter_value';
  end if;

  -- Refuse self-elevation. A SUPER_ADMIN granting themselves another role is
  -- harmless in capability terms and corrosive in the audit trail, so the honest
  -- thing is to refuse and say why.
  if p_user_id = v_actor then
    raise exception 'A super administrator cannot change their own roles'
      using errcode = 'insufficient_privilege';
  end if;

  -- A profile must exist: a role on a deleted identity is a dangling grant.
  perform 1 from public.profiles where id = p_user_id;
  if not found then
    raise exception 'No user with id %', p_user_id using errcode = 'no_data_found';
  end if;

  insert into public.user_roles (user_id, role, granted_by, expires_at)
  values (p_user_id, p_role, v_actor, p_expires_at)
  on conflict (user_id, role) do update
    -- Re-granting an existing role refreshes the expiry rather than duplicating.
    -- `excluded` holds the proposed row; the unique constraint is (user_id, role).
    set expires_at = excluded.expires_at,
        granted_by = excluded.granted_by,
        granted_at = now()
  returning * into v_row;

  perform public.admin_write_audit_log(
    'role.granted',
    'user_role',
    v_row.id,
    jsonb_build_object('user_id', p_user_id, 'role', p_role, 'expires_at', p_expires_at)
  );

  return v_row;
end;
$$;

comment on function public.admin_grant_role(uuid, public.staff_role, timestamptz) is
  'Grants a staff role as the calling SUPER_ADMIN, refusing self-elevation and '
  'auditing the grant in the same transaction.';

revoke all on function public.admin_grant_role(uuid, public.staff_role, timestamptz) from public;
grant execute on function public.admin_grant_role(uuid, public.staff_role, timestamptz)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. Revoke a role
-- -----------------------------------------------------------------------------

create or replace function public.admin_revoke_role(
  p_user_id uuid,
  p_role    public.staff_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_row_id  uuid;
  v_remaining int;
begin
  if v_actor is null or not public.has_role('SUPER_ADMIN') then
    raise exception 'Only a super administrator may change roles'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_row_id
    from public.user_roles
   where user_id = p_user_id and role = p_role
   for update;

  if not found then
    raise exception 'That user does not hold that role' using errcode = 'no_data_found';
  end if;

  -- The lockout guard. Counting the *other* unexpired SUPER_ADMINs, not the
  -- total: an expired grant is not access, so it must not count as cover.
  if p_role = 'SUPER_ADMIN' then
    select count(*) into v_remaining
      from public.user_roles
     where role = 'SUPER_ADMIN'
       and user_id <> p_user_id
       and (expires_at is null or expires_at > now());

    if v_remaining = 0 then
      raise exception 'The last super administrator cannot be removed'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- The audit row is written *before* the delete, and the order is load-bearing.
  -- `admin_write_audit_log` refuses a caller who is not staff, and a super
  -- administrator revoking their own last staff role ceases to be staff the
  -- instant the row goes. Writing the audit first keeps the change attributable
  -- for the one case that would otherwise be impossible to perform at all: a
  -- step-down. Both statements share the transaction, so a delete that failed
  -- would take the audit row with it.
  perform public.admin_write_audit_log(
    'role.revoked',
    'user_role',
    v_row_id,
    jsonb_build_object('user_id', p_user_id, 'role', p_role)
  );

  delete from public.user_roles where id = v_row_id;
end;
$$;

comment on function public.admin_revoke_role(uuid, public.staff_role) is
  'Revokes a staff role as the calling SUPER_ADMIN, refusing to remove the last '
  'unexpired SUPER_ADMIN and auditing the revocation.';

revoke all on function public.admin_revoke_role(uuid, public.staff_role) from public;
grant execute on function public.admin_revoke_role(uuid, public.staff_role)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Remove (archive) a product
-- -----------------------------------------------------------------------------

create or replace function public.admin_remove_product(p_product_id uuid)
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
    raise exception 'You do not have permission to remove a product'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_before from public.products where id = p_product_id for update;
  if not found then
    raise exception 'No product with id %', p_product_id using errcode = 'no_data_found';
  end if;

  if v_before.status = 'archived' then
    -- Idempotent on purpose: a second click on a slow connection should not
    -- produce an error the person cannot act on.
    return v_before;
  end if;

  update public.products
     set status = 'archived'
   where id = p_product_id
   returning * into v_after;

  -- Recorded as a removal, not as a status edit, so the trail answers "what was
  -- taken off the site" without the reader having to infer it from a status diff.
  perform public.admin_write_audit_log(
    'product.removed',
    'product',
    p_product_id,
    jsonb_build_object('from', v_before.status, 'to', 'archived', 'slug', v_before.slug)
  );

  return v_after;
end;
$$;

comment on function public.admin_remove_product(uuid) is
  'Withdraws a product from sale by archiving it. A soft delete, because order '
  'history references the row and must survive the removal.';

revoke all on function public.admin_remove_product(uuid) from public;
grant execute on function public.admin_remove_product(uuid)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. A read surface for the role manager
-- -----------------------------------------------------------------------------
--
-- The admin screen needs to list staff with their roles and email in one query,
-- and `profiles` is readable only by `customers.read` holders. A view keeps that
-- join in one place rather than repeating it in every caller, and it exposes no
-- more than a role manager needs: identity, email, role, expiry.
--
-- It is a plain view; the caller's own permissions still apply to `profiles` and
-- `user_roles` through RLS, so a staff member without `customers.read` sees no
-- rows. The view does not widen access, it only shapes it.
-- -----------------------------------------------------------------------------

create or replace view public.admin_staff_roster
with (security_invoker = true) as
  select
    ur.id           as user_role_id,
    ur.user_id,
    p.email,
    p.full_name,
    ur.role,
    ur.granted_at,
    ur.expires_at,
    (ur.expires_at is not null and ur.expires_at <= now()) as is_expired
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id
  order by ur.role, p.email;

comment on view public.admin_staff_roster is
  'Staff role assignments joined to the holder''s email. `security_invoker` so '
  'the caller''s RLS policies on profiles and user_roles still decide the rows.';

/**
 * Administrative authorisation.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS SEPARATE FROM `authorization-service.ts`
 * -----------------------------------------------------------------------------
 *
 * That module answers "is this person staff, and do they hold one permission".
 * The admin platform needs more than that: it needs the caller's whole
 * permission set, resolved once, so a page can render a navigation that matches
 * what the person may actually do and an action can refuse without a second
 * round trip. Calling `hasPermission` ten times to build one sidebar would be
 * ten queries for one answer that cannot change mid-request.
 *
 * The check itself is still the database's. `role_permissions` and
 * `has_permission()` remain the single source of truth; this module only
 * resolves them once per request and hands the result around. Nothing here
 * decides that a role *may* do something — it only reports what the database
 * said.
 *
 * -----------------------------------------------------------------------------
 * WHY THE ROLES ARE READ THROUGH FUNCTIONS
 * -----------------------------------------------------------------------------
 *
 * There is deliberately no `role` column on `profiles` (see AGENTS.md). A
 * customer can update their own profile row, so a role stored there would be one
 * policy mistake away from self-promotion. The roles come from `user_roles`
 * through the `SECURITY DEFINER` helpers, which derive the user from
 * `auth.uid()` inside the database and take no user argument — there is no
 * parameter a caller could forge.
 *
 * -----------------------------------------------------------------------------
 * WHY THE ADMIN READS GO THROUGH THE SERVICE-ROLE CLIENT
 * -----------------------------------------------------------------------------
 *
 * The column grants on `products` and `order_requests` withhold the commercial
 * columns (`cost_cents`, `admin_note`, `settled_offline_by`) from the
 * `authenticated` role. An admin screen has to show those columns, so it reads
 * through the service-role client, which bypasses both RLS and the column
 * grants.
 *
 * That is safe *only* because every admin route is behind the guard below, and
 * every admin mutation calls `requirePermission` before it touches the client.
 * Bypassing RLS does not bypass authorisation — this module is the authorisation
 * the service-role client does not perform for itself. A repository that uses the
 * admin client must never be called from a path that has not passed through here.
 */
import 'server-only';

import { cache } from 'react';

import { logger } from '@/lib/logger';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Every permission the database knows about. Kept in sync with `role_permissions`. */
export const PERMISSIONS = [
  'catalog.read',
  'catalog.write',
  'inventory.read',
  'inventory.write',
  'orders.read',
  'orders.write',
  'orders.settle',
  'inquiries.read',
  'inquiries.write',
  'customers.read',
  'content.read',
  'content.write',
  'settings.read',
  'settings.write',
  'audit.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** The seven staff roles, matching the `staff_role` enum exactly. */
export const STAFF_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'SALES_MANAGER',
  'INVENTORY_MANAGER',
  'WATCH_EXPERT',
  'CUSTOMER_SUPPORT',
  'CONTENT_MANAGER',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export type AdminIdentity = {
  userId: string;
  email: string | null;
  roles: StaffRole[];
  permissions: Set<Permission>;
  isAdmin: boolean;
};

/**
 * Resolve the caller's administrative identity, or `null` when they are not
 * staff.
 *
 * Cached per request: the layout, the page and every action in one render see
 * the same snapshot. Two calls that returned different answers mid-request would
 * be a correctness problem, not just a performance one.
 */
export const getAdminIdentity = cache(async (): Promise<AdminIdentity | null> => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  // Roles and the whole permission set in one call. `current_admin_permissions`
  // is `SECURITY DEFINER`, derives the user from `auth.uid()`, and fails closed —
  // a signed-out or non-staff caller gets no rows.
  const { data, error } = await supabase.rpc('current_admin_permissions');

  if (error) {
    logger.error('admin.identity_failed', { message: error.message });
    return null;
  }

  const rows = (data ?? []) as { role: StaffRole; permission: string }[];
  if (rows.length === 0) return null;

  const roles = [...new Set(rows.map((r) => r.role))];
  const permissions = new Set(
    rows
      .map((r) => r.permission)
      .filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p)),
  );

  return {
    userId: user.id,
    email: user.email ?? null,
    roles,
    permissions,
    isAdmin: roles.includes('ADMIN') || roles.includes('SUPER_ADMIN'),
  };
});

/**
 * Whether the current caller holds a permission.
 *
 * Fails closed: an unresolved identity holds nothing.
 */
export async function can(permission: Permission): Promise<boolean> {
  const identity = await getAdminIdentity();
  return identity?.permissions.has(permission) ?? false;
}

/**
 * Assert a permission, for use at the top of a server action.
 *
 * Throws rather than returning a boolean because the only safe response to "this
 * caller may not do that" is to stop. A boolean invites a caller to forget to
 * check it, and the failure mode of that omission is a mutation performed by
 * somebody who was not allowed to perform it.
 *
 * The thrown error deliberately carries no detail about the permission or the
 * caller: it is logged server-side and the action turns it into a generic
 * refusal.
 */
export class AdminPermissionError extends Error {
  constructor(public readonly permission: Permission) {
    super('Not permitted');
    this.name = 'AdminPermissionError';
  }
}

export async function requirePermission(permission: Permission): Promise<AdminIdentity> {
  const identity = await getAdminIdentity();

  if (!identity || !identity.permissions.has(permission)) {
    logger.warn('admin.permission_denied', {
      permission,
      signedIn: Boolean(identity),
      // The user id is an identifier, not a credential, but it is still not
      // logged: an event name and a permission are enough to trace a refusal,
      // and the audit trail is the place that records who did what.
    });
    throw new AdminPermissionError(permission);
  }

  return identity;
}

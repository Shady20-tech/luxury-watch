import 'server-only';

import { cache } from 'react';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthUser, type AuthUser } from '@/server/repositories/auth-repository';

/**
 * Authorisation for protected routes.
 *
 * -----------------------------------------------------------------------------
 * THE RULE THIS MODULE EXISTS TO ENFORCE
 * -----------------------------------------------------------------------------
 *
 * Being signed in is not the same as being allowed. Every route under `/account`
 * requires only the first; anything under `/admin` requires the second, and the
 * check must happen on the server before a single row is read.
 *
 * A route that renders an admin screen and *then* hides the data is not
 * protected — the data was already fetched, and whether the markup shows it is a
 * rendering detail. So the guard returns the user or denies, and the caller does
 * nothing else until it has the answer.
 *
 * -----------------------------------------------------------------------------
 * WHY THE ROLE IS READ THROUGH A FUNCTION, NOT A COLUMN
 * -----------------------------------------------------------------------------
 *
 * There is deliberately no `role` column on `profiles`. A customer can update
 * their own profile row, so a role stored there would be one policy mistake away
 * from self-promotion to `SUPER_ADMIN`. Roles live in `user_roles`, which no
 * customer can write, and are read through the `SECURITY DEFINER` helpers
 * `is_staff()`, `is_admin()` and `has_permission()` (migration 0007).
 *
 * Those functions derive the user from `auth.uid()` inside the database. They
 * take no user argument, so there is no parameter a caller could forge — the
 * answer is always about whoever the session actually belongs to.
 *
 * -----------------------------------------------------------------------------
 * `cache()` AND WHY IT MATTERS FOR CORRECTNESS, NOT SPEED
 * -----------------------------------------------------------------------------
 *
 * A layout, a page and a nested component may each need the role. Resolving it
 * once per request means they cannot disagree with each other, which matters when
 * one of them is deciding whether to render a control and another is deciding
 * whether to allow the action.
 */

/** Whether the caller holds a staff role of any kind. */
export async function isStaff(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('is_staff');
    if (error) throw error;
    return Boolean(data);
  } catch (error) {
    // Fail closed. A role check that cannot be completed is not a "no" that may
    // be treated as a "yes": denying a staff member is recoverable, granting a
    // stranger admin access is not.
    logger.error('authz.is_staff_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** Whether the caller holds `SUPER_ADMIN` or `ADMIN`. */
export async function isAdmin(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('is_admin');
    if (error) throw error;
    return Boolean(data);
  } catch (error) {
    logger.error('authz.is_admin_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Whether the caller holds a named permission.
 *
 * Permissions are the unit the application checks, so a new staff role can be
 * introduced without editing every call site (see `role_permissions`).
 */
export async function hasPermission(permission: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('has_permission', { required: permission });
    if (error) throw error;
    return Boolean(data);
  } catch (error) {
    logger.error('authz.has_permission_failed', {
      message: error instanceof Error ? error.message : String(error),
      permission,
    });
    return false;
  }
}

export type AccountAccess = {
  user: AuthUser;
  isStaff: boolean;
  isAdmin: boolean;
};

/**
 * Resolve the caller's identity and staff standing in one pass.
 *
 * `cache()` keys on nothing, so this runs at most once per request and every
 * caller sees the same answer.
 */
export const getAccountAccess = cache(async (): Promise<AccountAccess | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  return { user, isStaff: await isStaff(), isAdmin: await isAdmin() };
});

/**
 * A fixed, safe destination for a signed-out visitor, preserving where they were
 * heading.
 *
 * The path is used as a query value, not as a redirect target on its own, and the
 * sign-in action validates it again before navigating. Encoding it here means a
 * path containing `&` or `#` cannot break the query string.
 */
export function loginPathFor(returnTo: string): string {
  return `/login?next=${encodeURIComponent(returnTo)}`;
}

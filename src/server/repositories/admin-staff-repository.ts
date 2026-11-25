import 'server-only';

import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { StaffRole } from '@/server/services/admin-authorization';

/**
 * Read queries for the role manager.
 *
 * -----------------------------------------------------------------------------
 * WHY THE SERVICE-ROLE CLIENT
 * -----------------------------------------------------------------------------
 *
 * `admin_staff_roster` is `security_invoker`, so through the session client it
 * would return only the rows the caller's own policies allow — a super
 * administrator would see the roster, but this module is also used to *find* the
 * person a grant is about, and resolving a customer's email for that lookup is
 * the same read. Every caller has already passed `requirePermission`, and the
 * route that renders this list is gated on `SUPER_ADMIN` in the page itself, not
 * merely on `customers.read`.
 *
 * -----------------------------------------------------------------------------
 * WHY THE EMAIL SEARCH IS EXACT-MATCH-FIRST
 * -----------------------------------------------------------------------------
 *
 * A super administrator appointing someone knows their email address, not their
 * user id. An `ilike` prefix search over `profiles` would let the field enumerate
 * every customer in the database one letter at a time; an exact match on the
 * address returns the one person and nothing else. The field is therefore a
 * "find exactly this account" control, and the copy says so.
 */

export type StaffRosterRow = {
  userRoleId: string;
  userId: string;
  email: string | null;
  fullName: string | null;
  role: StaffRole;
  grantedAt: string;
  expiresAt: string | null;
  isExpired: boolean;
};

export type StaffAccount = {
  userId: string;
  email: string | null;
  fullName: string | null;
  roles: { role: StaffRole; expiresAt: string | null; isExpired: boolean }[];
};

/**
 * The whole roster, grouped by person.
 *
 * Grouped in TypeScript rather than in SQL because the view is flat and the
 * grouping is presentation: one person with three roles is one card, and sorting
 * that grouping is easier here than in a view that has to stay a single shape.
 */
export async function listStaffRoster(): Promise<StaffRosterRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('admin_staff_roster')
    .select('user_role_id, user_id, email, full_name, role, granted_at, expires_at, is_expired')
    .order('role')
    .order('email');

  if (error) {
    logger.error('admin.roster_failed', { message: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    userRoleId: row.user_role_id,
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role as StaffRole,
    grantedAt: row.granted_at,
    expiresAt: row.expires_at,
    isExpired: row.is_expired,
  }));
}

/** Group a flat roster into one entry per person. */
export function groupRoster(rows: StaffRosterRow[]): StaffAccount[] {
  const byUser = new Map<string, StaffAccount>();

  for (const row of rows) {
    const existing = byUser.get(row.userId);
    const role = { role: row.role, expiresAt: row.expiresAt, isExpired: row.isExpired };

    if (existing) {
      existing.roles.push(role);
    } else {
      byUser.set(row.userId, {
        userId: row.userId,
        email: row.email,
        fullName: row.fullName,
        roles: [role],
      });
    }
  }

  return [...byUser.values()].sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''));
}

/** The account holding exactly this email, or `null`. Case-insensitive. */
export async function findAccountByEmail(email: string): Promise<StaffAccount | null> {
  const supabase = createSupabaseAdminClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();

  if (profileError) {
    logger.error('admin.account_lookup_failed', { message: profileError.message });
    return null;
  }

  if (!profile) return null;

  const { data: roles, error: rolesError } = await supabase
    .from('admin_staff_roster')
    .select('role, expires_at, is_expired')
    .eq('user_id', profile.id);

  if (rolesError) {
    logger.error('admin.account_roles_failed', { message: rolesError.message });
    return null;
  }

  return {
    userId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    roles: (roles ?? []).map((row) => ({
      role: row.role as StaffRole,
      expiresAt: row.expires_at,
      isExpired: row.is_expired,
    })),
  };
}

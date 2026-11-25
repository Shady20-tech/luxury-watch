'use server';

import { revalidatePath } from 'next/cache';

import { logger } from '@/lib/logger';
import type { AdminFormState } from '@/lib/admin/validation';
import { createSupabaseServerClientWritable } from '@/lib/supabase/server';
import { AdminPermissionError, requirePermission } from '@/server/services/admin-authorization';

/**
 * Role administration actions.
 *
 * -----------------------------------------------------------------------------
 * THE ORDER OF OPERATIONS IS THE SECURITY MODEL
 * -----------------------------------------------------------------------------
 *
 * `requirePermission` is the first statement of every action, before the form is
 * read. A `'use server'` action is a public HTTP endpoint: anyone who can guess
 * its name can call it with any arguments, whether or not they ever loaded the
 * page. The TypeScript guard is the first gate; the database function each action
 * calls re-checks `has_role('SUPER_ADMIN')` as the second, independent gate, so a
 * forgotten guard here would still not grant a role.
 *
 * -----------------------------------------------------------------------------
 * WHY THESE GO THROUGH RPC
 * -----------------------------------------------------------------------------
 *
 * `user_roles` has an `ALL` policy for `SUPER_ADMIN`, so a direct insert would
 * pass RLS. It would also skip `granted_by` attribution, the self-elevation
 * refusal, the last-super-administrator lockout guard and the audit row. Those
 * four things are the reason a grant needs a function; writing the table
 * directly would produce a row that looks right and cannot be explained.
 */

const STAFF_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'SALES_MANAGER',
  'INVENTORY_MANAGER',
  'WATCH_EXPERT',
  'CUSTOMER_SUPPORT',
  'CONTENT_MANAGER',
] as const;

type StaffRole = (typeof STAFF_ROLES)[number];

function refusal(): AdminFormState {
  return {
    status: 'error',
    message: 'Only a super administrator may change roles.',
  };
}

/**
 * Turn a database error into something safe to show.
 *
 * `P0001` is a `raise` from one of our functions, and those messages are written
 * for a person ("The last super administrator cannot be removed"), so they pass
 * through. Everything else is generic: a constraint name or SQLSTATE tells the
 * person nothing and can describe the schema.
 */
function databaseMessage(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === 'P0001' || error.code === '42501') return error.message;
  return fallback;
}

function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

export async function grantRoleAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('customers.read');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '');
  const expiresAt = String(formData.get('expiresAt') ?? '').trim();

  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return { status: 'error', message: 'Choose an account to grant a role to.' };
  }

  if (!isStaffRole(role)) {
    return { status: 'error', message: 'Choose a valid role.' };
  }

  // An expiry is optional, but if given it must be in the future — a grant that
  // lapses the moment it is made is a mistake, not a policy.
  let expiry: string | null = null;
  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      return { status: 'error', message: 'An expiry must be a future date.' };
    }
    expiry = parsed.toISOString();
  }

  const supabase = await createSupabaseServerClientWritable();
  const { error } = await supabase.rpc('admin_grant_role', {
    p_user_id: userId,
    p_role: role,
    p_expires_at: expiry,
  });

  if (error) {
    logger.error('admin.role_grant_failed', { message: error.message, code: error.code });
    return { status: 'error', message: databaseMessage(error, 'The role could not be granted.') };
  }

  revalidatePath('/admin/staff');
  return { status: 'success', message: `Granted ${role.replace(/_/g, ' ').toLowerCase()}.` };
}

export async function revokeRoleAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('customers.read');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '');

  if (!/^[0-9a-f-]{36}$/i.test(userId) || !isStaffRole(role)) {
    return { status: 'error', message: 'Unknown role assignment.' };
  }

  const supabase = await createSupabaseServerClientWritable();
  const { error } = await supabase.rpc('admin_revoke_role', {
    p_user_id: userId,
    p_role: role,
  });

  if (error) {
    logger.error('admin.role_revoke_failed', { message: error.message, code: error.code });
    return { status: 'error', message: databaseMessage(error, 'The role could not be revoked.') };
  }

  revalidatePath('/admin/staff');
  return { status: 'success', message: 'Role revoked.' };
}

'use server';

import { revalidatePath } from 'next/cache';

import { logger } from '@/lib/logger';
import { isSupabaseConfigured } from '@/lib/env';
import { createSupabaseServerClientWritable } from '@/lib/supabase/server';

/**
 * Marking notifications read.
 *
 * -----------------------------------------------------------------------------
 * WHY A DATABASE FUNCTION AND NOT AN UPDATE
 * -----------------------------------------------------------------------------
 *
 * `notifications_update_own` scopes the row to the caller, and 0024 grants
 * `update` on `is_read` and `read_at` only — so a direct update would already be
 * safe. It is done through `mark_notifications_read` anyway, for one reason: the
 * function stamps `read_at` and derives the user from `auth.uid()` inside the
 * database, so there is no version of this call in which a caller supplies an
 * identity. The grant is the backstop; the function is the intent.
 *
 * -----------------------------------------------------------------------------
 * WHY IT ACCEPTS NO USER ID
 * -----------------------------------------------------------------------------
 *
 * This is a public HTTP endpoint. Anything it accepted would be attacker-chosen.
 * It accepts notification ids, and the database refuses any that do not belong
 * to the caller — so the worst a crafted call can do is mark the caller's own
 * notifications read.
 */

export type MarkReadState = { status: 'idle' | 'success' | 'error'; message?: string };

export async function markNotificationsReadAction(ids: string[] | null): Promise<MarkReadState> {
  if (!isSupabaseConfigured()) {
    return { status: 'error', message: 'Notifications are unavailable right now.' };
  }

  // Bounded, and shape-checked before it reaches the database. `null` means
  // "everything", which the function supports; an array must be uuid-shaped.
  if (ids !== null) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) {
      return { status: 'error', message: 'Nothing to update.' };
    }
    if (!ids.every((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id))) {
      return { status: 'error', message: 'Nothing to update.' };
    }
  }

  try {
    const supabase = await createSupabaseServerClientWritable();
    const { error } = await supabase.rpc('mark_notifications_read', {
      p_ids: ids ?? undefined,
    });

    if (error) {
      logger.warn('notification.mark_read_failed', { code: error.code });
      return { status: 'error', message: 'Those could not be marked as read.' };
    }

    revalidatePath('/account/notifications');
    return { status: 'success' };
  } catch (error) {
    logger.warn('notification.mark_read_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return { status: 'error', message: 'Those could not be marked as read.' };
  }
}

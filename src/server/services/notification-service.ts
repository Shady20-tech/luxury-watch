import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

/**
 * Writing in-app notifications.
 *
 * -----------------------------------------------------------------------------
 * WHY THE SERVICE-ROLE CLIENT IS CORRECT HERE
 * -----------------------------------------------------------------------------
 *
 * `notifications` has no insert policy. That is deliberate: a customer must not
 * be able to write a notification to themselves or to anyone else, and there is
 * no request-shaped proof of "this person is entitled to be told this" that a
 * policy could express. The write happens after a business event the server
 * itself performed, so the server is the authority — and `notify_user` is
 * `SECURITY DEFINER` and granted to `service_role` alone.
 *
 * -----------------------------------------------------------------------------
 * NEVER THROWS
 * -----------------------------------------------------------------------------
 *
 * Every call here runs after the event it describes has committed. A failed
 * notification must not turn a recorded order transition into an error page, for
 * the same reason a failed email must not. Failures are logged with the event
 * name and the recipient's role, never the recipient's address: an inbox
 * notification is about a person, and the log is not the place to name them.
 */

export type NotificationKind = 'order_request' | 'inquiry' | 'appointment' | 'system';

export type NotificationInput = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  /** A site-relative path. The database refuses anything else. */
  linkUrl?: string | null;
  /** Event identity, so a repeated dispatch is one notification. */
  dedupeKey?: string | null;
};

/**
 * Create one notification. Returns whether a row was created.
 *
 * `false` means either a deduplicated repeat (the normal case) or a failure; the
 * two are distinguished in the log, not by the return value, because no caller
 * behaves differently — the notification is a side effect of an event that has
 * already happened.
 */
export async function createNotification(input: NotificationInput): Promise<boolean> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc('notify_user', {
      p_user_id: input.userId,
      p_kind: input.kind,
      p_title: input.title,
      p_body: input.body ?? undefined,
      p_link_url: input.linkUrl ?? undefined,
      p_dedupe_key: input.dedupeKey ?? undefined,
    });

    if (error) {
      logger.warn('notification.create_failed', {
        kind: input.kind,
        code: error.code,
        message: error.message,
      });
      return false;
    }

    if (!data) {
      // The dedupe key collided: this event has already been announced. Logged at
      // info because it is the expected outcome of a retry, not a fault.
      logger.info('notification.deduplicated', { kind: input.kind });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn('notification.create_failed', {
      kind: input.kind,
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return false;
  }
}

/** One notification, as the inbox renders it. */
export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

/**
 * The signed-in customer's notifications.
 *
 * Uses the caller's own client, not the service role: the read policy already
 * scopes by `auth.uid()`, and reading through the customer's session means the
 * policy is what decides, not this query.
 */
export async function fetchNotifications(limit = 50): Promise<NotificationRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, link_url, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn('notification.read_failed', { code: error.code });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind as NotificationKind,
    title: row.title,
    body: row.body,
    linkUrl: row.link_url,
    isRead: row.is_read,
    createdAt: row.created_at,
  }));
}

/** How many unread notifications the caller has. Zero on failure. */
export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  if (error) {
    logger.warn('notification.count_failed', { code: error.code });
    return 0;
  }

  return count ?? 0;
}

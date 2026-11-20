import 'server-only';

import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Read queries for the admin dashboard.
 *
 * -----------------------------------------------------------------------------
 * WHY THE SERVICE-ROLE CLIENT
 * -----------------------------------------------------------------------------
 *
 * These queries read columns the `authenticated` role is not granted:
 * `products.cost_cents` and `order_requests.admin_note` are withheld by column
 * grants (0011, 0014) so a customer can never read them. An admin screen has to
 * show them, so it reads through the service-role client, which bypasses both
 * RLS and the grants.
 *
 * That is safe only because every caller has already passed `requirePermission`.
 * A repository function here must never be called from a route that has not. The
 * guard is not in this file, because a read helper cannot know what a caller is
 * allowed to see — it is in the route and the action.
 *
 * -----------------------------------------------------------------------------
 * WHY THE COUNTS ARE HEAD-ONLY
 * -----------------------------------------------------------------------------
 *
 * A dashboard count is `count: 'exact', head: true`, which asks Postgres for the
 * number and returns no rows. Fetching the rows to count them would move the
 * whole table over the wire to display one integer, and the cost would grow with
 * the catalogue rather than with the work.
 *
 * A failed count reports zero and logs. That is a deliberate trade: the
 * alternative is a dashboard that refuses to render because one of eight figures
 * was unavailable. Zero is visible as zero, and the log says which one failed.
 */

export type DashboardCounts = {
  productsPublished: number;
  productsDraft: number;
  ordersAwaitingReview: number;
  ordersConfirmed: number;
  lowStock: number;
  openInquiries: number;
  pendingQuestions: number;
  pendingAppointments: number;
};

/** Run one head-only count, reporting a failure as zero rather than throwing. */
async function countRows(
  label: string,
  run: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  try {
    const { count, error } = await run();
    if (error) {
      logger.error('admin.count_failed', { label, message: error.message });
      return 0;
    }
    return count ?? 0;
  } catch (error) {
    logger.error('admin.count_failed', {
      label,
      message: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

/**
 * The counts the dashboard shows.
 *
 * Every figure is a real query against a real table. Nothing is estimated,
 * extrapolated or carried over from a previous period, because a dashboard that
 * invents a number is worse than one that omits it: staff act on it.
 */
export async function fetchDashboardCounts(): Promise<DashboardCounts> {
  const supabase = createSupabaseAdminClient();

  const [
    productsPublished,
    productsDraft,
    ordersAwaitingReview,
    ordersConfirmed,
    lowStock,
    openInquiries,
    pendingQuestions,
    pendingAppointments,
  ] = await Promise.all([
    countRows('products_published', () =>
      supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published'),
    ),
    countRows('products_draft', () =>
      supabase.from('products').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    ),
    countRows('orders_awaiting_review', () =>
      supabase
        .from('order_requests')
        .select('*', { count: 'exact', head: true })
        .in('status', ['submitted', 'under_review']),
    ),
    countRows('orders_confirmed', () =>
      supabase
        .from('order_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'confirmed'),
    ),
    // "Low stock" is the table's own definition — at or below the per-product
    // threshold — not a constant chosen here.
    countRows('inventory_low_stock', () =>
      supabase
        .from('inventory')
        .select('*', { count: 'exact', head: true })
        .filter('quantity', 'lte', 'low_stock_threshold'),
    ),
    countRows('inquiries_open', () =>
      supabase
        .from('inquiries')
        .select('*', { count: 'exact', head: true })
        .in('status', ['new', 'in_review']),
    ),
    countRows('questions_unanswered', () =>
      supabase
        .from('product_questions')
        .select('*', { count: 'exact', head: true })
        .is('answer', null),
    ),
    countRows('appointments_requested', () =>
      supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'requested'),
    ),
  ]);

  return {
    productsPublished,
    productsDraft,
    ordersAwaitingReview,
    ordersConfirmed,
    lowStock,
    openInquiries,
    pendingQuestions,
    pendingAppointments,
  };
}

export type ActivityRow = {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  createdAt: string;
};

/** The most recent administrative changes, newest first. Bounded by the view. */
export async function fetchRecentActivity(limit = 15): Promise<ActivityRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('admin_activity_feed')
    .select('id, actor_email, action, entity_type, entity_id, created_at')
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) {
    logger.error('admin.activity_failed', { message: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    actorEmail: row.actor_email,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    createdAt: row.created_at,
  }));
}

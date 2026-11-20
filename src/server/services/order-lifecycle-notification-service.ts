import 'server-only';

import { getServerEnv } from '@/lib/env.server';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email/transport';
import { orderStatusEmail, type LifecycleStatus } from '@/lib/email/lifecycle';
import { createNotification } from '@/server/services/notification-service';

/**
 * Announcing an order status change, after the change has committed.
 *
 * -----------------------------------------------------------------------------
 * THE ORDER OF OPERATIONS IS THE WHOLE DESIGN
 * -----------------------------------------------------------------------------
 *
 * `admin_transition_order` has already committed when this runs: the status is
 * recorded, the stock ledger has moved, and the customer's own account page
 * already shows the new state. Everything here is a notification *about* that
 * fact. So nothing in this module may throw, and nothing may be awaited before
 * the transition is committed — a mail outage must never turn a recorded
 * transition into an error the administrator sees, because they would retry it
 * and the retry would be refused as a no-op.
 *
 * -----------------------------------------------------------------------------
 * NOT EVERY STATUS EMAILS
 * -----------------------------------------------------------------------------
 *
 * `ORDER_STATUS_EMAIL` in `lifecycle.ts` decides which states produce a message.
 * `under_review` is absent: it is an internal working state with no consequence
 * for the customer, and emailing it trains people to ignore the ones that matter.
 * A status that does not email still produces an in-app notification only if it
 * is one of the states a customer would want to see.
 *
 * -----------------------------------------------------------------------------
 * THE IN-APP NOTIFICATION IS THE RELIABLE ONE
 *
 * Email depends on a provider, a verified domain and a customer's spam filter.
 * The in-app row is a database write in the same project, so it is the copy that
 * survives a mail outage. That is why it is written even when the email is
 * skipped for want of configuration — the two channels fail independently.
 */

export type OrderTransitionNotice = {
  /** The customer's auth user id, or null for a guest request. */
  userId: string | null;
  reference: string;
  customerName: string;
  customerEmail: string;
  status: LifecycleStatus;
  itemSummary: string;
  totalCents: number;
  currency: string;
  note: string | null;
  /** The internal order id, for the link the customer follows. */
  orderId: string;
};

/** Whether a status is worth an in-app notification even if it does not email. */
function wantsNotification(status: LifecycleStatus): boolean {
  return status !== 'under_review';
}

/**
 * Announce a committed status change on both channels.
 *
 * Never throws. Returns a small report so a caller *could* act on it, though the
 * only current caller logs it and moves on.
 */
export async function notifyOrderStatusChanged(
  notice: OrderTransitionNotice,
): Promise<{ emailed: boolean; notified: boolean }> {
  const env = getServerEnv();
  let emailed = false;
  let notified = false;

  if (notice.userId && wantsNotification(notice.status)) {
    notified = await createNotification({
      userId: notice.userId,
      kind: 'order_request',
      title: notificationTitle(notice),
      body: notificationBody(notice),
      // The customer's own order page. Site-relative, which is the only shape
      // `notify_user` accepts.
      linkUrl: `/account/orders/${notice.orderId}`,
      // One notification per order per status, so a repeated dispatch collapses.
      dedupeKey: `order:${notice.orderId}:${notice.status}`,
    });
  }

  try {
    const message = orderStatusEmail({
      reference: notice.reference,
      customerName: notice.customerName,
      customerEmail: notice.customerEmail,
      status: notice.status,
      itemSummary: notice.itemSummary,
      totalCents: notice.totalCents,
      currency: notice.currency,
      note: notice.note,
      storeEmail: env.resendAdminEmail ?? env.resendFromEmail ?? null,
    });

    if (message) {
      const result = await sendEmail(message);
      emailed = result.status === 'sent';
    }
  } catch (error) {
    // The template or the transport threw unexpectedly. Logged without the
    // customer's address: the reference is enough to find the order, and a log
    // line is a copy of personal data in a system nobody consented to.
    logger.warn('email.order_status_failed', {
      reference: notice.reference,
      status: notice.status,
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }

  return { emailed, notified };
}

function notificationTitle(notice: OrderTransitionNotice): string {
  switch (notice.status) {
    case 'confirmed':
      return `Order ${notice.reference} accepted`;
    case 'awaiting_payment':
      return `Order ${notice.reference} is ready to settle`;
    case 'paid_offline':
      return `Payment recorded for ${notice.reference}`;
    case 'fulfilled':
      return `Order ${notice.reference} complete`;
    case 'cancelled':
      return `Order ${notice.reference} cancelled`;
    case 'rejected':
      return `Order ${notice.reference} declined`;
    default:
      return `Update on order ${notice.reference}`;
  }
}

function notificationBody(notice: OrderTransitionNotice): string {
  const piece = notice.itemSummary;
  switch (notice.status) {
    case 'confirmed':
      return `${piece} is held for you. We will contact you about payment and delivery.`;
    case 'awaiting_payment':
      return `${piece} is ready. Contact the store to arrange payment; nothing has been paid yet.`;
    case 'paid_offline':
      return `Our team recorded your payment for ${piece}. We will be in touch about collection or delivery.`;
    case 'fulfilled':
      return `${piece} is complete. Thank you.`;
    case 'cancelled':
      return `We closed your request for ${piece}. Any stock held for you has been released.`;
    case 'rejected':
      return `We could not accept your request for ${piece}. Any stock held for you has been released.`;
    default:
      return `There is an update on your request for ${piece}.`;
  }
}

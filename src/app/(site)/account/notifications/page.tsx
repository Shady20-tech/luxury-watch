import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bell } from 'lucide-react';

import { MarkAllReadButton } from '@/components/account/mark-all-read-button';
import { EmptyState } from '@/components/ui/states';
import { noIndexMetadata } from '@/lib/seo/metadata';
import {
  countUnreadNotifications,
  fetchNotifications,
  type NotificationKind,
} from '@/server/services/notification-service';
import { getAccountAccess, loginPathFor } from '@/server/services/authorization-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Notifications');

/**
 * The customer's in-app notifications.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS HERE AND WHAT IS NOT
 * -----------------------------------------------------------------------------
 *
 * These are the notifications written by `notify_user` after a business event
 * the server performed — today, an order changing state. They are the copy that
 * survives a mail outage, which is why they are written even when email is not
 * configured.
 *
 * They are not a message thread: a customer's conversations with the team live at
 * `/account/messages`, and duplicating them here would give two places to read
 * the same reply.
 *
 * -----------------------------------------------------------------------------
 * THE QUERY IS SCOPED BY POLICY, NOT BY THIS PAGE
 * -----------------------------------------------------------------------------
 *
 * `fetchNotifications` runs on the caller's own session client, and
 * `notifications_select_own` restricts rows to `auth.uid()`. This page never
 * passes a user id, so there is no id a crafted request could substitute.
 */
export default async function AccountNotificationsPage() {
  const access = await getAccountAccess();
  if (!access) redirect(loginPathFor('/account/notifications'));

  const [notifications, unread] = await Promise.all([
    fetchNotifications(),
    // Counted, not derived from the list below. The list is capped, so a
    // customer with more than that many unread would see a header and a button
    // label that understated what "Mark all as read" actually does — it marks
    // every row, not only the ones on screen.
    countUnreadNotifications(),
  ]);

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xl">Notifications</h2>
          <p className="text-foreground-muted mt-2 max-w-prose text-sm">
            Updates about your orders and requests appear here.
          </p>
        </div>
        <EmptyState
          icon={Bell}
          title="Nothing to catch up on"
          description="When an order changes state, we will let you know here as well as by email."
          action={
            <Link
              href="/account/orders"
              className="text-accent-text text-sm font-medium underline-offset-4 hover:underline"
            >
              View your orders
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl">Notifications</h2>
          <p className="text-foreground-muted mt-2 max-w-prose text-sm">
            {unread === 0
              ? 'You are all caught up.'
              : `${unread} unread ${unread === 1 ? 'update' : 'updates'}.`}
          </p>
        </div>
        <MarkAllReadButton count={unread} />
      </div>

      <ul className="flex flex-col gap-3">
        {notifications.map((item) => (
          <li key={item.id}>
            <article
              className={
                item.isRead
                  ? 'border-line-200 rounded-sm border p-5'
                  : 'border-line-300 bg-surface-50 rounded-sm border p-5'
              }
            >
              <h3 className="text-base font-semibold">
                {item.isRead ? null : (
                  <>
                    <span className="sr-only">Unread: </span>
                    <span
                      aria-hidden="true"
                      className="bg-gold-700 mr-2 inline-block h-2 w-2 rounded-full align-middle"
                    />
                  </>
                )}
                {item.linkUrl ? (
                  <Link
                    href={item.linkUrl}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </Link>
                ) : (
                  item.title
                )}
              </h3>
              <p className="text-foreground-muted mt-1 text-xs">
                {kindLabel(item.kind)} · {formatDate(item.createdAt)}
              </p>
              {item.body ? (
                <p className="text-foreground-muted mt-3 max-w-prose text-sm">{item.body}</p>
              ) : null}
            </article>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function kindLabel(kind: NotificationKind): string {
  switch (kind) {
    case 'order_request':
      return 'Order';
    case 'inquiry':
      return 'Enquiry';
    case 'appointment':
      return 'Appointment';
    default:
      return 'Update';
  }
}

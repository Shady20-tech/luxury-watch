import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { AdminPageHeader, StatusPill } from '@/components/admin/ui';
import { OrderTransitionPanel } from '@/components/admin/order-transition-panel';
import { formatAdminDateTime } from '@/lib/admin/format';
import { STATUS_DESCRIPTIONS, availableTransitions } from '@/lib/admin/order-lifecycle';
import { formatMoney } from '@/lib/orders/checkout-options';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { transitionOrderAction } from '@/server/actions/admin-actions';
import { getOrder } from '@/server/repositories/admin-order-repository';
import { getAdminIdentity, requirePermission } from '@/server/services/admin-authorization';

/**
 * One order request, with its history and the transitions available from here.
 *
 * The page shows the money exactly as the order recorded it — subtotal, delivery,
 * discount and total as separate committed figures, not a recomputation. The
 * total was computed inside `submit_order_request` from product rows and checked
 * by a constraint; recomputing it here from the items would produce a second
 * number that could disagree with the first.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Order · Administration');

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const identity = await getAdminIdentity();
  if (!identity) return null;

  await requirePermission('orders.read');

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const order = await getOrder(id);
  if (!order) notFound();

  const mayWrite = identity.permissions.has('orders.write');
  const maySettle = identity.permissions.has('orders.settle');
  const transitions = mayWrite ? availableTransitions(order.status, maySettle) : [];

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Order request"
        title={order.reference}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill status={order.status} />
            <span>{STATUS_DESCRIPTIONS[order.status]}</span>
          </span>
        }
        actions={
          <Link
            href="/admin/orders"
            className="text-ink-700 hover:text-ink-900 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            All orders
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          <section
            aria-labelledby="items-heading"
            className="border-line-200 bg-surface-0 overflow-hidden rounded-2xl border"
          >
            <h2
              id="items-heading"
              className="border-line-200 border-b px-5 py-3.5 text-sm font-semibold"
            >
              Items
            </h2>
            <ul className="divide-line-200 divide-y">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{item.productTitle}</p>
                    <p className="text-foreground-muted text-xs">
                      {item.sku} · quantity {item.quantity}
                    </p>
                  </div>
                  <p className="tabular-nums">
                    {item.unitPriceCents === null ? (
                      <span className="text-foreground-muted">Price on enquiry</span>
                    ) : (
                      formatMoney(item.lineTotalCents, order.currency)
                    )}
                  </p>
                </li>
              ))}
            </ul>

            <dl className="border-line-200 space-y-1 border-t px-5 py-3.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-foreground-muted">Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(order.subtotalCents, order.currency)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-foreground-muted">Delivery</dt>
                <dd className="tabular-nums">
                  {formatMoney(order.deliveryFeeCents, order.currency)}
                </dd>
              </div>
              {order.discountCents > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-foreground-muted">
                    Discount{order.discountCode ? ` (${order.discountCode})` : ''}
                  </dt>
                  <dd className="tabular-nums">
                    −{formatMoney(order.discountCents, order.currency)}
                  </dd>
                </div>
              ) : null}
              <div className="border-line-200 mt-2 flex justify-between border-t pt-2 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(order.totalCents, order.currency)}</dd>
              </div>
            </dl>
          </section>

          <section
            aria-labelledby="customer-heading"
            className="border-line-200 bg-surface-0 rounded-2xl border p-5"
          >
            <h2 id="customer-heading" className="mb-3 text-sm font-semibold">
              Customer
            </h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-ink-500 text-xs">Name</dt>
                <dd>{order.customerName}</dd>
              </div>
              <div>
                <dt className="text-ink-500 text-xs">Email</dt>
                <dd className="break-all">{order.customerEmail}</dd>
              </div>
              <div>
                <dt className="text-ink-500 text-xs">Phone</dt>
                <dd>{order.customerPhone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-ink-500 text-xs">Fulfilment</dt>
                <dd>{order.fulfilmentType}</dd>
              </div>
            </dl>

            {order.customerNote ? (
              <div className="border-line-200 mt-3 border-t pt-3">
                <p className="text-ink-500 text-xs">Customer note</p>
                <p className="mt-1 text-sm whitespace-pre-line">{order.customerNote}</p>
              </div>
            ) : null}

            {order.adminNote ? (
              <div className="border-line-200 mt-3 border-t pt-3">
                <p className="text-ink-500 text-xs">Internal note (not shown to the customer)</p>
                <p className="mt-1 text-sm whitespace-pre-line">{order.adminNote}</p>
              </div>
            ) : null}
          </section>

          <section
            aria-labelledby="history-heading"
            className="border-line-200 bg-surface-0 rounded-2xl border p-5"
          >
            <h2 id="history-heading" className="mb-3 text-sm font-semibold">
              History
            </h2>
            <ol className="space-y-3">
              {order.events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="text-ink-900 font-medium">
                    {event.fromStatus ? `${event.fromStatus} → ${event.toStatus}` : event.toStatus}
                  </span>
                  <span className="text-foreground-muted text-xs">
                    {formatAdminDateTime(event.createdAt)}
                  </span>
                  {event.actorLabel ? (
                    <span className="text-foreground-muted w-full text-xs">
                      by {event.actorLabel}
                    </span>
                  ) : null}
                  {event.note ? <p className="text-ink-700 w-full text-sm">{event.note}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-5">
          <section
            aria-labelledby="actions-heading"
            className="border-line-200 bg-surface-0 rounded-2xl border p-5"
          >
            <h2 id="actions-heading" className="mb-3 text-sm font-semibold">
              Actions
            </h2>
            {mayWrite ? (
              <OrderTransitionPanel
                action={transitionOrderAction}
                orderId={order.id}
                transitions={transitions}
              />
            ) : (
              <p className="text-foreground-muted text-sm">
                Your role can view orders but not change them.
              </p>
            )}
          </section>

          <section
            aria-labelledby="settlement-heading"
            className="border-line-200 bg-surface-0 rounded-2xl border p-5"
          >
            <h2 id="settlement-heading" className="mb-2 text-sm font-semibold">
              Settlement
            </h2>
            {order.settledOfflineAt ? (
              <p className="text-sm">
                Payment recorded {formatAdminDateTime(order.settledOfflineAt)}.
              </p>
            ) : (
              <p className="text-foreground-muted text-sm">No offline payment has been recorded.</p>
            )}
          </section>

          <section
            aria-labelledby="meta-heading"
            className="border-line-200 bg-surface-0 rounded-2xl border p-5"
          >
            <h2 id="meta-heading" className="mb-2 text-sm font-semibold">
              Record
            </h2>
            <dl className="space-y-1 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Received</dt>
                <dd className="tabular-nums">{formatAdminDateTime(order.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-500">Updated</dt>
                <dd className="tabular-nums">{formatAdminDateTime(order.updatedAt)}</dd>
              </div>
              {order.paymentMethodCode ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-500">Payment method</dt>
                  <dd>{order.paymentMethodCode}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

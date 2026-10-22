import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/orders/checkout-options';
import { ORDER_COPY } from '@/lib/orders/copy';
import {
  fulfilmentLabel,
  orderStatusDescription,
  orderStatusLabel,
  orderStatusTone,
} from '@/lib/orders/presentation';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAccountOrder } from '@/server/repositories/account-repository';
import { getAccountAccess, loginPathFor } from '@/server/services/authorization-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Order request');

/**
 * One of the customer's own order requests.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS KEYED ON THE ROW ID, NOT THE REFERENCE
 * -----------------------------------------------------------------------------
 *
 * The confirmation page (`/order/[reference]`) is keyed on the reference because
 * a guest has nothing else to identify their request by, and it is protected by
 * an access token. Here the caller is signed in, so the query is scoped to
 * `user_id` and keyed on the row id. An id belonging to another customer matches
 * no row and the page calls `notFound()`.
 *
 * `notFound()` rather than a "forbidden" message is deliberate: confirming that
 * someone else's order id exists is itself a small disclosure, and there is
 * nothing the visitor could do with the distinction.
 *
 * -----------------------------------------------------------------------------
 * THE AMOUNTS ARE READ, NOT RECOMPUTED
 * -----------------------------------------------------------------------------
 *
 * Every figure on this page is the value stored on the order row at submission
 * time. The page multiplies nothing and sums nothing. That is the whole point of
 * storing the line snapshots: a price change in the catalogue must not rewrite
 * the history of an order the customer already placed.
 */
export default async function AccountOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getAccountAccess();
  if (!access) redirect(loginPathFor('/account/orders'));

  const { id } = await params;
  const order = await fetchAccountOrder(access.user.id, id);
  if (!order) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/account/orders"
          className="text-foreground-muted hover:text-foreground focus-visible:outline-gold-700 inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          All orders
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl">Order {order.reference}</h2>
          <Badge variant={badgeVariant(orderStatusTone(order.status))}>
            {orderStatusLabel(order.status)}
          </Badge>
        </div>

        <p className="text-foreground-muted mt-2 text-sm">{orderStatusDescription(order.status)}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-8">
          <section aria-labelledby="items-heading">
            <h3 id="items-heading" className="text-base font-semibold">
              Pieces requested
            </h3>

            <ul className="border-line-300 divide-line-200 mt-4 divide-y rounded-sm border">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0">
                    {item.slug ? (
                      <Link
                        href={`/products/${item.slug}`}
                        className="text-foreground focus-visible:outline-gold-700 font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      // The product may since have been unpublished or removed. The
                      // snapshot keeps the title, so the line is still readable, and
                      // there is simply no link to follow.
                      <span className="text-foreground font-medium">{item.title}</span>
                    )}
                    <p className="text-foreground-muted mt-1 text-sm">Quantity {item.quantity}</p>
                  </div>

                  <div className="shrink-0 text-right text-sm">
                    {item.unitPriceCents === null ? (
                      <p className="text-foreground-muted">Price on request</p>
                    ) : (
                      <>
                        <p className="font-medium">
                          {formatMoney(item.lineTotalCents, order.currency)}
                        </p>
                        {item.quantity > 1 ? (
                          <p className="text-foreground-muted mt-1">
                            {formatMoney(item.unitPriceCents, order.currency)} each
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="details-heading">
            <h3 id="details-heading" className="text-base font-semibold">
              Details
            </h3>

            <dl className="mt-4 flex flex-col gap-3 text-sm">
              <div className="flex gap-2">
                <dt className="text-foreground-muted w-40 shrink-0">Requested</dt>
                <dd className="text-foreground">{formatDate(order.createdAt)}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-foreground-muted w-40 shrink-0">Receiving</dt>
                <dd className="text-foreground">{fulfilmentLabel(order.fulfilmentType)}</dd>
              </div>
              {order.customerNote ? (
                <div className="flex gap-2">
                  <dt className="text-foreground-muted w-40 shrink-0">Your note</dt>
                  <dd className="text-foreground">{order.customerNote}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {order.events.length > 0 ? (
            <section aria-labelledby="timeline-heading">
              <h3 id="timeline-heading" className="text-base font-semibold">
                Progress
              </h3>

              <ol className="border-line-300 mt-4 flex flex-col gap-4 border-l pl-5">
                {order.events.map((event) => (
                  <li key={event.id}>
                    <p className="text-foreground text-sm font-medium">
                      {orderStatusLabel(event.toStatus)}
                    </p>
                    <p className="text-foreground-muted mt-1 text-xs">
                      {formatDate(event.createdAt)}
                    </p>
                    {event.note ? (
                      <p className="text-foreground-muted mt-1 text-sm">{event.note}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        <aside aria-labelledby="summary-heading" className="lg:sticky lg:top-24 lg:self-start">
          <div className="border-line-300 rounded-sm border p-5">
            <h3 id="summary-heading" className="text-base font-semibold">
              Summary
            </h3>

            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-foreground-muted">Subtotal</dt>
                <dd className="font-medium">{formatMoney(order.subtotalCents, order.currency)}</dd>
              </div>

              {order.deliveryFeeCents > 0 ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-foreground-muted">Delivery</dt>
                  <dd className="font-medium">
                    {formatMoney(order.deliveryFeeCents, order.currency)}
                  </dd>
                </div>
              ) : null}

              {order.discountCents > 0 ? (
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-foreground-muted">
                    Discount{order.discountCode ? ` (${order.discountCode})` : ''}
                  </dt>
                  <dd className="text-success-600 font-medium">
                    −{formatMoney(order.discountCents, order.currency)}
                  </dd>
                </div>
              ) : null}

              <div className="border-line-300 mt-2 flex items-baseline justify-between gap-4 border-t pt-3">
                <dt className="font-semibold">Total</dt>
                <dd className="text-lg font-semibold">
                  {formatMoney(order.totalCents, order.currency)}
                </dd>
              </div>
            </dl>

            {order.settledOfflineAt ? (
              <p className="text-foreground-muted mt-4 text-xs">
                Offline payment recorded {formatDate(order.settledOfflineAt)}.
              </p>
            ) : null}

            <div className="border-line-300 mt-5 border-t pt-5">
              <p className="text-ink-500 text-xs">{ORDER_COPY.noPaymentNotice}</p>
            </div>
          </div>

          <p className="text-foreground-muted mt-4 text-sm">
            Questions about this request?{' '}
            <Link href="/contact" className="text-accent-text underline-offset-4 hover:underline">
              Contact us
            </Link>{' '}
            and quote {order.reference}.
          </p>
        </aside>
      </div>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
}

function badgeVariant(tone: 'neutral' | 'positive' | 'negative' | 'pending') {
  switch (tone) {
    case 'positive':
      return 'success' as const;
    case 'negative':
      return 'danger' as const;
    case 'pending':
      return 'accent' as const;
    default:
      return 'neutral' as const;
  }
}

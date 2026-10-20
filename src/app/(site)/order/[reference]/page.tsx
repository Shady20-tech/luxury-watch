import type { Metadata } from 'next';
import Link from 'next/link';
import { FileQuestion } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { ORDER_COPY } from '@/lib/orders/copy';
import { readGuestOrderRequest } from '@/server/repositories/order-repository';

/**
 * A guest's private view of their own order request.
 *
 * -----------------------------------------------------------------------------
 * WHY A LINK AND NOT A LOGIN
 * -----------------------------------------------------------------------------
 *
 * A guest has no account, so there is nothing to sign in to. The reference and
 * the access token in the URL together act as a capability: the reference is
 * sequential and guessable on its own, so it is not enough, and the token is 256
 * bits of entropy that was shown exactly once. `read_order_request` returns
 * `null` unless both match one row, so a wrong token and a missing reference are
 * indistinguishable — the endpoint cannot be used to learn which references
 * exist.
 *
 * `noindex` because the URL contains a credential.
 *
 * -----------------------------------------------------------------------------
 * THE TOKEN IS NEVER LOGGED
 * -----------------------------------------------------------------------------
 *
 * A failure is reported without the token, and the token is not echoed into the
 * page except in the link the customer already has.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Your order request');

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { reference } = await params;
  const { token } = await searchParams;

  // A store that cannot be reached is not the same as a request that does not
  // exist. The two are told apart so a customer with a valid link is not told
  // their request is missing when the database is simply down — and so an outage
  // does not surface as an unhandled 500.
  let request = null;
  let unavailable = false;

  if (token && reference) {
    try {
      request = await readGuestOrderRequest(decodeURIComponent(reference), token);
    } catch {
      unavailable = true;
    }
  }

  if (unavailable) {
    return (
      <main id="main-content" className="container-page py-10 lg:py-14">
        <ErrorState
          title="We could not load your order request"
          description="The request has not been lost. The store is briefly unavailable — please try this link again in a moment."
          action={
            <Button asChild variant="secondary">
              <Link href="/shop">Browse the collection</Link>
            </Button>
          }
        />
      </main>
    );
  }

  if (!request) {
    return (
      <main id="main-content" className="container-page py-10 lg:py-14">
        <EmptyState
          icon={FileQuestion}
          title="We could not find that order request"
          description="The link may be incomplete, or the reference and its private code may not match. If you saved the link from your confirmation, use it exactly as it was given to you."
          action={
            <Button asChild variant="secondary">
              <Link href="/shop">Browse the collection</Link>
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <main id="main-content" className="container-page py-10 lg:py-14">
      <header className="mb-8 max-w-prose">
        <p className="eyebrow">Order request</p>
        <h1 className="mt-3 text-3xl sm:text-4xl">{request.reference}</h1>
        <p className="text-foreground-muted mt-3 text-base">
          This is what we have on record. To change anything, reply to the email address you gave us
          and quote this reference.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex flex-col gap-8">
          <section aria-labelledby="order-items-heading">
            <h2 id="order-items-heading" className="text-lg">
              Requested pieces
            </h2>
            <ul className="divide-line-200 border-line-200 mt-4 divide-y border-t">
              {request.items.map((item, index) => (
                <li key={index} className="flex items-baseline justify-between gap-4 py-3">
                  <span>
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="text-ink-500 block text-xs">
                      {item.sku ? `Ref. ${item.sku} · ` : ''}
                      {item.quantity} ×{' '}
                      {item.unitPriceCents === null
                        ? 'price on request'
                        : formatMinor(item.unitPriceCents, request.currency)}
                    </span>
                  </span>
                  <span className="text-sm font-medium">
                    {item.unitPriceCents === null
                      ? '—'
                      : formatMinor(item.lineTotalCents, request.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="order-details-heading">
            <h2 id="order-details-heading" className="text-lg">
              Your details
            </h2>
            <dl className="text-foreground-muted mt-4 flex flex-col gap-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-40 shrink-0">Name</dt>
                <dd className="text-foreground">{request.customerName}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-40 shrink-0">Email</dt>
                <dd className="text-foreground">{request.customerEmail}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-40 shrink-0">Receiving</dt>
                <dd className="text-foreground">
                  {request.fulfilmentType === 'pickup' ? 'Collect in person' : 'Delivery'}
                  {request.fulfilmentType === 'pickup' && request.pickupLocation
                    ? ` — ${request.pickupLocation}`
                    : ''}
                </dd>
              </div>
              {request.customerNote ? (
                <div className="flex gap-2">
                  <dt className="w-40 shrink-0">Your note</dt>
                  <dd className="text-foreground">{request.customerNote}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        </div>

        <aside
          aria-labelledby="order-summary-heading"
          className="border-line-200 bg-surface-50 sticky top-24 rounded-md border p-5"
        >
          <h2 id="order-summary-heading" className="text-lg">
            Summary
          </h2>

          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-foreground-muted">Subtotal</dt>
              <dd className="font-medium">
                {formatMinor(request.subtotalCents, request.currency)}
              </dd>
            </div>
            {request.deliveryFeeCents > 0 ? (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-foreground-muted">Delivery</dt>
                <dd className="font-medium">
                  {formatMinor(request.deliveryFeeCents, request.currency)}
                </dd>
              </div>
            ) : null}
            <div className="border-line-200 mt-2 flex items-baseline justify-between gap-4 border-t pt-3">
              <dt className="font-semibold">Total</dt>
              <dd className="text-lg font-semibold">
                {formatMinor(request.totalCents, request.currency)}
              </dd>
            </div>
          </dl>

          <p className="text-foreground-muted mt-4 text-sm">
            Status:{' '}
            <strong className="text-foreground font-medium">{statusLabel(request.status)}</strong>
          </p>

          <div className="border-line-200 mt-5 border-t pt-5">
            <p className="text-ink-500 text-xs">{ORDER_COPY.noPaymentNotice}</p>
          </div>
        </aside>
      </div>
    </main>
  );
}

/** Format minor units. The page shows the stored amount; it re-derives nothing. */
function formatMinor(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** A customer-facing name for a status. Never invents a "paid" state. */
function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    submitted: 'Received — awaiting review',
    under_review: 'Being reviewed',
    confirmed: 'Confirmed',
    awaiting_payment: 'Awaiting offline payment',
    paid_offline: 'Payment received offline',
    fulfilled: 'Fulfilled',
    cancelled: 'Cancelled',
    rejected: 'Not accepted',
  };
  return labels[status] ?? status;
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Package, ShieldAlert, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatMoney } from '@/lib/orders/checkout-options';
import { orderStatusLabel, orderStatusTone } from '@/lib/orders/presentation';
import {
  SERVICE_KIND_COPY,
  serviceStatusLabel,
  serviceStatusTone,
} from '@/lib/services/presentation';
import { buildMetadata } from '@/lib/seo/metadata';
import {
  fetchAccountCounts,
  fetchAccountOrders,
  fetchThreadCount,
} from '@/server/repositories/account-repository';
import { fetchAccountServiceRequests } from '@/server/repositories/service-repository';
import { getAccountAccess, loginPathFor } from '@/server/services/authorization-service';

export const metadata: Metadata = buildMetadata({
  title: 'Your account',
  description: 'Your orders, saved pieces and account details.',
  path: '/account',
  robots: { index: false, follow: false },
});

/**
 * The account overview.
 *
 * The layout has already established that someone is signed in, but the guard is
 * repeated here rather than assumed. A page must be safe to render on its own:
 * relying on the layout would mean a future refactor that renders this page
 * elsewhere silently removes the check, and the failure mode is a query with no
 * owner.
 */
export default async function AccountOverviewPage() {
  const access = await getAccountAccess();
  if (!access) redirect(loginPathFor('/account'));

  const [counts, orders, threadCount, serviceRequests] = await Promise.all([
    fetchAccountCounts(access.user.id),
    fetchAccountOrders(access.user.id),
    fetchThreadCount(access.user.id),
    fetchAccountServiceRequests(access.user.id),
  ]);

  // Only the flows the customer has actually used are summarised. Listing four
  // zeroes would be a dashboard of nothing, and the pages behind them carry
  // their own honest empty states.
  const openRequests = serviceRequests.filter(
    (request) => !['completed', 'declined', 'cancelled', 'closed'].includes(request.status),
  );

  const recent = orders.slice(0, 3);

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="recent-orders-heading">
        <div className="flex items-end justify-between gap-4">
          <h2 id="recent-orders-heading" className="text-xl">
            Recent orders
          </h2>
          {orders.length > 0 ? (
            <Link
              href="/account/orders"
              className="text-accent-text text-sm font-medium underline-offset-4 hover:underline"
            >
              View all
            </Link>
          ) : null}
        </div>

        <div className="mt-5">
          {recent.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No order requests yet"
              description="When you send us an order request, it will appear here so you can follow its progress."
              action={
                <Link
                  href="/shop"
                  className="text-accent-text text-sm font-medium underline-offset-4 hover:underline"
                >
                  Browse the collection
                </Link>
              }
            />
          ) : (
            <ul className="border-line-300 divide-line-200 divide-y rounded-sm border">
              {recent.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="hover:bg-surface-50 focus-visible:outline-gold-700 flex flex-wrap items-center justify-between gap-3 p-4 focus-visible:outline-2 focus-visible:-outline-offset-2"
                  >
                    <div className="min-w-0">
                      <p className="text-foreground font-medium">{order.reference}</p>
                      <p className="text-foreground-muted mt-1 text-sm">
                        {order.itemCount} {order.itemCount === 1 ? 'piece' : 'pieces'} ·{' '}
                        {formatMoney(order.totalCents, order.currency)}
                      </p>
                    </div>
                    <Badge variant={badgeVariant(orderStatusTone(order.status))}>
                      {orderStatusLabel(order.status)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="text-xl">
          At a glance
        </h2>

        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <SummaryTile label="Saved pieces" value={counts.wishlist} href="/account/wishlist" />
          <SummaryTile label="Order requests" value={counts.orders} href="/account/orders" />
          <SummaryTile label="Saved addresses" value={counts.addresses} href="/account/addresses" />
          <SummaryTile label="Messages" value={threadCount} href="/account/messages" />
        </dl>
      </section>

      <section aria-labelledby="services-heading">
        <h2 id="services-heading" className="text-xl">
          Service requests
        </h2>

        {openRequests.length === 0 ? (
          <p className="text-foreground-muted mt-4 max-w-prose text-sm">
            Nothing in progress. You can ask us to{' '}
            <Link
              href="/services/sell-trade"
              className="text-accent-text underline-offset-4 hover:underline"
            >
              buy a piece
            </Link>
            ,{' '}
            <Link
              href="/services/sourcing"
              className="text-accent-text underline-offset-4 hover:underline"
            >
              source one
            </Link>{' '}
            or{' '}
            <Link
              href="/services/repair-restoration"
              className="text-accent-text underline-offset-4 hover:underline"
            >
              service one
            </Link>{' '}
            at any time.
          </p>
        ) : (
          <ul className="border-line-300 divide-line-200 mt-5 divide-y rounded-sm border">
            {openRequests.slice(0, 3).map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="text-foreground font-medium break-words">{request.title}</p>
                  <p className="text-foreground-muted mt-1 text-sm">
                    {serviceKindLabel(request.kind)}
                    {request.reference ? ` · ${request.reference}` : null}
                  </p>
                </div>
                <Badge variant={badgeVariant(serviceStatusTone(request.status))}>
                  {serviceStatusLabel(request.status)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="security-heading">
        <h2 id="security-heading" className="text-xl">
          Account security
        </h2>
        <div className="border-line-300 mt-5 flex items-start gap-3 rounded-sm border p-5">
          {access.user.emailConfirmed ? (
            <ShieldCheck aria-hidden="true" className="text-success-600 mt-0.5 h-5 w-5 shrink-0" />
          ) : (
            <ShieldAlert aria-hidden="true" className="text-gold-700 mt-0.5 h-5 w-5 shrink-0" />
          )}
          <div className="text-sm">
            <p className="font-medium">
              {access.user.emailConfirmed
                ? 'Your email address is confirmed'
                : 'Your email address is not confirmed'}
            </p>
            <p className="text-foreground-muted mt-1">
              {access.user.emailConfirmed
                ? 'Manage your password and review your details in '
                : 'Confirm it to make full use of your account. Resend the link in '}
              <Link
                href="/account/settings"
                className="text-accent-text underline-offset-4 hover:underline"
              >
                Settings
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * A tile in the summary list.
 *
 * The `<a>` is wrapped in the `<dt>`/`<dd>` pair rather than wrapping them: a
 * `<dl>` may only contain `<dt>`, `<dd>` and `<div>` children, so an anchor
 * cannot be the row itself. The link sits on the term, and the definition
 * describes it.
 */
function SummaryTile({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <div className="border-line-300 hover:border-gold-300 rounded-sm border p-5">
      <dt className="text-foreground-muted text-sm">
        <Link
          href={href}
          className="focus-visible:outline-gold-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {label}
        </Link>
      </dt>
      <dd className="mt-2 text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function serviceKindLabel(kind: keyof typeof SERVICE_KIND_COPY): string {
  return SERVICE_KIND_COPY[kind].title;
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

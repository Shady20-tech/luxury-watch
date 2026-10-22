import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Package, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatMoney } from '@/lib/orders/checkout-options';
import { orderStatusLabel, orderStatusTone } from '@/lib/orders/presentation';
import { buildMetadata } from '@/lib/seo/metadata';
import { fetchAccountCounts, fetchAccountOrders } from '@/server/repositories/account-repository';
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

  const [counts, orders] = await Promise.all([
    fetchAccountCounts(access.user.id),
    fetchAccountOrders(access.user.id),
  ]);

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
        </dl>
      </section>

      <section aria-labelledby="security-heading">
        <h2 id="security-heading" className="text-xl">
          Account security
        </h2>
        <div className="border-line-300 mt-5 flex items-start gap-3 rounded-sm border p-5">
          <ShieldCheck aria-hidden="true" className="text-success-600 mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Your email address is confirmed</p>
            <p className="text-foreground-muted mt-1">
              Manage your password and review your details in{' '}
              <Link
                href="/account/security"
                className="text-accent-text underline-offset-4 hover:underline"
              >
                Security
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

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Package } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatMoney } from '@/lib/orders/checkout-options';
import { orderStatusLabel, orderStatusTone } from '@/lib/orders/presentation';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAccountOrders } from '@/server/repositories/account-repository';
import { getAccountAccess, loginPathFor } from '@/server/services/authorization-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Your orders');

/** Every order request the customer has sent. */
export default async function AccountOrdersPage() {
  const access = await getAccountAccess();
  if (!access) redirect(loginPathFor('/account/orders'));

  const orders = await fetchAccountOrders(access.user.id);

  if (orders.length === 0) {
    return (
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
    );
  }

  return (
    <div>
      <h2 className="text-xl">Order requests</h2>
      <p className="text-foreground-muted mt-2 text-sm">
        {orders.length} {orders.length === 1 ? 'request' : 'requests'}.
      </p>

      <ul className="border-line-300 divide-line-200 mt-6 divide-y rounded-sm border">
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              href={`/account/orders/${order.id}`}
              className="hover:bg-surface-50 focus-visible:outline-gold-700 flex flex-wrap items-center justify-between gap-3 p-4 focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <div className="min-w-0">
                <p className="text-foreground font-medium">{order.reference}</p>
                <p className="text-foreground-muted mt-1 text-sm">
                  {formatDate(order.createdAt)} · {order.itemCount}{' '}
                  {order.itemCount === 1 ? 'piece' : 'pieces'}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-4">
                <span className="text-sm font-medium">
                  {formatMoney(order.totalCents, order.currency)}
                </span>
                <Badge variant={badgeVariant(orderStatusTone(order.status))}>
                  {orderStatusLabel(order.status)}
                </Badge>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value));
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

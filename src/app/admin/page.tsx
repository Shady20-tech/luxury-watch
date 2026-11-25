import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Boxes, CalendarClock, MessageSquare, Package, Tag } from 'lucide-react';

import { landingSectionFor, maySeeOverview } from '@/lib/admin/sections';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { formatAdminDateTime } from '@/lib/admin/format';
import {
  fetchDashboardCounts,
  fetchRecentActivity,
} from '@/server/repositories/admin-dashboard-repository';
import { getAdminIdentity, type Permission } from '@/server/services/admin-authorization';

/**
 * The administration dashboard.
 *
 * -----------------------------------------------------------------------------
 * NO FABRICATED FIGURES
 * -----------------------------------------------------------------------------
 *
 * Every number here comes from `fetchDashboardCounts`, which runs one head-only
 * count per figure. Nothing is estimated, sampled, or carried over from a
 * previous visit. A dashboard that invents a number is worse than one that omits
 * it, because staff make decisions from it — "12 orders awaiting review" is a
 * claim about the business, and it has to be true.
 *
 * Where a count is not meaningful (a person without `orders.read` has no business
 * knowing how many orders are waiting) the tile is not rendered at all, rather
 * than rendered as a zero that reads like "none".
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Administration');

/** A single figure, with the label and the page that explains it. */
function MetricTile({
  href,
  label,
  value,
  detail,
  icon: Icon,
}: {
  href: string;
  label: string;
  value: number;
  detail?: string;
  icon: typeof Package;
}) {
  return (
    <li>
      <Link
        href={href}
        className="border-line-300 bg-surface-0 hover:border-line-400 focus-visible:outline-gold-700 flex h-full flex-col rounded-md border p-4 focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        <span className="text-ink-500 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
          {label}
        </span>
        <span className="text-ink-900 mt-3 text-2xl font-semibold tabular-nums">{value}</span>
        {detail ? <span className="text-foreground-muted mt-1 text-xs">{detail}</span> : null}
      </Link>
    </li>
  );
}

export default async function AdminDashboardPage() {
  const identity = await getAdminIdentity();
  // The layout has already refused a non-staff caller, so this is only a
  // type-narrowing guard. It renders nothing rather than throwing.
  if (!identity) return null;

  // The overview reports across every section, so it belongs to an administrator.
  // A single-section manager is sent to their own section instead of being shown
  // figures from areas they do not run.
  if (!maySeeOverview(identity.isAdmin)) {
    redirect(landingSectionFor(identity.permissions));
  }

  const may = (permission: Permission) => identity.permissions.has(permission);

  const showCatalogue = may('catalog.read');
  const showOrders = may('orders.read');
  const showInquiries = may('inquiries.read');
  const showInventory = may('inventory.read');
  const showAudit = may('audit.read');

  // Only ask the database for the figures this caller may see. The counts run
  // through the service-role client, so an unasked question is one the caller
  // has no permission to have answered; running all eight regardless would
  // compute and discard six of them on every visit.
  const [counts, activity] = await Promise.all([
    fetchDashboardCounts({
      catalogue: showCatalogue,
      orders: showOrders,
      inquiries: showInquiries,
      inventory: showInventory,
    }),
    showAudit ? fetchRecentActivity(15) : Promise.resolve([]),
  ]);

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-2xl">Dashboard</h1>
        <p className="text-foreground-muted mt-2 text-sm">
          {identity.roles.length > 0
            ? `Signed in as ${identity.roles.join(', ').toLowerCase().replace(/_/g, ' ')}.`
            : 'Signed in.'}{' '}
          Figures below are counted live.
        </p>
      </header>

      <section aria-labelledby="work-heading">
        <h2 id="work-heading" className="text-lg">
          Waiting on you
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {showOrders ? (
            <MetricTile
              href="/admin/orders?status=submitted,under_review"
              label="Orders to review"
              value={counts.ordersAwaitingReview}
              detail="Submitted or under review"
              icon={Package}
            />
          ) : null}
          {showOrders ? (
            <MetricTile
              href="/admin/orders?status=confirmed"
              label="Confirmed orders"
              value={counts.ordersConfirmed}
              detail="Awaiting offline settlement or fulfilment"
              icon={Package}
            />
          ) : null}
          {showInquiries ? (
            <MetricTile
              href="/admin/inquiries"
              label="Open enquiries"
              value={counts.openInquiries}
              detail="New or in review"
              icon={MessageSquare}
            />
          ) : null}
          {showInquiries ? (
            <MetricTile
              href="/admin/inquiries"
              label="Unanswered questions"
              value={counts.pendingQuestions}
              detail="Product questions with no answer"
              icon={MessageSquare}
            />
          ) : null}
          {showInquiries ? (
            <MetricTile
              href="/admin/appointments"
              label="Appointment requests"
              value={counts.pendingAppointments}
              detail="Not yet confirmed"
              icon={CalendarClock}
            />
          ) : null}
          {showInventory ? (
            <MetricTile
              href="/admin/inventory?filter=low"
              label="Low stock"
              value={counts.lowStock}
              detail="At or below the product threshold"
              icon={Boxes}
            />
          ) : null}
        </ul>
      </section>

      <section aria-labelledby="catalogue-heading" className="mt-10">
        <h2 id="catalogue-heading" className="text-lg">
          Catalogue
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {showCatalogue ? (
            <MetricTile
              href="/admin/products?status=published"
              label="Published"
              value={counts.productsPublished}
              detail="Visible in the storefront"
              icon={Tag}
            />
          ) : null}
          {showCatalogue ? (
            <MetricTile
              href="/admin/products?status=draft"
              label="Drafts"
              value={counts.productsDraft}
              detail="Not visible to customers"
              icon={Tag}
            />
          ) : null}
        </ul>
      </section>

      {may('audit.read') ? (
        <section aria-labelledby="activity-heading" className="mt-10">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="activity-heading" className="text-lg">
              Recent activity
            </h2>
            <Link
              href="/admin/audit"
              className="text-accent-text inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            >
              Full trail
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>

          {activity.length === 0 ? (
            <p className="text-foreground-muted border-line-200 mt-4 rounded-md border border-dashed p-6 text-sm">
              No administrative changes have been recorded yet. Actions taken in this area appear
              here.
            </p>
          ) : (
            <ul className="border-line-300 divide-line-200 mt-4 divide-y rounded-md border">
              {activity.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3 text-sm"
                >
                  <span className="text-ink-900 font-medium">{row.action}</span>
                  <span className="text-foreground-muted">{row.entityType}</span>
                  <span className="text-foreground-muted ml-auto text-xs tabular-nums">
                    {formatAdminDateTime(row.createdAt)}
                  </span>
                  <span className="text-ink-500 w-full text-xs">
                    {row.actorEmail ?? 'Unknown actor'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

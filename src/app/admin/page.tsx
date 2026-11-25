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

/**
 * A single figure, with the label and the page that explains it.
 *
 * The card is a link to the filtered list the figure came from, so a number is
 * always one click from the rows behind it. `tone` only changes the icon chip:
 * a queue that is waiting on somebody is worth distinguishing from a catalogue
 * total at a glance, and colour is the cheapest way to do that without adding a
 * badge that would need its own legend.
 */
function MetricTile({
  href,
  label,
  value,
  detail,
  icon: Icon,
  tone = 'neutral',
}: {
  href: string;
  label: string;
  value: number;
  detail?: string;
  icon: typeof Package;
  tone?: 'neutral' | 'attention';
}) {
  return (
    <li>
      <Link
        href={href}
        className="group bg-surface-0 border-line-200 hover:border-line-300 focus-visible:outline-gold-700 flex h-full flex-col rounded-xl border p-5 shadow-[0_1px_2px_rgb(17_17_17/0.04)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgb(17_17_17/0.05),0_12px_24px_-12px_rgb(17_17_17/0.12)] focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="text-ink-500 text-[0.7rem] font-semibold tracking-[0.12em] uppercase">
            {label}
          </span>
          <span
            aria-hidden="true"
            className={
              tone === 'attention'
                ? 'bg-gold-100 text-gold-900 grid h-8 w-8 shrink-0 place-items-center rounded-lg'
                : 'bg-surface-100 text-ink-700 grid h-8 w-8 shrink-0 place-items-center rounded-lg'
            }
          >
            <Icon className="h-4 w-4" />
          </span>
        </span>
        <span className="text-ink-950 mt-4 text-3xl font-semibold tabular-nums">{value}</span>
        {detail ? <span className="text-ink-500 mt-1.5 text-xs">{detail}</span> : null}
      </Link>
    </li>
  );
}

/** A section wrapper, so every block on the dashboard has the same rhythm. */
function Panel({
  heading,
  id,
  action,
  children,
}: {
  heading: string;
  id: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="mt-8 first:mt-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-ink-950 text-base font-semibold tracking-tight">
          {heading}
        </h2>
        {action}
      </div>
      {children}
    </section>
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
      <header className="mb-7">
        <h1 className="text-ink-950 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
          Dashboard
        </h1>
        <p className="text-ink-500 mt-2 text-sm">
          {identity.roles.length > 0
            ? `Signed in as ${identity.roles.join(', ').toLowerCase().replace(/_/g, ' ')}.`
            : 'Signed in.'}{' '}
          Every figure below is counted live.
        </p>
      </header>

      <Panel heading="Waiting on you" id="work-heading">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {showOrders ? (
            <MetricTile
              href="/admin/orders?status=submitted,under_review"
              label="Orders to review"
              tone="attention"
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
              tone="attention"
              value={counts.openInquiries}
              detail="New or in review"
              icon={MessageSquare}
            />
          ) : null}
          {showInquiries ? (
            <MetricTile
              href="/admin/inquiries"
              label="Unanswered questions"
              tone="attention"
              value={counts.pendingQuestions}
              detail="Product questions with no answer"
              icon={MessageSquare}
            />
          ) : null}
          {showInquiries ? (
            <MetricTile
              href="/admin/appointments"
              label="Appointment requests"
              tone="attention"
              value={counts.pendingAppointments}
              detail="Not yet confirmed"
              icon={CalendarClock}
            />
          ) : null}
          {showInventory ? (
            <MetricTile
              href="/admin/inventory?filter=low"
              label="Low stock"
              tone="attention"
              value={counts.lowStock}
              detail="At or below the product threshold"
              icon={Boxes}
            />
          ) : null}
        </ul>
      </Panel>

      <Panel heading="Catalogue" id="catalogue-heading">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
      </Panel>

      {may('audit.read') ? (
        <Panel
          heading="Recent activity"
          id="activity-heading"
          action={
            <Link
              href="/admin/audit"
              className="text-accent-text inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
            >
              Full trail
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {activity.length === 0 ? (
            <p className="text-ink-500 border-line-200 bg-surface-0 rounded-xl border border-dashed p-6 text-sm">
              No administrative changes have been recorded yet. Actions taken in this area appear
              here.
            </p>
          ) : (
            <ul className="bg-surface-0 border-line-200 divide-line-200 divide-y overflow-hidden rounded-xl border shadow-[0_1px_2px_rgb(17_17_17/0.04)]">
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
        </Panel>
      ) : null}
    </div>
  );
}

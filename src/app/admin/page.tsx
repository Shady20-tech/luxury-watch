import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  MessageSquare,
  Package,
  Tag,
} from 'lucide-react';

import { landingSectionFor, maySeeOverview } from '@/lib/admin/sections';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { formatAdminDateTime } from '@/lib/admin/format';
import { cn } from '@/lib/utils';
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
 *
 * -----------------------------------------------------------------------------
 * WHY THE VALUE IS THE LARGEST THING IN THE CARD
 * -----------------------------------------------------------------------------
 *
 * A dashboard is read by glancing, not by reading. The label says what the
 * number is; the number is what the person came for. So the figure is set at
 * display size in tabular figures, the label sits above it in small caps, and
 * the explanatory line sits below in the muted tone. Anything that competes
 * with the figure — a coloured panel, a border, a second badge — is left out.
 *
 * The attention state is a warm ground and a gold rule at the top edge rather
 * than a red one: these are queues to work through, not errors. Red is reserved
 * for a failure, and a dashboard where every tile is red teaches staff to
 * ignore red.
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
  const attention = tone === 'attention';

  return (
    <li>
      <Link
        href={href}
        className={cn(
          'group focus-visible:outline-gold-700 relative flex h-full flex-col overflow-hidden rounded-xl border p-5 transition-[border-color,box-shadow,transform] duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2',
          'hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgb(17_17_17/0.05),0_16px_32px_-16px_rgb(17_17_17/0.16)]',
          attention
            ? 'border-gold-300/60 bg-gold-100/50 hover:border-gold-300'
            : 'border-line-200 bg-surface-0 hover:border-line-300',
        )}
      >
        {/* The top rule is the non-colour half of the attention signal: it
            survives a monochrome screen and a colour-vision difference, and it
            is the same device the sidebar uses for its active row. */}
        {attention ? (
          <span aria-hidden="true" className="bg-gold-500 absolute inset-x-0 top-0 h-[2px]" />
        ) : null}

        <span className="flex items-start justify-between gap-3">
          <span
            className={cn(
              'text-[0.7rem] font-semibold tracking-[0.12em] uppercase',
              attention ? 'text-gold-900' : 'text-ink-500',
            )}
          >
            {label}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors',
              attention
                ? 'bg-gold-300/40 text-gold-900 group-hover:bg-gold-300/60'
                : 'bg-surface-100 text-ink-700 group-hover:bg-surface-200',
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        </span>

        <span className="text-ink-950 mt-3 font-display text-[2.25rem] leading-none font-semibold tabular-nums">
          {value.toLocaleString('en-GB')}
        </span>

        {detail ? (
          <span className="text-ink-500 mt-2 flex items-center gap-1 text-xs">
            {detail}
            <ArrowUpRight
              aria-hidden="true"
              className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100"
            />
          </span>
        ) : null}
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

  // The single figure most worth acting on, if the caller may see any of them.
  // The order is the order the work arrives in: an order request is a customer
  // waiting for an answer, an enquiry is one considering it, an appointment is a
  // visit to prepare for. A catalogue count is never "urgent" in that sense, so
  // it is not a candidate.
  const attention: Array<{
    count: number;
    label: string;
    href: string;
    detail: string;
  }> = [
    showOrders
      ? {
          count: counts.ordersAwaitingReview,
          label: 'order requests awaiting review',
          href: '/admin/orders?status=submitted,under_review',
          detail: 'Submitted or under review',
        }
      : null,
    showInquiries
      ? {
          count: counts.openInquiries,
          label: 'open enquiries',
          href: '/admin/inquiries',
          detail: 'New or in review',
        }
      : null,
    showInquiries
      ? {
          count: counts.pendingQuestions,
          label: 'unanswered product questions',
          href: '/admin/inquiries',
          detail: 'Waiting on a reply',
        }
      : null,
    showInquiries
      ? {
          count: counts.pendingAppointments,
          label: 'appointment requests to confirm',
          href: '/admin/appointments',
          detail: 'Not yet confirmed',
        }
      : null,
    showInventory
      ? {
          count: counts.lowStock,
          label: 'pieces at or below their stock threshold',
          href: '/admin/inventory?filter=low',
          detail: 'Restock or delist',
        }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const headline = attention.find((entry) => entry.count > 0) ?? null;
  const totalWaiting = attention.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div>
      {/* The console opens on a dark band, the way every storefront template
          does. It is the one place in the admin where the site's own register —
          near-black, serif title, gold rule — is used, and it exists so that
          signing in feels like arriving somewhere rather than like opening a
          spreadsheet. The figures stay on the light ground below, where they are
          easier to read than light-on-black at small sizes. */}
      <header className="bg-night-900 relative isolate mb-8 overflow-hidden rounded-2xl px-6 py-7 sm:px-8 sm:py-8">
        {/* A soft gold corner glow, the same device `PageHero` uses. Purely
            decorative, and kept to the right so it never sits under the text. */}
        <div
          aria-hidden="true"
          className="from-gold-700/30 pointer-events-none absolute inset-0 bg-gradient-to-bl via-transparent to-transparent"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className="text-gold-300 flex items-center gap-3 text-[0.7rem] font-semibold tracking-[0.22em] uppercase">
              <span aria-hidden="true" className="bg-gold-300/40 h-px w-6" />
              Boutique console
            </p>
            <h1 className="text-on-night font-display mt-3 text-3xl tracking-tight sm:text-4xl">
              Good to see you
            </h1>
            <p className="text-on-night-muted mt-2 max-w-xl text-sm">
              {identity.roles.length > 0
                ? `Signed in as ${identity.roles.join(', ').toLowerCase().replace(/_/g, ' ')}. `
                : ''}
              Every figure below is counted live from the database.
            </p>
          </div>

          {/* The summary line is a sentence, not a badge, because it has to hold
              both states: work waiting, and a genuinely clear desk. "All clear"
              is a real answer and should not look like a missing figure. */}
          <p
            className={cn(
              'flex items-center gap-2 rounded-full border px-4 py-2 text-sm',
              totalWaiting > 0
                ? 'border-gold-300/40 bg-gold-300/10 text-gold-300'
                : 'border-white/15 bg-white/5 text-on-night-muted',
            )}
          >
            {totalWaiting > 0 ? (
              <>
                <span aria-hidden="true" className="bg-gold-300 h-1.5 w-1.5 rounded-full" />
                <span className="tabular-nums">{totalWaiting.toLocaleString('en-GB')}</span>
                <span>waiting on you</span>
              </>
            ) : (
              <>
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                <span>Nothing is waiting</span>
              </>
            )}
          </p>
        </div>
      </header>

      {/* The featured row: the one queue that most needs a person today, beside
          the catalogue's health. A dashboard that lists nine equal tiles makes
          the reader find the urgent one; this puts it first, at double width. */}
      {headline || showCatalogue ? (
        <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          {headline ? (
            <Link
              href={headline.href}
              className="group border-line-200 bg-surface-0 hover:border-gold-300 focus-visible:outline-gold-700 relative flex flex-col justify-between overflow-hidden rounded-2xl border p-6 transition-[border-color,box-shadow] focus-visible:outline-2 focus-visible:-outline-offset-2 hover:shadow-[0_2px_4px_rgb(17_17_17/0.05),0_20px_40px_-20px_rgb(17_17_17/0.18)] sm:flex-row sm:items-center sm:gap-8"
            >
              <div className="min-w-0">
                <p className="text-gold-900 text-[0.7rem] font-semibold tracking-[0.14em] uppercase">
                  Needs a decision
                </p>
                <p className="text-ink-950 font-display mt-2 text-2xl leading-snug tracking-tight sm:text-[1.75rem]">
                  <span className="tabular-nums">{headline.count.toLocaleString('en-GB')}</span>{' '}
                  {headline.label}
                </p>
                <p className="text-ink-500 mt-2 text-sm">{headline.detail}</p>
              </div>
              <span className="text-gold-900 bg-gold-100 group-hover:bg-gold-300/50 mt-4 inline-flex shrink-0 items-center gap-2 self-start rounded-full px-4 py-2.5 text-sm font-medium transition-colors sm:mt-0 sm:self-auto">
                Open the queue
                <ArrowRight
                  aria-hidden="true"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          ) : null}

          {showCatalogue ? (
            <Link
              href="/admin/products?status=published"
              className="group border-line-200 bg-surface-warm/60 hover:border-line-300 focus-visible:outline-gold-700 flex flex-col justify-between rounded-2xl border p-6 transition-[border-color] focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-ink-500 text-[0.7rem] font-semibold tracking-[0.14em] uppercase">
                  Catalogue
                </p>
                <Tag aria-hidden="true" className="text-ink-300 h-4 w-4 shrink-0" />
              </div>
              <div className="mt-4">
                <p className="text-ink-950 font-display text-3xl leading-none font-semibold tabular-nums">
                  {counts.productsPublished.toLocaleString('en-GB')}
                </p>
                <p className="text-ink-500 mt-2 text-sm">
                  pieces live in the storefront
                  {counts.productsDraft > 0 ? (
                    <>
                      {' · '}
                      <span className="tabular-nums">
                        {counts.productsDraft.toLocaleString('en-GB')}
                      </span>{' '}
                      in draft
                    </>
                  ) : null}
                </p>
              </div>
            </Link>
          ) : null}
        </div>
      ) : null}

      <Panel heading="Waiting on you" id="work-heading">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
            <ul className="bg-surface-0 border-line-200 divide-line-200 divide-y overflow-hidden rounded-xl border">
              {activity.map((row) => (
                <li
                  key={row.id}
                  className="hover:bg-surface-50 flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3 text-sm transition-colors"
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

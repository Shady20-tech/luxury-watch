import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  MessageSquare,
  Package,
  ScrollText,
  Sparkles,
  Tag,
  TrendingUp,
} from 'lucide-react';

import { BarList, StackedBar } from '@/components/admin/charts';
import { formatAdminDateTime } from '@/lib/admin/format';
import { landingSectionFor, maySeeOverview } from '@/lib/admin/sections';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { cn } from '@/lib/utils';
import {
  fetchCatalogueByBrand,
  fetchDashboardCounts,
  fetchInventoryByState,
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
 * Every number here comes from the database. Nothing is estimated, sampled, or
 * carried over from a previous visit. A dashboard that invents a number is worse
 * than one that omits it, because staff make decisions from it — "12 orders
 * awaiting review" is a claim about the business, and it has to be true.
 *
 * Where a count is not meaningful (a person without `orders.read` has no business
 * knowing how many orders are waiting) the tile is not rendered at all, rather
 * than rendered as a zero that reads like "none". The same rule governs the two
 * charts: `fetchCatalogueByBrand` and `fetchInventoryByState` are asked only when
 * the caller holds the permission their figures belong to.
 *
 * -----------------------------------------------------------------------------
 * WHY THE PAGE IS LAID OUT AS CARDS ON A PALE GROUND
 * -----------------------------------------------------------------------------
 *
 * The console is read by glancing: what needs me, what is the catalogue doing,
 * what changed. That is a scanning task, and scanning is helped by a small number
 * of clearly separated blocks with one idea each — not by a dense list of
 * everything the database contains. So the page is a light canvas, white rounded
 * cards, and a consistent gutter between them, with the figures set large enough
 * to read without leaning in.
 *
 * The accent stays gold rather than the blue such dashboards often use: this is
 * the same product as the storefront, and a second accent colour would make the
 * console look like a different application bolted on. The reference layout is
 * matched in structure — sidebar, card grid, a chart row, an activity column —
 * which is what makes a console feel modern; the palette is the brand's.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Administration');

/** A soft tinted chip for a card's icon, keyed to the card's meaning. */
const TONES = {
  gold: 'bg-gold-100 text-gold-900',
  warm: 'bg-surface-warm text-ink-700',
  cool: 'bg-surface-100 text-ink-700',
  attention: 'bg-gold-300/35 text-gold-900',
} as const;

type Tone = keyof typeof TONES;

/**
 * A single figure, with the label and the page that explains it.
 *
 * The whole card is the link to the filtered list the figure came from, so a
 * number is always one click from the rows behind it. `tone` distinguishes a
 * queue that is waiting on somebody from a catalogue total; it changes only the
 * icon chip, because a card whose entire ground is tinted competes with the
 * figure the reader came for.
 */
function StatCard({
  href,
  label,
  value,
  detail,
  icon: Icon,
  tone = 'cool',
}: {
  href: string;
  label: string;
  value: number;
  detail?: string;
  icon: typeof Package;
  tone?: Tone;
}) {
  const attention = tone === 'attention';

  return (
    <li>
      <Link
        href={href}
        className={cn(
          'group focus-visible:outline-gold-700 bg-surface-0 relative flex h-full flex-col rounded-2xl border p-5 transition-[border-color,box-shadow,transform] duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2',
          'hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgb(17_17_17/0.04),0_16px_32px_-18px_rgb(17_17_17/0.18)]',
          attention
            ? 'border-gold-300/70 hover:border-gold-300'
            : 'border-line-200 hover:border-line-300',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', TONES[tone])}
          >
            <Icon aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" />
          </span>
          <ArrowUpRight
            aria-hidden="true"
            className="text-ink-500 group-hover:text-ink-900 h-4 w-4 shrink-0 transition-colors"
          />
        </div>

        <span className="text-ink-950 font-display mt-4 text-[2rem] leading-none font-semibold tabular-nums">
          {value.toLocaleString('en-GB')}
        </span>
        <span className="text-ink-900 mt-2 text-sm font-medium">{label}</span>
        {detail ? <span className="text-ink-500 mt-1 text-xs">{detail}</span> : null}
      </Link>
    </li>
  );
}

/** A titled card, so every block on the page shares one frame. */
function Card({
  title,
  description,
  action,
  id,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'border-line-200 bg-surface-0 flex flex-col rounded-2xl border p-5 sm:p-6',
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="text-ink-950 text-sm font-semibold tracking-tight">
            {title}
          </h2>
          {description ? <p className="text-ink-500 mt-1 text-xs">{description}</p> : null}
        </div>
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
  const [counts, activity, brandShare, stockState] = await Promise.all([
    fetchDashboardCounts({
      catalogue: showCatalogue,
      orders: showOrders,
      inquiries: showInquiries,
      inventory: showInventory,
    }),
    showAudit ? fetchRecentActivity(8) : Promise.resolve([]),
    showCatalogue ? fetchCatalogueByBrand(7) : Promise.resolve([]),
    showInventory ? fetchInventoryByState() : Promise.resolve([]),
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

  const stockTotal = stockState.reduce((sum, bucket) => sum + bucket.count, 0);
  const catalogueTotal = brandShare.reduce((sum, brand) => sum + brand.productCount, 0);
  const publishedShare = brandShare.reduce((sum, brand) => sum + brand.publishedCount, 0);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------------
          The welcome card.

          A pale gold wash rather than the near-black band this used to open
          on: the console is a working surface, and a dark slab above a light
          page made every visit start by adjusting to the contrast. The wash is
          the brand's accent at low strength, so the page still opens with a
          deliberate colour rather than a blank header.
         ------------------------------------------------------------------ */}
      <header className="border-line-200 from-gold-100/70 via-surface-0 to-surface-0 relative isolate overflow-hidden rounded-2xl border bg-gradient-to-br p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-gold-900 flex items-center gap-2 text-[0.7rem] font-semibold tracking-[0.18em] uppercase">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
              Boutique console
            </p>
            <h1 className="text-ink-950 font-display mt-2.5 text-3xl tracking-tight sm:text-[2rem]">
              Good to see you
            </h1>
            <p className="text-ink-500 mt-2 max-w-xl text-sm">
              {identity.roles.length > 0
                ? `Signed in as ${identity.roles.join(', ').toLowerCase().replace(/_/g, ' ')}. `
                : ''}
              Every figure below is counted live from the database.
            </p>
          </div>

          {/* The summary is a sentence, not a badge, because it has to hold both
              states: work waiting, and a genuinely clear desk. "Nothing waiting"
              is a real answer and should not look like a missing figure. */}
          <p
            className={cn(
              'flex items-center gap-2 rounded-full border px-4 py-2 text-sm',
              totalWaiting > 0
                ? 'border-gold-300 bg-gold-100/80 text-gold-900'
                : 'border-line-200 bg-surface-0 text-ink-500',
            )}
          >
            {totalWaiting > 0 ? (
              <>
                <span aria-hidden="true" className="bg-gold-700 h-1.5 w-1.5 rounded-full" />
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

      {/* The headline queue, at full width and above the grid. A dashboard that
          lists nine equal tiles makes the reader find the urgent one; this puts
          it first. */}
      {headline ? (
        <Link
          href={headline.href}
          className="group border-gold-300 bg-gold-100/60 hover:bg-gold-100 focus-visible:outline-gold-700 relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border p-5 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 sm:flex-row sm:items-center sm:p-6"
        >
          <div className="flex items-start gap-4">
            <span className="bg-gold-700 text-surface-0 grid h-10 w-10 shrink-0 place-items-center rounded-full">
              <CircleAlert aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-gold-900 text-[0.7rem] font-semibold tracking-[0.14em] uppercase">
                Needs a decision
              </p>
              <p className="text-ink-950 mt-1.5 text-lg leading-snug font-semibold tracking-tight sm:text-xl">
                <span className="tabular-nums">{headline.count.toLocaleString('en-GB')}</span>{' '}
                {headline.label}
              </p>
              <p className="text-ink-500 mt-1 text-sm">{headline.detail}</p>
            </div>
          </div>
          <span className="text-gold-900 bg-surface-0 group-hover:bg-gold-300/40 inline-flex shrink-0 items-center gap-2 self-start rounded-full px-4 py-2.5 text-sm font-medium shadow-sm transition-colors sm:self-auto">
            Open the queue
            <ArrowRight
              aria-hidden="true"
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            />
          </span>
        </Link>
      ) : null}

      {/* The figures, four to a row on a wide screen. */}
      <section aria-labelledby="work-heading">
        <h2 id="work-heading" className="sr-only">
          Waiting on you
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {showOrders ? (
            <StatCard
              href="/admin/orders?status=submitted,under_review"
              label="Orders to review"
              tone="attention"
              value={counts.ordersAwaitingReview}
              detail="Submitted or under review"
              icon={Package}
            />
          ) : null}
          {showOrders ? (
            <StatCard
              href="/admin/orders?status=confirmed"
              label="Confirmed orders"
              value={counts.ordersConfirmed}
              detail="Awaiting offline settlement"
              icon={TrendingUp}
            />
          ) : null}
          {showInquiries ? (
            <StatCard
              href="/admin/inquiries"
              label="Open enquiries"
              tone="attention"
              value={counts.openInquiries}
              detail="New or in review"
              icon={MessageSquare}
            />
          ) : null}
          {showInquiries ? (
            <StatCard
              href="/admin/appointments"
              label="Appointments"
              tone="attention"
              value={counts.pendingAppointments}
              detail="Requests to confirm"
              icon={CalendarClock}
            />
          ) : null}
          {showInventory ? (
            <StatCard
              href="/admin/inventory?filter=low"
              label="Low stock"
              tone="attention"
              value={counts.lowStock}
              detail="At or below the threshold"
              icon={Boxes}
            />
          ) : null}
          {showCatalogue ? (
            <StatCard
              href="/admin/products?status=published"
              label="Published pieces"
              tone="gold"
              value={counts.productsPublished}
              detail="Live in the storefront"
              icon={Tag}
            />
          ) : null}
          {showCatalogue ? (
            <StatCard
              href="/admin/products?status=draft"
              label="Drafts"
              value={counts.productsDraft}
              detail="Not visible to customers"
              icon={Tag}
            />
          ) : null}
          {showInquiries ? (
            <StatCard
              href="/admin/inquiries"
              label="Unanswered questions"
              tone="attention"
              value={counts.pendingQuestions}
              detail="Product questions with no answer"
              icon={MessageSquare}
            />
          ) : null}
        </ul>
      </section>

      {/* The chart row. Both charts are drawn from aggregate functions in the
          database, so neither reads the catalogue to draw a bar. */}
      {showCatalogue || showInventory ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {showCatalogue ? (
            <Card
              id="brand-chart-heading"
              title="Catalogue by brand"
              description={
                catalogueTotal > 0
                  ? `${publishedShare.toLocaleString('en-GB')} published of ${catalogueTotal.toLocaleString('en-GB')} in the top brands`
                  : undefined
              }
              action={
                <Link
                  href="/admin/products"
                  className="text-accent-text inline-flex shrink-0 items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
                >
                  All products
                  <ArrowRight aria-hidden="true" className="h-3 w-3" />
                </Link>
              }
            >
              <BarList
                secondaryLabel="Published"
                emptyLabel="No products are attached to a brand yet."
                data={brandShare.map((brand) => ({
                  label: brand.brandName,
                  value: brand.productCount,
                  secondary: brand.publishedCount,
                }))}
              />
            </Card>
          ) : null}

          {showInventory ? (
            <Card
              id="stock-chart-heading"
              title="Stock health"
              description={
                stockTotal > 0
                  ? `${stockTotal.toLocaleString('en-GB')} stock rows across the catalogue`
                  : undefined
              }
              action={
                <Link
                  href="/admin/inventory"
                  className="text-accent-text inline-flex shrink-0 items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
                >
                  Inventory
                  <ArrowRight aria-hidden="true" className="h-3 w-3" />
                </Link>
              }
            >
              <StackedBar
                emptyLabel="No stock has been recorded yet."
                segments={stockState.map((bucket) => ({
                  label:
                    bucket.state === 'healthy'
                      ? 'Healthy'
                      : bucket.state === 'low'
                        ? 'Low'
                        : 'Out of stock',
                  value: bucket.count,
                  className:
                    bucket.state === 'healthy'
                      ? 'bg-gold-500'
                      : bucket.state === 'low'
                        ? 'bg-gold-300'
                        : 'bg-ink-300',
                }))}
              />
              {stockTotal > 0 ? (
                <p className="text-ink-500 mt-4 text-xs">
                  A piece counts as low when its available quantity is at or below its own
                  threshold, so a one-of-a-kind watch is low the moment it is listed. That is the
                  table&rsquo;s definition, not this page&rsquo;s.
                </p>
              ) : null}
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* The activity column sits beside the shortcuts, so the page ends on
          "what changed" and "where to go next" rather than a wall of tiles. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {showAudit ? (
          <Card
            id="activity-heading"
            title="Recent activity"
            description="Administrative changes, newest first"
            action={
              <Link
                href="/admin/audit"
                className="text-accent-text inline-flex shrink-0 items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
              >
                Full trail
                <ArrowRight aria-hidden="true" className="h-3 w-3" />
              </Link>
            }
          >
            {activity.length === 0 ? (
              <div className="border-line-200 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
                <ScrollText aria-hidden="true" className="text-ink-500 h-6 w-6" />
                <p className="text-ink-500 mt-3 max-w-xs text-sm">
                  No administrative changes have been recorded yet. Actions taken in this area
                  appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-line-200 divide-y">
                {activity.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2.5 text-sm first:pt-0 last:pb-0"
                  >
                    <span className="text-ink-900 font-medium">{row.action}</span>
                    <span className="text-ink-500 text-xs">{row.entityType}</span>
                    <span className="text-ink-500 ml-auto text-xs tabular-nums">
                      {formatAdminDateTime(row.createdAt)}
                    </span>
                    <span className="text-ink-500 w-full text-xs">
                      {row.actorEmail ?? 'Unknown actor'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}

        <Card
          id="shortcuts-heading"
          title="Shortcuts"
          description="Jump to the work you do most"
          className={showAudit ? undefined : 'lg:col-span-2'}
        >
          <ul className="grid gap-2">
            {showOrders ? (
              <Shortcut href="/admin/orders" label="Order requests" icon={Package} />
            ) : null}
            {showCatalogue ? <Shortcut href="/admin/products" label="Products" icon={Tag} /> : null}
            {showInventory ? (
              <Shortcut href="/admin/inventory" label="Inventory" icon={Boxes} />
            ) : null}
            {showInquiries ? (
              <Shortcut href="/admin/inquiries" label="Enquiries" icon={MessageSquare} />
            ) : null}
            {showAudit ? (
              <Shortcut href="/admin/audit" label="Audit trail" icon={ScrollText} />
            ) : null}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/** One row in the shortcuts card. */
function Shortcut({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Package;
}) {
  return (
    <li>
      <Link
        href={href}
        className="group border-line-200 hover:border-line-300 hover:bg-surface-50 focus-visible:outline-gold-700 flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        <span className="bg-surface-100 text-ink-700 grid h-8 w-8 shrink-0 place-items-center rounded-full">
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="text-ink-900 min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
        <ArrowRight
          aria-hidden="true"
          className="text-ink-500 group-hover:text-ink-900 h-4 w-4 shrink-0 transition-colors"
        />
      </Link>
    </li>
  );
}

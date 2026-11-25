import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/utils';

/**
 * Small presentation pieces shared by the admin pages.
 *
 * These exist so the admin screens look like one application. They are
 * deliberately plain: an internal tool is read for its data, and decoration that
 * competes with the numbers makes it harder to use. Every one of them is a
 * Server Component — none holds state.
 */

export function AdminPageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Small uppercase label above the title, matching the dashboard's welcome card. */
  eyebrow?: string;
}) {
  return (
    <header className="border-line-200 bg-surface-0 mb-5 flex flex-wrap items-start justify-between gap-4 rounded-2xl border p-5 sm:p-6">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-gold-900 text-[0.7rem] font-semibold tracking-[0.18em] uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className={cn('text-2xl', eyebrow && 'mt-1.5')}>{title}</h1>
        {description ? (
          <p className="text-foreground-muted mt-2 max-w-2xl text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * A titled panel, the frame every block on an admin page shares.
 *
 * The dashboard and the sub-pages must look like one application, so the card
 * lives here rather than being re-declared per page: white ground, hairline
 * border, a generous radius and one gutter. `flush` removes the body padding for
 * a table, which brings its own cell padding and should meet the card's edge.
 */
export function AdminCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  flush = false,
  as: Tag = 'section',
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
  as?: 'section' | 'div';
}) {
  return (
    <Tag
      className={cn(
        'border-line-200 bg-surface-0 flex flex-col overflow-hidden rounded-2xl border',
        !flush && 'p-5 sm:p-6',
        className,
      )}
    >
      {title ? (
        <div className={cn('flex items-start justify-between gap-3', !flush && 'mb-4')}>
          <div className="min-w-0">
            <h2 className="text-ink-950 text-sm font-semibold tracking-tight">{title}</h2>
            {description ? <p className="text-ink-500 mt-1 text-xs">{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={cn(bodyClassName)}>{children}</div>
    </Tag>
  );
}

/** A table that scrolls inside its own box rather than pushing the page wide. */
export function AdminTable({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="border-line-200 bg-surface-0 overflow-x-auto rounded-2xl border">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function AdminTh({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'border-line-200 bg-surface-50 text-ink-500 border-b px-4 py-3 text-left text-[0.7rem] font-semibold tracking-[0.12em] uppercase',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function AdminTd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={cn('border-line-200 border-b px-4 py-3 align-top last:border-0', className)}>
      {children}
    </td>
  );
}

/**
 * A single figure on a sub-page, mirroring the dashboard's stat cards.
 *
 * The figure is set large and the label small, because a reader scanning a
 * section wants the number first. When `href` is given the whole card is the
 * link to the filtered list the number came from, so no count is a dead end.
 */
export function AdminStatCard({
  label,
  value,
  detail,
  icon: Icon,
  href,
}: {
  label: string;
  value: number | string;
  detail?: string;
  icon?: LucideIcon;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        {Icon ? (
          <span className="bg-surface-100 text-ink-700 grid h-10 w-10 shrink-0 place-items-center rounded-full">
            <Icon aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" />
          </span>
        ) : null}
        {href ? (
          <ArrowUpRight
            aria-hidden="true"
            className="text-ink-500 group-hover:text-ink-900 ml-auto h-4 w-4 shrink-0 transition-colors"
          />
        ) : null}
      </div>
      <span className="text-ink-950 font-display mt-4 text-[2rem] leading-none font-semibold tabular-nums">
        {typeof value === 'number' ? value.toLocaleString('en-GB') : value}
      </span>
      <span className="text-ink-900 mt-2 text-sm font-medium">{label}</span>
      {detail ? <span className="text-ink-500 mt-1 text-xs">{detail}</span> : null}
    </>
  );

  const shell =
    'group border-line-200 bg-surface-0 flex h-full flex-col rounded-2xl border p-5 transition-[border-color,box-shadow,transform] duration-200';

  return href ? (
    <Link
      href={href}
      className={cn(
        shell,
        'hover:border-line-300 focus-visible:outline-gold-700 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgb(17_17_17/0.04),0_16px_32px_-18px_rgb(17_17_17/0.18)] focus-visible:outline-2 focus-visible:-outline-offset-2',
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/** The row of stat cards above a list, on the same gutter as the dashboard. */
export function AdminStatGrid({ children }: { children: ReactNode }) {
  return <ul className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</ul>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-line-300 bg-surface-50/60 rounded-2xl border border-dashed p-10 text-center">
      <p className="text-ink-900 font-medium">{title}</p>
      {children ? <div className="text-foreground-muted mt-2 text-sm">{children}</div> : null}
    </div>
  );
}

/**
 * Pagination that works without JavaScript.
 *
 * The links are real anchors carrying the current filters, so the browser
 * navigates and the server renders the next page. A client-side "load more" would
 * need state, and state that is not in the URL cannot be shared, bookmarked or
 * survive a reload — the same rule the storefront catalogue follows.
 */
export function AdminPagination({
  page,
  pageCount,
  buildHref,
}: {
  page: number;
  pageCount: number;
  buildHref: (page: number) => string;
}) {
  if (pageCount <= 1) return null;

  const hasPrev = page > 1;
  const hasNext = page < pageCount;

  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-4 text-sm">
      <p className="text-foreground-muted tabular-nums">
        Page {page} of {pageCount}
      </p>
      <div className="flex items-center gap-2">
        {hasPrev ? (
          <a
            href={buildHref(page - 1)}
            rel="prev"
            className="border-line-300 hover:border-line-400 focus-visible:outline-gold-700 rounded-sm border px-3 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Previous
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="border-line-200 text-ink-300 rounded-sm border px-3 py-1.5"
          >
            Previous
          </span>
        )}
        {hasNext ? (
          <a
            href={buildHref(page + 1)}
            rel="next"
            className="border-line-300 hover:border-line-400 focus-visible:outline-gold-700 rounded-sm border px-3 py-1.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Next
          </a>
        ) : (
          <span
            aria-disabled="true"
            className="border-line-200 text-ink-300 rounded-sm border px-3 py-1.5"
          >
            Next
          </span>
        )}
      </div>
    </nav>
  );
}

/** A status pill. Colour is never the only signal: the word is always present. */
export function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'published' ||
    status === 'confirmed' ||
    status === 'paid_offline' ||
    status === 'fulfilled'
      ? 'border-success-600/30 bg-success-600/10 text-success-600'
      : status === 'archived' || status === 'cancelled' || status === 'rejected'
        ? 'border-line-300 bg-surface-100 text-ink-700'
        : 'border-gold-300 bg-gold-100 text-gold-900';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-xs border px-2 py-0.5 text-xs font-semibold tracking-wide uppercase',
        tone,
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

import type { ReactNode } from 'react';

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
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl">{title}</h1>
        {description ? (
          <p className="text-foreground-muted mt-2 max-w-2xl text-sm">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A table that scrolls inside its own box rather than pushing the page wide. */
export function AdminTable({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="border-line-300 bg-surface-0 overflow-x-auto rounded-md border">
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
        'border-line-300 text-ink-500 border-b px-3 py-2.5 text-left text-xs font-semibold tracking-wide uppercase',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function AdminTd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={cn('border-line-200 border-b px-3 py-2.5 align-top', className)}>{children}</td>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border-line-300 rounded-md border border-dashed p-8 text-center">
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

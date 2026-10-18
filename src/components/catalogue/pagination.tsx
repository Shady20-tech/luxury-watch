import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { paginationWindow } from '@/lib/catalogue/assemble';
import { buildCatalogueHref, type CatalogueParams } from '@/lib/catalogue/params';
import { cn } from '@/lib/utils';

/**
 * Pagination.
 *
 * Real links, so each page is crawlable and each has its own URL. The current
 * page is marked `aria-current="page"` and is not a link, because a link to the
 * page you are already on is a dead control.
 *
 * `rel="prev"` / `rel="next"` are set on the two arrows: Google no longer uses
 * them as a ranking signal, but they remain a useful hint and cost nothing.
 */
export function Pagination({
  params,
  page,
  pageCount,
}: {
  params: CatalogueParams;
  page: number;
  pageCount: number;
}) {
  // A single page of results needs no controls at all.
  if (pageCount <= 1) return null;

  const window = paginationWindow(page, pageCount);

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1">
      <PageArrow
        params={params}
        to={page - 1}
        disabled={page <= 1}
        rel="prev"
        label="Previous page"
        icon={<ChevronLeft aria-hidden="true" className="h-4 w-4" />}
      />

      {window.map((entry, index) =>
        entry === 'gap' ? (
          // The gap is decorative; a screen reader gets the page list without a
          // meaningless "…" announcement.
          <span
            key={`gap-${index}`}
            aria-hidden="true"
            className="text-ink-500 px-1 text-sm tabular-nums"
          >
            …
          </span>
        ) : entry === page ? (
          <span
            key={entry}
            aria-current="page"
            className="bg-ink-900 text-surface-0 inline-flex h-9 min-w-9 items-center justify-center rounded-sm px-3 text-sm font-semibold tabular-nums"
          >
            {entry}
            <span className="sr-only"> (current page)</span>
          </span>
        ) : (
          <Link
            key={entry}
            href={buildCatalogueHref(params, { page: entry })}
            scroll={false}
            aria-label={`Page ${entry}`}
            className="border-line-300 text-foreground hover:border-ink-900 inline-flex h-9 min-w-9 items-center justify-center rounded-sm border px-3 text-sm tabular-nums"
          >
            {entry}
          </Link>
        ),
      )}

      <PageArrow
        params={params}
        to={page + 1}
        disabled={page >= pageCount}
        rel="next"
        label="Next page"
        icon={<ChevronRight aria-hidden="true" className="h-4 w-4" />}
      />
    </nav>
  );
}

/**
 * A previous/next arrow.
 *
 * At the ends of the range the arrow is rendered as a `span`, not a disabled
 * link: an anchor with no destination is not something a screen reader or a
 * crawler should follow, and `aria-disabled` on an anchor that still navigates
 * is worse than not rendering one.
 */
function PageArrow({
  params,
  to,
  disabled,
  label,
  icon,
  rel,
}: {
  params: CatalogueParams;
  to: number;
  disabled: boolean;
  label: string;
  icon: ReactNode;
  rel: 'prev' | 'next';
}) {
  const className = cn(
    'inline-flex h-9 w-9 items-center justify-center rounded-sm border',
    disabled
      ? 'border-line-200 text-ink-300 cursor-not-allowed'
      : 'border-line-300 text-foreground hover:border-ink-900',
  );

  if (disabled) {
    return (
      <span aria-disabled="true" className={className}>
        {icon}
        <span className="sr-only">{label} — unavailable</span>
      </span>
    );
  }

  return (
    <Link
      href={buildCatalogueHref(params, { page: to })}
      rel={rel}
      scroll={false}
      className={className}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Link>
  );
}

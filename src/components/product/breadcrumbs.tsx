import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Breadcrumb trail.
 *
 * A `<nav>` with an ordered list, because the trail is a navigation aid and the
 * order is meaningful. The last entry is the current page: it is rendered as
 * text with `aria-current="page"` rather than a link to itself, which is both
 * the documented pattern and one fewer link for a keyboard user to step through.
 *
 * The same entries feed `BreadcrumbList` JSON-LD through `productBreadcrumbs`,
 * so the visible trail and the structured data cannot disagree.
 */
export function Breadcrumbs({
  entries,
  className,
}: {
  entries: { name: string; path: string }[];
  className?: string;
}) {
  if (entries.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('text-sm', className)}>
      <ol className="text-foreground-muted flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {entries.map((entry, index) => {
          const isLast = index === entries.length - 1;
          return (
            <li key={`${entry.path}-${index}`} className="flex items-center gap-x-1.5">
              {isLast ? (
                <span aria-current="page" className="text-foreground font-medium">
                  {entry.name}
                </span>
              ) : (
                <>
                  <Link
                    href={entry.path}
                    className="hover:text-accent-text underline-offset-4 hover:underline"
                  >
                    {entry.name}
                  </Link>
                  <ChevronRight aria-hidden="true" className="text-ink-300 h-3.5 w-3.5 shrink-0" />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

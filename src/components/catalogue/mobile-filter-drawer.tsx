'use client';

import { SlidersHorizontal } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { Drawer, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

/**
 * The mobile filter drawer.
 *
 * A Client Component only because Radix Dialog is one. The panel content is
 * passed in as `children` from the server, so the filter links themselves stay
 * server-rendered and this file never touches the catalogue data.
 *
 * The drawer is controlled, and it closes whenever the listing URL changes.
 * That matters: tapping a filter navigates while the panel is open, and an
 * uncontrolled drawer would leave the visitor looking at a stale overlay with
 * the new results hidden behind it — the filter would appear to do nothing.
 * Watching the URL rather than a click handler also covers the back button and
 * a middle-click, neither of which fires one.
 */
export function MobileFilterDrawer({
  activeCount,
  children,
}: {
  activeCount: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const query = useSearchParams().toString();

  useEffect(() => {
    setOpen(false);
  }, [pathname, query]);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        className={cn(
          'border-line-300 bg-surface-0 hover:border-ink-900 inline-flex h-11 items-center gap-2 rounded-sm border px-4 text-sm font-medium lg:hidden',
        )}
      >
        <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />
        <span>Filter</span>
        {activeCount > 0 ? (
          <span className="bg-ink-900 text-surface-0 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs tabular-nums">
            {activeCount}
            <span className="sr-only"> active filters</span>
          </span>
        ) : null}
      </DrawerTrigger>

      <DrawerContent side="left" title="Filter" className="overflow-y-auto">
        <div className="px-5 py-6">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

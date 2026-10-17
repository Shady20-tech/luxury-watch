import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Skeleton placeholder.
 *
 * `aria-hidden` by default and paired with a real `aria-busy` region at the
 * call site: a screen reader should hear "loading", not a list of empty boxes.
 * The pulse is disabled automatically by the global reduced-motion rule.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('bg-surface-200 animate-pulse rounded-sm', className)}
      {...props}
    />
  );
}

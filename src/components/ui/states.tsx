import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Empty state.
 *
 * `role="status"` is used rather than `role="alert"`: an empty list is not an
 * emergency, and announcing it assertively interrupts the user. The heading is
 * real text so the region has an accessible name.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'border-line-200 bg-surface-50 flex flex-col items-center rounded-md border border-dashed px-6 py-14 text-center',
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="text-ink-300 mb-4 h-8 w-8" /> : null}
      <h3 className="text-lg">{title}</h3>
      {description ? (
        <p className="text-foreground-muted mt-2 max-w-sm text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

/**
 * Error state.
 *
 * `role="alert"` here, because a failed load is worth interrupting for. The
 * message is a plain sentence — never a stack trace or a raw error object,
 * which could leak internals to a visitor.
 */
export function ErrorState({
  title = 'Something went wrong',
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('border-danger-600/30 bg-danger-600/5 rounded-md border px-6 py-10', className)}
    >
      <h3 className="text-lg">{title}</h3>
      {description ? <p className="text-foreground-muted mt-2 text-sm">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

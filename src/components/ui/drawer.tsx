'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Drawer — a side sheet built on Radix Dialog.
 *
 * Radix is used rather than a hand-rolled panel because the hard parts of a
 * modal are exactly the parts that are usually got wrong: focus is moved in and
 * trapped, `Escape` closes, focus returns to the trigger, background content is
 * `aria-hidden`, and the page scroll is locked. Reimplementing that is how
 * "keyboard accessible" claims turn out to be false.
 *
 * `side` positions the panel; the animation is a short translate and is
 * suppressed by the global `prefers-reduced-motion` rule.
 */
const sideClasses: Record<'left' | 'right', string> = {
  right: 'inset-y-0 right-0 h-full w-full max-w-sm border-l',
  left: 'inset-y-0 left-0 h-full w-full max-w-sm border-r',
};

export function Drawer(props: ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />;
}

export function DrawerTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger {...props} />;
}

export function DrawerClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close {...props} />;
}

export function DrawerContent({
  side = 'right',
  title,
  description,
  children,
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  side?: 'left' | 'right';
  /** Required: a dialog with no accessible name is unusable by screen readers. */
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="bg-scrim fixed inset-0 z-50 backdrop-blur-[1px]" />
      <DialogPrimitive.Content
        className={cn(
          'glass-panel-strong fixed z-50 flex flex-col shadow-lg',
          'border-line-200',
          sideClasses[side],
          className,
        )}
        {...props}
      >
        <div className="border-line-200 flex items-center justify-between border-b px-5 py-4">
          <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close
            className="text-ink-700 hover:bg-surface-100 -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-sm"
            aria-label="Close"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </DialogPrimitive.Close>
        </div>
        {description ? (
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
        ) : null}
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

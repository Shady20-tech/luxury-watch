'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Dropdown menu, built on Radix.
 *
 * Used for the account menu and the header overflow menu. Radix handles arrow
 * key navigation, type-ahead, `Escape`, focus return and `role="menu"`
 * semantics, all of which are easy to get subtly wrong by hand.
 */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

export function DropdownMenuContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'glass-panel-strong border-line-200 z-50 min-w-56 rounded-md border p-1.5 shadow-md',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        'text-foreground flex cursor-pointer items-center gap-2.5 rounded-sm px-3 py-2 text-sm outline-none',
        // `ink-400` is deliberate here: WCAG exempts disabled controls from the
        // contrast minimum, and the lower contrast is what signals the disabled
        // state. Every other muted label uses `ink-500`, which meets AA.
        'data-[highlighted]:bg-surface-100 data-[disabled]:text-ink-400 data-[disabled]:pointer-events-none',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn(
        'text-ink-500 px-3 py-2 text-xs font-semibold tracking-wide uppercase',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('bg-line-200 -mx-1.5 my-1 h-px', className)}
      {...props}
    />
  );
}

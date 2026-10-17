import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Button.
 *
 * Variants are deliberately restrained: a luxury retail page has one primary
 * action and a lot of quiet ones. `primary` is the gold fill, `secondary` is a
 * hairline outline, `ghost` is for toolbars and menus, `link` is for inline
 * navigation. There is no gradient and no large radius.
 *
 * Accessibility is built in rather than left to call sites:
 *  - `disabled` sets `aria-disabled` and removes the element from the tab order
 *    when rendered as a link, so a "disabled link" is not silently clickable.
 *  - `loading` sets `aria-busy` and blocks interaction while keeping the label
 *    in place, so the button does not jump or lose its accessible name.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 ' +
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-gold-700 text-surface-0 hover:bg-ink-900 active:bg-ink-950',
        secondary:
          'border border-line-300 bg-surface-0 text-foreground hover:border-ink-900 hover:bg-surface-50',
        ghost: 'text-foreground hover:bg-surface-100 active:bg-surface-200',
        link: 'text-accent-text underline-offset-4 hover:underline',
        danger: 'bg-danger-600 text-surface-0 hover:bg-ink-900',
      },
      size: {
        sm: 'h-9 rounded-sm px-3 text-sm',
        md: 'h-11 rounded-sm px-5 text-sm',
        lg: 'h-13 rounded-sm px-7 text-base',
        // Icon-only buttons are square and never rely on padding for width.
        icon: 'h-11 w-11 rounded-sm',
        'icon-sm': 'h-9 w-9 rounded-sm',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render as the child element (for example a Next.js `Link`). */
    asChild?: boolean;
    /** Shows a busy state without changing the accessible name. */
    loading?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  loading = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  const isDisabled = Boolean(disabled) || loading;

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, block }), className)}
      // `type` only matters on a real button; passing it to Slot would leak it
      // onto whatever element the caller renders.
      {...(asChild ? {} : { type: type ?? 'button' })}
      {...(isDisabled ? { 'aria-disabled': true } : {})}
      {...(loading ? { 'aria-busy': true } : {})}
      {...props}
    >
      {children}
    </Comp>
  );
}

export { buttonVariants };

import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Badge / tag. Used for product condition ("Unworn"), status ("Sold out") and
 * small counts. Text is always 12px and the fill is quiet, so a grid of cards
 * does not turn into a wall of coloured pills.
 */
const badgeVariants = cva(
  'inline-flex items-center rounded-xs border px-2 py-0.5 text-xs font-semibold tracking-wide uppercase',
  {
    variants: {
      variant: {
        neutral: 'border-line-300 bg-surface-100 text-ink-700',
        accent: 'border-gold-300 bg-gold-100 text-gold-900',
        // `sold-out` and `danger` use ink/red on a light fill: the saturated
        // colour as *text* would fail contrast at this size.
        soldOut: 'border-line-300 bg-ink-900 text-surface-0',
        success: 'border-success-600/30 bg-success-600/10 text-success-600',
        danger: 'border-danger-600/30 bg-danger-600/10 text-danger-600',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };

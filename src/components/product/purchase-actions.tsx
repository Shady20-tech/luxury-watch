import { Heart, ShoppingBag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Purchase controls.
 *
 * The cart and the customer account are built in later phases (7 and 9), so
 * there is no cart to add to and no account to save into. The two ways of
 * handling that are both wrong:
 *
 *  - A live-looking button that silently discards the click is a lie, and it is
 *    the kind that gets noticed immediately.
 *  - Omitting the controls entirely hides a real, planned part of the experience
 *    and makes the page look unlike the reference for no stated reason.
 *
 * So both controls are rendered as genuinely disabled buttons, with
 * `aria-disabled`, a `title`, and a visible note naming the phase. A visitor
 * learns what will exist and when, and nothing pretends to work.
 *
 * The enquiry form below is the real path for this phase, and it is what the
 * price block points at.
 */
export function PurchaseActions({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap gap-3">
        <Button disabled aria-disabled="true" title="Available once the cart is built (Phase 7)">
          <ShoppingBag aria-hidden="true" className="mr-2 h-4 w-4" />
          Add to cart
        </Button>
        <Button
          variant="secondary"
          disabled
          aria-disabled="true"
          title="Available once the customer account area is built (Phase 9)"
        >
          <Heart aria-hidden="true" className="mr-2 h-4 w-4" />
          Add to wishlist
        </Button>
      </div>
      <p className="text-ink-500 text-xs">
        The cart and saved wishlist are added in a later phase. Until then, send an enquiry below
        and we will hold a piece for you.
      </p>
    </div>
  );
}

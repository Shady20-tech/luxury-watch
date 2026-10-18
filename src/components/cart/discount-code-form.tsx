'use client';

import { CheckCircle2, Tag, XCircle } from 'lucide-react';
import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { announceCountsChanged } from '@/lib/cart/events';
import { IDLE_MUTATION } from '@/lib/cart/validation';
import type { CartDiscount } from '@/lib/cart/types';
import { applyDiscountCode } from '@/server/actions/cart-actions';

/**
 * Promotional code form.
 *
 * -----------------------------------------------------------------------------
 * THE BROWSER NEVER SENDS AN AMOUNT
 * -----------------------------------------------------------------------------
 *
 * The form has one field: the code. There is no hidden "discount amount" and no
 * computed total in the payload, because there is nothing the browser could
 * compute that the server would believe. The action passes the code to
 * `cart_pricing`, which decides eligibility and the amount from the database,
 * and stores the code only when it was recognised. A customer cannot make a
 * discount larger by editing the request, and cannot make an ineligible code
 * apply by claiming a subtotal.
 *
 * -----------------------------------------------------------------------------
 * A REJECTED CODE IS NOT AN ERROR
 * -----------------------------------------------------------------------------
 *
 * A code that has expired or does not meet its minimum is a normal outcome, not
 * a fault, so the reason is shown as a quiet, persistent message rather than a
 * red failure. The database's own reason is displayed verbatim — it is written
 * as a sentence for the customer, and paraphrasing it here would be a second
 * copy to keep in step.
 */
function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" loading={pending}>
      {label}
    </Button>
  );
}

export function DiscountCodeForm({
  applied,
  className,
}: {
  /** The code currently applied, if any. Renders the applied state. */
  applied: CartDiscount | null;
  className?: string;
}) {
  const [state, formAction] = useActionState(applyDiscountCode, IDLE_MUTATION);
  const appliedNow = applied?.applied === true;

  // The action calls `revalidatePath('/cart')`, and a server action invoked from
  // a Client Component returns the refreshed page in its response, so the
  // summary above this form re-renders with the new discount. No client-side
  // reload and no re-fetch is needed; this effect only refreshes the header
  // badge, which is outside the revalidated subtree.
  useEffect(() => {
    if (state.status === 'success') {
      announceCountsChanged();
    }
  }, [state.status]);

  return (
    <div className={className}>
      {appliedNow ? (
        <div className="border-success-600/30 bg-success-600/5 flex flex-wrap items-center justify-between gap-3 rounded-sm border px-4 py-3">
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 aria-hidden="true" className="text-success-600 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">{applied.code}</span> applied —{' '}
              {applied.label.toLowerCase()}
              {applied.kind !== 'free_delivery' ? ` (${applied.amount} off)` : ''}
            </span>
          </p>
          <form action={formAction}>
            <input type="hidden" name="code" value="" />
            <Button type="submit" size="sm" variant="ghost" className="text-ink-500">
              Remove
            </Button>
          </form>
        </div>
      ) : (
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <Input
            id="discount-code"
            name="code"
            label="Promotional code"
            placeholder="Enter a code"
            autoComplete="off"
            className="w-full sm:w-56"
          />
          <SubmitButton label="Apply" />
        </form>
      )}

      {state.status === 'error' && state.message ? (
        <p role="alert" className="text-danger-600 mt-2 flex items-center gap-2 text-sm">
          <XCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
          {state.message}
        </p>
      ) : null}

      {/* A code that was applied earlier and has since stopped qualifying. The
          cart still renders; the code simply no longer reduces anything, and
          this says why. */}
      {!appliedNow && applied && !applied.applied && applied.reason ? (
        <p className="text-foreground-muted mt-2 flex items-center gap-2 text-sm">
          <Tag aria-hidden="true" className="h-4 w-4 shrink-0" />
          {applied.reason}
        </p>
      ) : null}
    </div>
  );
}

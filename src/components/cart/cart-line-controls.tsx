'use client';

import { Trash2 } from 'lucide-react';
import { useActionState, useEffect, useId } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { announceCountsChanged } from '@/lib/cart/events';
import { IDLE_MUTATION, type MutationState } from '@/lib/cart/validation';
import type { CartLine } from '@/lib/cart/types';
import { quantityOptions } from '@/lib/cart/pricing';
import { removeFromCart, updateCartQuantity } from '@/server/actions/cart-actions';

/**
 * Per-line cart controls: quantity and remove.
 *
 * -----------------------------------------------------------------------------
 * A REAL FORM, NOT A FETCH
 * -----------------------------------------------------------------------------
 *
 * Both controls are `<form>` elements bound to server actions. With JavaScript
 * disabled the browser posts the form and the action's state is rendered on the
 * server, so the cart is fully usable. There is no JSON payload and no
 * client-supplied price: the form carries a product id and, for the stepper, a
 * quantity.
 *
 * -----------------------------------------------------------------------------
 * THE STEPPER
 * -----------------------------------------------------------------------------
 *
 * A `select` rather than a pair of +/- buttons, because a select is one tab stop
 * and one announcement per line, where two buttons per line would double the tab
 * stops in a cart that may hold many pieces. It submits on change when
 * JavaScript is present, and a real (visually hidden) submit button carries the
 * no-JavaScript path.
 *
 * A locked line renders a static "1" instead of a control. That is not a
 * limitation dressed up: a unique watch has a single unreserved unit, so there
 * is no other quantity to choose, and offering one would be offering something
 * that does not exist. The reason is stated in the visible copy beside it.
 */
function RemoveButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="icon-sm"
      variant="ghost"
      loading={pending}
      className="text-ink-500 hover:text-danger-600"
    >
      <Trash2 aria-hidden="true" className="h-4 w-4" />
      <span className="sr-only">Remove from cart</span>
    </Button>
  );
}

export function CartLineControls({ line, className }: { line: CartLine; className?: string }) {
  const [quantityState, quantityAction] = useActionState(updateCartQuantity, IDLE_MUTATION);
  const [removeState, removeAction] = useActionState(removeFromCart, IDLE_MUTATION);
  const selectId = useId();

  // A changed cart changes the header badge. Announced once per settled action
  // rather than on every render, so a pending action does not cause a fetch.
  useEffect(() => {
    if (quantityState.status === 'success' || removeState.status === 'success') {
      announceCountsChanged();
    }
  }, [quantityState, removeState]);

  const options = quantityOptions(line);

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        {line.quantityLocked ? (
          <p className="text-foreground-muted text-sm">
            Quantity <span className="text-foreground font-medium">1</span>
            <span className="sr-only">. This is a unique piece, so only one is available.</span>
          </p>
        ) : (
          <form action={quantityAction} className="flex items-center gap-2">
            <input type="hidden" name="productId" value={line.productId} />
            <label htmlFor={selectId} className="text-foreground-muted text-sm">
              Quantity
            </label>
            <select
              id={selectId}
              name="quantity"
              defaultValue={String(line.quantity)}
              // Auto-submit is a convenience layered over a working form: the
              // hidden submit button below is what makes it work without
              // JavaScript.
              onChange={(event) => {
                event.currentTarget.form?.requestSubmit();
              }}
              className="border-line-300 bg-surface-0 text-foreground focus-visible:border-gold-700 focus-visible:outline-gold-700 h-9 rounded-sm border px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1"
            >
              {options.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            {/* The no-JavaScript path. Visually hidden rather than removed,
                because a `select` cannot submit on its own. */}
            <Button type="submit" size="sm" variant="ghost" className="sr-only-focusable sr-only">
              Update quantity
            </Button>
          </form>
        )}

        <form action={removeAction}>
          <input type="hidden" name="productId" value={line.productId} />
          <RemoveButton />
        </form>
      </div>

      <LineMessages
        state={quantityState.status === 'success' ? removeState : quantityState}
        line={line}
      />
    </div>
  );
}

/**
 * The messages under a line.
 *
 * A rejected update and a successful one are different things and are not
 * merged: an error is announced assertively, a confirmation politely. Both name
 * the product so a screen reader user hearing the message out of context knows
 * which line it belongs to.
 */
function LineMessages({ state, line }: { state: MutationState; line: CartLine }) {
  if (state.status === 'error' && state.message) {
    return (
      <p role="alert" className="text-danger-600 mt-2 text-xs font-medium">
        {state.message}
      </p>
    );
  }

  if (state.status === 'success' && state.message) {
    return (
      <p role="status" className="text-ink-500 mt-2 text-xs">
        {state.message}
      </p>
    );
  }

  if (state.status === 'success' && state.quantityAdjusted) {
    return (
      <p role="status" className="text-ink-500 mt-2 text-xs">
        Only one {line.title} is available, so the quantity is one.
      </p>
    );
  }

  return null;
}

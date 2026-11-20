'use client';

import { useActionState } from 'react';

import { IDLE_ADMIN_STATE, type AdminFormState } from '@/lib/admin/validation';

/**
 * The stock adjustment control.
 *
 * -----------------------------------------------------------------------------
 * WHY A DELTA, NOT A NEW TOTAL
 * -----------------------------------------------------------------------------
 *
 * The field asks for a change (`+2`, `-1`), not a new quantity. Two staff
 * adjusting the same product at the same time would each submit a total, and the
 * second would silently overwrite the first — one sale would vanish. A delta is
 * applied to whatever the balance is when the function runs, so concurrent
 * adjustments both take effect.
 *
 * The note is required. A stock change with no stated reason is
 * indistinguishable from a mistake six months later, and the ledger is the only
 * record that the change happened at all.
 */
export function StockAdjustForm({
  action,
  productId,
  productTitle,
}: {
  action: (state: AdminFormState, formData: FormData) => Promise<AdminFormState>;
  productId: string;
  productTitle: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_ADMIN_STATE);
  const errors = state.fieldErrors ?? {};
  const id = `stock-${productId}`;

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="productId" value={productId} />

      <div>
        <label htmlFor={`${id}-delta`} className="sr-only">
          Change in stock for {productTitle}
        </label>
        <input
          id={`${id}-delta`}
          name="delta"
          inputMode="numeric"
          placeholder="±0"
          required
          aria-invalid={Boolean(errors.delta)}
          className="border-line-300 focus-visible:outline-gold-700 w-20 rounded-sm border px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1"
        />
      </div>

      <div className="min-w-0 flex-1">
        <label htmlFor={`${id}-note`} className="sr-only">
          Reason for the change to {productTitle}
        </label>
        <input
          id={`${id}-note`}
          name="note"
          placeholder="Reason (required)"
          required
          aria-invalid={Boolean(errors.note)}
          className="border-line-300 focus-visible:outline-gold-700 w-full min-w-32 rounded-sm border px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="border-line-300 hover:border-line-400 focus-visible:outline-gold-700 rounded-sm border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Adjust'}
      </button>

      {state.status === 'error' && state.message ? (
        <p role="alert" className="text-danger-600 w-full text-xs">
          {state.message}
          {errors.delta ? ` ${errors.delta}.` : ''}
          {errors.note ? ` ${errors.note}.` : ''}
        </p>
      ) : null}
      {state.status === 'success' && state.message ? (
        <p role="status" className="text-success-600 w-full text-xs">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

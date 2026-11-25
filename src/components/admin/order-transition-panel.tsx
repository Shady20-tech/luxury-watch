'use client';

import { useActionState } from 'react';

import { IDLE_ADMIN_STATE, type AdminFormState } from '@/lib/admin/validation';
import type { OrderTransition } from '@/lib/admin/order-lifecycle';

/**
 * The status-transition controls.
 *
 * Each available transition is its own form, so pressing a button submits exactly
 * one intended change. A single form with a status dropdown invites a mis-click
 * that moves an order somewhere unintended, and an order status is a promise to a
 * customer.
 *
 * The note field is shared by every form in the group. It is optional here
 * because some transitions are self-explanatory ("start review"), but the
 * database records whatever is entered, and the history is read back by staff
 * who were not present.
 */
export function OrderTransitionPanel({
  action,
  orderId,
  transitions,
}: {
  action: (state: AdminFormState, formData: FormData) => Promise<AdminFormState>;
  orderId: string;
  transitions: OrderTransition[];
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_ADMIN_STATE);

  if (transitions.length === 0) {
    return (
      <p className="text-foreground-muted text-sm">
        This order is in a terminal state and cannot be moved further.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {state.status === 'error' && state.message ? (
        <p
          role="alert"
          className="border-danger-600/30 bg-danger-600/10 text-danger-600 rounded-sm border px-3 py-2 text-sm"
        >
          {state.message}
        </p>
      ) : null}
      {state.status === 'success' && state.message ? (
        <p
          role="status"
          className="border-success-600/30 bg-success-600/10 text-success-600 rounded-sm border px-3 py-2 text-sm"
        >
          {state.message}
        </p>
      ) : null}

      <ul className="space-y-2">
        {transitions.map((transition) => {
          const noteId = `transition-note-${transition.to}`;
          return (
            <li key={transition.to}>
              {/* The note lives inside each form: a textarea outside a form is not
                  submitted with it, and sharing one field across several forms
                  would require `form=` attributes that are easy to break. */}
              <form action={formAction} className="space-y-2">
                <input type="hidden" name="orderId" value={orderId} />
                <input type="hidden" name="toStatus" value={transition.to} />
                <label htmlFor={noteId} className="text-ink-700 block text-xs font-medium">
                  Note for “{transition.label}” (optional)
                </label>
                <textarea
                  id={noteId}
                  name="note"
                  rows={2}
                  className="border-field-border bg-field text-foreground focus-visible:outline-gold-700 w-full rounded-sm border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className={
                    transition.destructive
                      ? 'border-danger-600/40 text-danger-600 hover:bg-danger-600/5 focus-visible:outline-gold-700 w-full rounded-sm border px-3 py-2 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60'
                      : 'bg-ink-900 text-surface-0 focus-visible:outline-gold-700 w-full rounded-sm px-3 py-2 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60'
                  }
                >
                  {transition.label}
                  <span className="mt-0.5 block text-xs font-normal opacity-80">
                    {transition.description}
                  </span>
                </button>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

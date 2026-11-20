/**
 * The order lifecycle, as the application understands it.
 *
 * -----------------------------------------------------------------------------
 * WHY THE TRANSITIONS ARE WRITTEN DOWN HERE AS WELL AS IN THE DATABASE
 * -----------------------------------------------------------------------------
 *
 * The database is the authority: `admin_transition_order` refuses a terminal
 * state, refuses a no-op, and requires `orders.settle` for `paid_offline`. But it
 * can only refuse — it cannot tell the interface which buttons to draw. Without a
 * list like this, the order detail page would either offer every status and let
 * most of them fail, or hard-code the buttons and drift from the function.
 *
 * So this list is a *presentation* of the same rules. It must agree with the
 * function; when the function changes, this changes in the same commit. The
 * database remains the check that matters — a client that posts a status not
 * listed here still gets refused, because the function refuses it.
 *
 * There is deliberately no "best selling" or automatic progression. Every step is
 * a decision a person makes and is recorded with who made it.
 */

import type { AdminOrderStatus } from '@/lib/admin/validation';

export type OrderTransition = {
  to: AdminOrderStatus;
  label: string;
  /** Explains the consequence, so the button is not pressed blindly. */
  description: string;
  /** Only offered to a caller holding `orders.settle`. */
  requiresSettle?: boolean;
  /** Rendered as a destructive choice. */
  destructive?: boolean;
};

const TRANSITIONS: Record<AdminOrderStatus, OrderTransition[]> = {
  submitted: [
    {
      to: 'under_review',
      label: 'Start review',
      description:
        'Mark the request as being assessed. The customer is not contacted automatically.',
    },
    {
      to: 'cancelled',
      label: 'Cancel',
      description: 'Close the request. Any reserved stock is released.',
      destructive: true,
    },
    {
      to: 'rejected',
      label: 'Reject',
      description: 'Decline the request. Any reserved stock is released.',
      destructive: true,
    },
  ],
  under_review: [
    {
      to: 'confirmed',
      label: 'Confirm order',
      description:
        'Accept the order. Reserved stock stays reserved until it is fulfilled or cancelled.',
    },
    {
      to: 'cancelled',
      label: 'Cancel',
      description: 'Close the request. Any reserved stock is released.',
      destructive: true,
    },
    {
      to: 'rejected',
      label: 'Reject',
      description: 'Decline the request. Any reserved stock is released.',
      destructive: true,
    },
  ],
  confirmed: [
    {
      to: 'awaiting_payment',
      label: 'Awaiting payment',
      description: 'Record that the customer has been asked to pay offline.',
    },
    {
      to: 'paid_offline',
      label: 'Record offline payment',
      description:
        'Confirm the money has been received. This stamps you as the administrator who settled it.',
      requiresSettle: true,
    },
    {
      to: 'cancelled',
      label: 'Cancel',
      description: 'Close the order. Any reserved stock is released.',
      destructive: true,
    },
  ],
  awaiting_payment: [
    {
      to: 'paid_offline',
      label: 'Record offline payment',
      description:
        'Confirm the money has been received. This stamps you as the administrator who settled it.',
      requiresSettle: true,
    },
    {
      to: 'cancelled',
      label: 'Cancel',
      description: 'Close the order. Any reserved stock is released.',
      destructive: true,
    },
  ],
  paid_offline: [
    {
      to: 'fulfilled',
      label: 'Mark fulfilled',
      description: 'The piece has been handed over or delivered. This is a terminal state.',
    },
  ],
  fulfilled: [],
  cancelled: [],
  rejected: [],
};

/** The transitions a caller may perform, given whether they hold `orders.settle`. */
export function availableTransitions(
  status: AdminOrderStatus,
  canSettle: boolean,
): OrderTransition[] {
  return TRANSITIONS[status].filter((t) => !t.requiresSettle || canSettle);
}

export function isTerminalStatus(status: AdminOrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** A sentence describing what a status means, for the detail header. */
export const STATUS_DESCRIPTIONS: Record<AdminOrderStatus, string> = {
  submitted: 'Received and not yet looked at.',
  under_review: 'Being assessed by staff.',
  confirmed: 'Accepted; stock is reserved.',
  awaiting_payment: 'Waiting for the customer to pay offline.',
  paid_offline: 'Payment recorded by an administrator.',
  fulfilled: 'Completed and handed over. Terminal.',
  cancelled: 'Cancelled. Terminal.',
  rejected: 'Declined. Terminal.',
};

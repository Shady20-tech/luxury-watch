/**
 * Presentation helpers for order requests shown in the account area.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS SHARED RATHER THAN LOCAL TO A PAGE
 * -----------------------------------------------------------------------------
 *
 * The order confirmation page (`/order/[reference]`) and the account order
 * history show the same order to the same customer. Two copies of the status
 * wording would eventually disagree — one saying "Payment received offline" while
 * the other still said "Awaiting offline payment" — and the customer would have
 * no way to know which to believe. The wording lives here once and both surfaces
 * read it.
 *
 * The one rule the wording must never break: no status implies an online
 * payment. There is no payment gateway in this project, so nothing may say
 * "paid" without saying "offline", and no status may claim a piece is reserved
 * merely because it is in a cart.
 */

/** A customer-facing name for an order status. Never invents a "paid" state. */
export function orderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    submitted: 'Received — awaiting review',
    under_review: 'Being reviewed',
    confirmed: 'Confirmed',
    awaiting_payment: 'Awaiting offline payment',
    paid_offline: 'Payment received offline',
    fulfilled: 'Fulfilled',
    cancelled: 'Cancelled',
    rejected: 'Not accepted',
  };
  return labels[status] ?? status;
}

/**
 * A one-line explanation of what the status means for the customer.
 *
 * Separate from the label because the label is read in a list and the
 * explanation is read on the detail page, where there is room to say what
 * happens next.
 */
export function orderStatusDescription(status: string): string {
  const descriptions: Record<string, string> = {
    submitted:
      'We have your request. A member of the team will review it and confirm availability with you.',
    under_review: 'We are checking availability and the details of your request.',
    confirmed: 'Availability is confirmed. We will contact you to arrange payment offline.',
    awaiting_payment:
      'Your request is confirmed. We are waiting for the offline payment to be arranged.',
    paid_offline: 'We have recorded your offline payment. The piece is being prepared.',
    fulfilled: 'This order is complete.',
    cancelled: 'This request was cancelled.',
    rejected: 'We were unable to accept this request. Contact us if you would like to discuss it.',
  };
  return descriptions[status] ?? '';
}

/** The tone a status badge is rendered in. */
export function orderStatusTone(status: string): 'neutral' | 'positive' | 'negative' | 'pending' {
  switch (status) {
    case 'fulfilled':
    case 'paid_offline':
      return 'positive';
    case 'cancelled':
    case 'rejected':
      return 'negative';
    case 'submitted':
    case 'under_review':
    case 'awaiting_payment':
      return 'pending';
    default:
      return 'neutral';
  }
}

/** A short, unambiguous label for how the order is to be received. */
export function fulfilmentLabel(fulfilmentType: string): string {
  const labels: Record<string, string> = {
    delivery: 'Delivery',
    pickup: 'Collection in person',
  };
  return labels[fulfilmentType] ?? fulfilmentType;
}

/**
 * Whether a status is still open, so the account page can decide whether to
 * offer a follow-up action.
 */
export function orderIsOpen(status: string): boolean {
  return !['fulfilled', 'cancelled', 'rejected'].includes(status);
}

/**
 * Labels and tones for service-request workflow states.
 *
 * The three flows have their own enums (`sell_trade_status`, `sourcing_status`,
 * `repair_status`) but share a vocabulary of intent: submitted, being worked,
 * waiting on the customer, finished, or stopped. Mapping each state to one of
 * those tones keeps the account pages consistent and means a state added to an
 * enum later shows up as neutral rather than breaking a page.
 *
 * No tone here implies a payment has happened. A `completed` sell/trade means the
 * business recorded the transaction as settled offline; nothing before it does,
 * which is the same rule the email templates follow.
 */

export type StatusTone = 'neutral' | 'positive' | 'negative' | 'pending';

const POSITIVE = new Set(['accepted', 'completed', 'delivered', 'received', 'ready', 'closed']);
const NEGATIVE = new Set(['declined', 'cancelled', 'rejected', 'spam']);
const PENDING = new Set([
  'submitted',
  'under_review',
  'in_review',
  'searching',
  'inspection',
  'valuation',
  'authentication',
  'in_repair',
  'quality_control',
  'final_review',
  'shipping_pending',
  'purchase_pending',
  'shipping',
  'requested',
  'confirmed',
]);

/** The tone for a workflow status. Unknown states read as neutral. */
export function serviceStatusTone(status: string): StatusTone {
  if (POSITIVE.has(status)) return 'positive';
  if (NEGATIVE.has(status)) return 'negative';
  if (PENDING.has(status)) return 'pending';
  return 'neutral';
}

/** `more_information_required` → `More information required`. */
export function serviceStatusLabel(status: string): string {
  const words = status.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A human name for each service flow, used in headings and empty states. */
export const SERVICE_KIND_COPY = {
  sell_trade: {
    title: 'Sell or trade',
    description:
      'Offers we have made on pieces you sent us, and the valuation in progress for each.',
    empty:
      'When you ask us to consider a piece, its progress will appear here. You can start a new enquiry any time.',
    startHref: '/services/sell-trade',
    startLabel: 'Start a sell or trade enquiry',
  },
  sourcing: {
    title: 'Sourcing',
    description: 'Pieces you have asked us to find, and how each search is going.',
    empty:
      'When you ask us to find a piece, we will track the search here so you can see where it stands.',
    startHref: '/services/sourcing',
    startLabel: 'Ask us to source a piece',
  },
  repair: {
    title: 'Repairs',
    description: 'Servicing and restoration work we are carrying out for you.',
    empty: 'When you send a piece for servicing or restoration, its progress will appear here.',
    startHref: '/services/repair-restoration',
    startLabel: 'Request a repair',
  },
  appointment: {
    title: 'Appointments',
    description: 'Viewings and consultations you have requested.',
    empty: 'When you request a viewing or consultation, it will appear here.',
    startHref: '/appointments',
    startLabel: 'Request an appointment',
  },
} as const;

export type ServiceKind = keyof typeof SERVICE_KIND_COPY;

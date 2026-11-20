import { escapeHtml, type EmailMessage } from '@/lib/email/message';
import { wrapEmailHtml } from '@/lib/email/layout';
import { formatMoney } from '@/lib/orders/checkout-options';

/**
 * The order lifecycle emails, sent when staff move a request to a new state.
 *
 * -----------------------------------------------------------------------------
 * THE HARD PART: TALKING ABOUT MONEY WITHOUT LYING
 * -----------------------------------------------------------------------------
 *
 * `message.ts` states the rule that no message may claim a payment was taken,
 * because nothing on this site takes one. That rule holds for every state except
 * the two where an administrator has *recorded* that money was received offline.
 *
 * Those two states exist (`paid_offline`, and `fulfilled` which follows it), and
 * the customer has to be told: a shop that takes a bank transfer and then never
 * acknowledges it is not being honest, it is being silent. So the rule refines
 * to this, and `tests/email-lifecycle.test.ts` enforces it:
 *
 *   - Before `paid_offline`, no message may suggest money has moved.
 *   - At and after `paid_offline`, a message may say the store recorded the
 *     settlement — but only as something the store did offline, never as
 *     something the website processed.
 *   - No message, in any state, may name a card, a card number, a security code
 *     or an online transaction. There is no card handling in this project and a
 *     message that named one would imply there is. `check-no-payment-providers`
 *     scans for those words, this comment included, which is why it is worded
 *     around them rather than listing them.
 *
 * -----------------------------------------------------------------------------
 * WHY ONE TEMPLATE AND NOT EIGHT
 * -----------------------------------------------------------------------------
 *
 * Eight near-identical templates would be eight places for the settlement
 * wording to drift, and the drift would be invisible because each template is
 * only read when its own state occurs. The differences between states are a
 * heading, a sentence about what happened, and a sentence about what happens
 * next — so those three things are data, and the rest is shared.
 *
 * -----------------------------------------------------------------------------
 * WHAT THIS MESSAGE IS NOT
 * -----------------------------------------------------------------------------
 *
 * It is not sent for every edit. `under_review` is an internal working state and
 * deliberately sends nothing (see `ORDER_STATUS_EMAIL` below); a customer does
 * not need to be told that a member of staff opened their request. The states
 * that change what the customer must do, or that answer the question they asked,
 * are the ones that email.
 */

/** The statuses a transition can land in, as the database names them. */
export type LifecycleStatus =
  | 'submitted'
  | 'under_review'
  | 'confirmed'
  | 'awaiting_payment'
  | 'paid_offline'
  | 'fulfilled'
  | 'cancelled'
  | 'rejected';

export type OrderLifecycleEmailData = {
  reference: string;
  customerName: string;
  customerEmail: string;
  status: LifecycleStatus;
  /** The piece, so the message is recognisable without opening anything. */
  itemSummary: string;
  totalCents: number;
  currency: string;
  /** The administrator's note for the customer, if one was written. */
  note: string | null;
  /** The store's contact address, so every message says how to reply. */
  storeEmail: string | null;
};

/**
 * Which statuses email the customer, and what the message is called.
 *
 * `under_review` is absent on purpose: it is a working state with no consequence
 * for the customer, and emailing it would train people to ignore the messages
 * that do matter.
 */
export const ORDER_STATUS_EMAIL: Partial<Record<LifecycleStatus, string>> = {
  confirmed: 'Your order request has been accepted',
  awaiting_payment: 'How to settle your order',
  paid_offline: 'Your payment has been recorded',
  fulfilled: 'Your order is complete',
  cancelled: 'Your order request has been cancelled',
  rejected: 'About your order request',
};

/** The two states at which the store has recorded an offline settlement. */
const SETTLED: ReadonlySet<LifecycleStatus> = new Set(['paid_offline', 'fulfilled']);

/** What happened, in one sentence. The heart of each message. */
function situation(status: LifecycleStatus): string {
  switch (status) {
    case 'confirmed':
      return 'We have reviewed your request and accepted it. The piece is now held for you.';
    case 'awaiting_payment':
      return 'Your order is ready to settle. Payment is arranged directly with the store, outside this website.';
    case 'paid_offline':
      return 'A member of our team has recorded your payment as received. Thank you.';
    case 'fulfilled':
      return 'Your order is complete. Thank you for buying from us.';
    case 'cancelled':
      return 'We have closed your order request. Any stock we were holding for you has been released.';
    case 'rejected':
      return 'We were not able to accept this request. Any stock we were holding for you has been released.';
    default:
      return 'There is an update on your order request.';
  }
}

/** What happens next, in one sentence. Never promises a date we cannot keep. */
function nextStep(status: LifecycleStatus, storeEmail: string | null): string {
  switch (status) {
    case 'confirmed':
      return 'We will contact you to arrange payment and collection or delivery. Nothing has been paid yet.';
    case 'awaiting_payment':
      return storeEmail
        ? `Please contact us at ${storeEmail} to arrange payment. Nothing has been paid yet.`
        : 'Please contact us to arrange payment. Nothing has been paid yet.';
    case 'paid_offline':
      return 'We will be in touch to arrange collection or delivery.';
    case 'fulfilled':
      return 'If you need anything further, just reply to this message.';
    case 'cancelled':
      return storeEmail
        ? `If you have a question about this, contact us at ${storeEmail}.`
        : 'If you have a question about this, please contact us.';
    case 'rejected':
      return storeEmail
        ? `If you would like to discuss it, contact us at ${storeEmail}.`
        : 'If you would like to discuss it, please contact us.';
    default:
      return 'We will be in touch.';
  }
}

/**
 * The one line that keeps a message honest about money.
 *
 * Exported so the test can assert it appears in the states that need it, and so
 * a future state cannot be added without deciding what it says about payment.
 */
export function settlementStatement(status: LifecycleStatus): string {
  return SETTLED.has(status)
    ? 'This records a payment our team received offline. No payment was taken through this website.'
    : 'No payment has been taken. Nothing is final until the store confirms it in writing.';
}

/**
 * The customer's message for a lifecycle change.
 *
 * Returns `null` for a status that deliberately does not email, so the caller
 * cannot send one by accident — the absence is a decision, not a forgotten case.
 */
export function orderStatusEmail(data: OrderLifecycleEmailData): EmailMessage | null {
  const label = ORDER_STATUS_EMAIL[data.status];
  if (!label) return null;

  const subject = `${label} — ${data.reference}`;
  const situationText = situation(data.status);
  const nextText = nextStep(data.status, data.storeEmail);
  const settlement = settlementStatement(data.status);
  const total = formatMoney(data.totalCents, data.currency);

  const text = [
    `Hello ${data.customerName},`,
    '',
    situationText,
    '',
    `Reference: ${data.reference}`,
    `Piece: ${data.itemSummary}`,
    `Total: ${total}`,
    ...(data.note ? ['', 'A note from the team:', `  ${data.note}`] : []),
    '',
    nextText,
    '',
    settlement,
    '',
    '— The store',
  ].join('\n');

  const html = wrapEmailHtml({
    title: subject,
    preview: `${situationText} Reference ${data.reference}.`,
    body: [
      `<p>Hello ${escapeHtml(data.customerName)},</p>`,
      `<p>${escapeHtml(situationText)}</p>`,
      `<p><strong>Reference:</strong> ${escapeHtml(data.reference)}<br>`,
      `<strong>Piece:</strong> ${escapeHtml(data.itemSummary)}<br>`,
      `<strong>Total:</strong> ${escapeHtml(total)}</p>`,
      data.note ? `<p><strong>A note from the team:</strong><br>${escapeHtml(data.note)}</p>` : '',
      `<p>${escapeHtml(nextText)}</p>`,
      `<p>${escapeHtml(settlement)}</p>`,
    ].join('\n'),
  });

  return { to: data.customerEmail, subject, text, html };
}

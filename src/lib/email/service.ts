import { escapeHtml, type EmailMessage } from '@/lib/email/message';
import { wrapEmailHtml } from '@/lib/email/layout';

/**
 * The service-flow emails.
 *
 * -----------------------------------------------------------------------------
 * A REQUEST IS NOT AN AGREEMENT, AND NOT A SALE
 * -----------------------------------------------------------------------------
 *
 * Every one of these messages confirms that a *request* was received. None of
 * them confirms a price, an appointment, an accepted offer or a payout. The
 * wording matters most in the sell/trade and offer flows, where a customer might
 * read "we received your offer" as "you have sold your watch" — so each template
 * says what happens next and who decides, in the customer's own message.
 *
 * The lifecycle in `0015` reflects the same rule: a sell/trade request only
 * reaches `completed` when staff record the transaction as settled, and nothing
 * before that implies money moved. `tests/email.test.ts` scans the rendered output
 * for payment claims, so this cannot drift back.
 *
 * -----------------------------------------------------------------------------
 * ONE REQUEST, TWO MESSAGES
 * -----------------------------------------------------------------------------
 *
 * The customer is told their request was received; the business is told it needs
 * review. They are sent independently, so a bouncing admin mailbox does not stop
 * the customer's confirmation.
 */

export type ServiceKind =
  | 'sell_trade'
  | 'sourcing'
  | 'repair'
  | 'contact'
  | 'product_offer'
  | 'appointment';

export type ServiceEmailData = {
  kind: ServiceKind;
  reference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  /** The human label for the flow, used in both messages. */
  label: string;
  /** What the customer asked for, as pre-formatted lines. */
  details: { label: string; value: string }[];
  /** The customer's own words, if they left any. */
  message: string | null;
};

/** The line that keeps the offer and sell/trade messages honest. */
export const NOT_AN_AGREEMENT =
  'This is a request only. Nothing has been agreed or paid, and no price is final until the store confirms it in writing.';

/** Human labels for each flow. Kept here so both messages use the same wording. */
export const SERVICE_LABELS: Record<ServiceKind, string> = {
  sell_trade: 'sell or trade request',
  sourcing: 'watch sourcing request',
  repair: 'repair or restoration request',
  contact: 'message',
  product_offer: 'offer',
  appointment: 'appointment request',
};

/** The details block, as plain text. */
function detailsText(data: ServiceEmailData): string {
  return data.details
    .filter((row) => row.value.trim() !== '')
    .map((row) => `  ${row.label}: ${row.value}`)
    .join('\n');
}

/** The details block, as HTML list items. */
function detailsHtml(data: ServiceEmailData): string {
  return data.details
    .filter((row) => row.value.trim() !== '')
    .map((row) => `<li><strong>${escapeHtml(row.label)}:</strong> ${escapeHtml(row.value)}</li>`)
    .join('');
}

/**
 * The customer's confirmation.
 *
 * The subject names the reference so a customer searching their mailbox for it
 * finds this message, and so does the administrator when the customer replies.
 */
export function serviceRequestReceivedEmail(data: ServiceEmailData): EmailMessage {
  const subject = `We received your ${data.label} — ${data.reference}`;

  const text = [
    `Hello ${data.customerName},`,
    '',
    `Thank you — your ${data.label} has been received and a member of the team will review it.`,
    '',
    `Reference: ${data.reference}`,
    '',
    'What you told us:',
    detailsText(data),
    data.message ? `\nYour message:\n  ${data.message}` : '',
    '',
    'What happens next:',
    '  A member of the team will review your request and reply to the email address you',
    '  provided. If we need more information, we will ask before taking it further.',
    '',
    NOT_AN_AGREEMENT,
    '',
    'Quote your reference if you contact us about this request.',
    '',
    '— The store',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const html = wrapEmailHtml({
    title: subject,
    preview: `We received your ${data.label}, reference ${data.reference}.`,
    body: [
      `<p>Hello ${escapeHtml(data.customerName)},</p>`,
      `<p>Thank you — your ${escapeHtml(data.label)} has been received and a member of the team will review it.</p>`,
      `<p><strong>Reference:</strong> ${escapeHtml(data.reference)}</p>`,
      '<p>What you told us:</p>',
      `<ul>${detailsHtml(data)}</ul>`,
      data.message ? `<p><strong>Your message:</strong><br>${escapeHtml(data.message)}</p>` : '',
      '<p>A member of the team will review your request and reply to the email address you provided. If we need more information, we will ask before taking it further.</p>',
      `<p>${escapeHtml(NOT_AN_AGREEMENT)}</p>`,
      '<p>Quote your reference if you contact us about this request.</p>',
    ]
      .filter((part) => part !== '')
      .join('\n'),
  });

  return { to: data.customerEmail, subject, text, html };
}

/**
 * The business's notification.
 *
 * The customer's address is stated in the body so an administrator can reply to
 * the right person from their own client; the transport sends from the configured
 * address and does not set `replyTo`.
 */
export function newServiceRequestEmail(data: ServiceEmailData, adminEmail: string): EmailMessage {
  const subject = `New ${data.label} ${data.reference}`;

  const contact = [
    `  Name:  ${data.customerName}`,
    `  Email: ${data.customerEmail}`,
    data.customerPhone ? `  Phone: ${data.customerPhone}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const text = [
    `A new ${data.label} needs review.`,
    '',
    `Reference: ${data.reference}`,
    '',
    'Customer:',
    contact,
    '',
    'Details:',
    detailsText(data),
    data.message ? `\nCustomer message:\n  ${data.message}` : '',
    '',
    'Review the request and reply to the customer. The status is recorded against',
    'the request in the database.',
    '',
    NOT_AN_AGREEMENT,
  ]
    .filter((line) => line !== '')
    .join('\n');

  const html = wrapEmailHtml({
    title: subject,
    preview: `New ${data.label} ${data.reference} from ${data.customerName}.`,
    body: [
      `<p>A new ${escapeHtml(data.label)} needs review.</p>`,
      `<p><strong>Reference:</strong> ${escapeHtml(data.reference)}</p>`,
      `<p><strong>Customer:</strong><br>${escapeHtml(data.customerName)}<br>${escapeHtml(data.customerEmail)}${
        data.customerPhone ? `<br>${escapeHtml(data.customerPhone)}` : ''
      }</p>`,
      `<ul>${detailsHtml(data)}</ul>`,
      data.message
        ? `<p><strong>Customer message:</strong><br>${escapeHtml(data.message)}</p>`
        : '',
      '<p>Review the request and reply to the customer.</p>',
      `<p>${escapeHtml(NOT_AN_AGREEMENT)}</p>`,
    ]
      .filter((part) => part !== '')
      .join('\n'),
  });

  return { to: adminEmail, subject, text, html };
}

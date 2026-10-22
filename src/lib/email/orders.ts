import { formatMoney } from '@/lib/orders/checkout-options';
import { escapeHtml, summariseItems, type EmailMessage } from '@/lib/email/message';

/**
 * The order-request emails.
 *
 * Two messages are sent for one submission: the customer is told their request
 * was received, and the business is told a request needs review. They are built
 * from the same committed row, so the two can never quote different figures.
 *
 * -----------------------------------------------------------------------------
 * THE ONE SENTENCE THAT MUST BE RIGHT
 * -----------------------------------------------------------------------------
 *
 * The customer's message must not read as though money has moved. `NOT_PAID` is
 * the single place that is said, and it is included in both the text and the
 * HTML part of every customer-facing message. `tests/email.test.ts` scans the
 * rendered output for claims of payment and fails if one appears, so this is
 * enforced rather than merely intended.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS IN THE ADMIN MESSAGE
 * -----------------------------------------------------------------------------
 *
 * Everything an administrator needs to act without opening the database: who,
 * how to reach them, how they want it delivered or collected, how they intend to
 * settle, and the note. The customer's note is quoted verbatim because it often
 * carries the detail that decides the reply.
 */

export type OrderEmailData = {
  reference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  fulfilmentType: string;
  pickupLocation: string | null;
  deliveryAddress: Record<string, string | undefined> | null;
  paymentMethodCode: string | null;
  paymentMethodLabel: string | null;
  customerNote: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  discountCode: string | null;
  totalCents: number;
  currency: string;
  items: { title: string; quantity: number; unitPriceCents: number | null }[];
  /**
   * Where the customer can read the request back.
   *
   * Only a guest has one: the link carries the access token, which is shown
   * once and never stored, so this is the only chance to give it to them
   * (G51). A signed-in customer reads the request from their account instead
   * and this is `null`, which is why it is optional in the rendered output
   * rather than an empty link.
   */
  orderUrl: string | null;
};

/**
 * The line that keeps every customer message honest.
 *
 * Exported so the test can assert it appears, and so a future template cannot
 * quietly omit it.
 */
export const NOT_PAID =
  'No payment has been taken. This is a request, and the store will contact you to arrange payment.';

function money(cents: number, currency: string): string {
  return formatMoney(cents, currency);
}

/** The order lines, as plain text. */
function itemsText(data: OrderEmailData): string {
  return data.items
    .map((item) => {
      const unit =
        item.unitPriceCents === null
          ? 'price on request'
          : money(item.unitPriceCents, data.currency);
      return `  - ${item.title} x${item.quantity} (${unit} each)`;
    })
    .join('\n');
}

/** The order lines, as HTML list items. */
function itemsHtml(data: OrderEmailData): string {
  return data.items
    .map((item) => {
      const unit =
        item.unitPriceCents === null
          ? 'Price on request'
          : escapeHtml(money(item.unitPriceCents, data.currency));
      return `<li>${escapeHtml(item.title)} &times; ${item.quantity} <span>(${unit} each)</span></li>`;
    })
    .join('');
}

/** The money block, as plain text. Omits a line that is zero or absent. */
function totalsText(data: OrderEmailData): string {
  const lines = [`  Subtotal: ${money(data.subtotalCents, data.currency)}`];
  if (data.discountCents > 0) {
    lines.push(
      `  Discount${data.discountCode ? ` (${data.discountCode})` : ''}: -${money(data.discountCents, data.currency)}`,
    );
  }
  if (data.deliveryFeeCents > 0) {
    lines.push(`  Delivery: ${money(data.deliveryFeeCents, data.currency)}`);
  }
  lines.push(`  Total: ${money(data.totalCents, data.currency)}`);
  return lines.join('\n');
}

/** The money block, as HTML rows. */
function totalsHtml(data: OrderEmailData): string {
  const rows = [
    `<tr><th scope="row">Subtotal</th><td>${escapeHtml(money(data.subtotalCents, data.currency))}</td></tr>`,
  ];
  if (data.discountCents > 0) {
    const label = data.discountCode ? `Discount (${escapeHtml(data.discountCode)})` : 'Discount';
    rows.push(
      `<tr><th scope="row">${label}</th><td>&minus;${escapeHtml(money(data.discountCents, data.currency))}</td></tr>`,
    );
  }
  if (data.deliveryFeeCents > 0) {
    rows.push(
      `<tr><th scope="row">Delivery</th><td>${escapeHtml(money(data.deliveryFeeCents, data.currency))}</td></tr>`,
    );
  }
  rows.push(
    `<tr><th scope="row">Total</th><td><strong>${escapeHtml(money(data.totalCents, data.currency))}</strong></td></tr>`,
  );
  return rows.join('');
}

/** The delivery address, as one line per field, in a stable order. */
function addressLines(address: Record<string, string | undefined> | null): string[] {
  if (!address) return [];
  const order = ['line1', 'line2', 'city', 'region', 'postal_code', 'country_code'];
  return order
    .map((key) => address[key])
    .filter((value): value is string => Boolean(value && value.trim()));
}

/** How the customer wants to receive the piece, as plain text. */
function fulfilmentText(data: OrderEmailData): string {
  if (data.fulfilmentType === 'pickup') {
    return data.pickupLocation
      ? `  Collection in person from ${data.pickupLocation}`
      : '  Collection in person (the store will confirm the location)';
  }
  const lines = addressLines(data.deliveryAddress);
  return lines.length > 0 ? `  Delivery to:\n    ${lines.join('\n    ')}` : '  Delivery';
}

/** How the customer wants to receive the piece, as HTML. */
function fulfilmentHtml(data: OrderEmailData): string {
  if (data.fulfilmentType === 'pickup') {
    return data.pickupLocation
      ? `Collection in person from ${escapeHtml(data.pickupLocation)}`
      : 'Collection in person (the store will confirm the location)';
  }
  const lines = addressLines(data.deliveryAddress);
  if (lines.length === 0) return 'Delivery';
  return `Delivery to:<br>${lines.map((line) => escapeHtml(line)).join('<br>')}`;
}

/**
 * The customer's confirmation.
 *
 * The subject names the reference so a customer searching their mailbox for it
 * finds this message, and so does the administrator when the customer replies.
 */
export function orderRequestReceivedEmail(data: OrderEmailData): EmailMessage {
  const subject = `Order request received — ${data.reference}`;

  const text = [
    `Hello ${data.customerName},`,
    '',
    'Thank you for your order request. It has been received and a member of the team will review it and contact you.',
    '',
    `Reference: ${data.reference}`,
    '',
    'What you asked for:',
    itemsText(data),
    '',
    'Summary:',
    totalsText(data),
    '',
    'How you will receive it:',
    fulfilmentText(data),
    '',
    ...(data.orderUrl ? ['Read your request at any time:', `  ${data.orderUrl}`, ''] : []),
    NOT_PAID,
    '',
    'Quote your reference if you contact us about this request.',
    '',
    '— The store',
  ].join('\n');

  const html = [
    `<p>Hello ${escapeHtml(data.customerName)},</p>`,
    '<p>Thank you for your order request. It has been received and a member of the team will review it and contact you.</p>',
    `<p><strong>Reference:</strong> ${escapeHtml(data.reference)}</p>`,
    `<ul>${itemsHtml(data)}</ul>`,
    `<table>${totalsHtml(data)}</table>`,
    `<p>${fulfilmentHtml(data)}</p>`,
    data.orderUrl
      ? `<p><a href="${escapeHtml(data.orderUrl)}">Read your request at any time</a></p>`
      : '',
    `<p>${escapeHtml(NOT_PAID)}</p>`,
    '<p>Quote your reference if you contact us about this request.</p>',
  ].join('\n');

  return { to: data.customerEmail, subject, text, html };
}

/**
 * The business's notification.
 *
 * `replyTo` is not set by this template — the transport sends from the
 * configured address. The customer's address is stated in the body so an
 * administrator can reply to the right person from their own client.
 */
export function newOrderRequestEmail(data: OrderEmailData, adminEmail: string): EmailMessage {
  const subject = `New order request ${data.reference} — ${summariseItems(data.items)}`;

  const contact = [
    `  Name:  ${data.customerName}`,
    `  Email: ${data.customerEmail}`,
    data.customerPhone ? `  Phone: ${data.customerPhone}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const text = [
    `A new order request needs review.`,
    '',
    `Reference: ${data.reference}`,
    '',
    'Customer:',
    contact,
    '',
    'Requested:',
    itemsText(data),
    '',
    'Summary:',
    totalsText(data),
    '',
    'Fulfilment:',
    fulfilmentText(data),
    '',
    `Intended settlement: ${data.paymentMethodLabel ?? data.paymentMethodCode ?? 'not specified'}`,
    data.customerNote ? `\nCustomer note:\n  ${data.customerNote}` : '',
    '',
    NOT_PAID,
    '',
    'Confirm availability and arrange settlement outside the website.',
  ]
    .filter((line) => line !== '')
    .join('\n');

  const noteHtml = data.customerNote
    ? `<p><strong>Customer note:</strong><br>${escapeHtml(data.customerNote)}</p>`
    : '';

  const html = [
    '<p>A new order request needs review.</p>',
    `<p><strong>Reference:</strong> ${escapeHtml(data.reference)}</p>`,
    `<p><strong>Customer:</strong> ${escapeHtml(data.customerName)}<br>${escapeHtml(data.customerEmail)}${data.customerPhone ? `<br>${escapeHtml(data.customerPhone)}` : ''}</p>`,
    `<ul>${itemsHtml(data)}</ul>`,
    `<table>${totalsHtml(data)}</table>`,
    `<p>${fulfilmentHtml(data)}</p>`,
    `<p><strong>Intended settlement:</strong> ${escapeHtml(data.paymentMethodLabel ?? data.paymentMethodCode ?? 'not specified')}</p>`,
    noteHtml,
    `<p>${escapeHtml(NOT_PAID)}</p>`,
    '<p>Confirm availability and arrange settlement outside the website.</p>',
  ].join('\n');

  return { to: adminEmail, subject, text, html };
}

import { describe, expect, it } from 'vitest';

import { escapeHtml, summariseItems } from '@/lib/email/message';
import {
  NOT_PAID,
  newOrderRequestEmail,
  orderRequestReceivedEmail,
  type OrderEmailData,
} from '@/lib/email/orders';

/**
 * Transactional email: the payment invariant, escaping and the two templates.
 *
 * -----------------------------------------------------------------------------
 * THE TEST THAT MATTERS MOST
 * -----------------------------------------------------------------------------
 *
 * `never claims a payment has been taken` scans the fully rendered subject, text
 * and HTML of both messages for any phrasing that would tell a customer money
 * has moved. The project's central constraint is that no payment is ever taken
 * on the website; a confirmation email that says "payment received" would break
 * that constraint in the one place a customer is most likely to believe it. This
 * is asserted on rendered output rather than on the source, so it holds however
 * the templates are refactored.
 */

const DATA: OrderEmailData = {
  reference: 'LW-26-100001',
  customerName: 'A Customer',
  customerEmail: 'customer@example.com',
  customerPhone: '555 0100',
  fulfilmentType: 'delivery',
  pickupLocation: null,
  deliveryAddress: {
    line1: '1 Example Street',
    city: 'Geneva',
    postal_code: '1201',
    country_code: 'CH',
  },
  paymentMethodCode: 'bank_transfer',
  paymentMethodLabel: 'Bank transfer',
  customerNote: 'Please call before dispatch.',
  subtotalCents: 1_250_000,
  deliveryFeeCents: 5_000,
  discountCents: 0,
  discountCode: null,
  totalCents: 1_255_000,
  currency: 'USD',
  items: [{ title: 'Submariner Date 126610LN', quantity: 1, unitPriceCents: 1_250_000 }],
  orderUrl: null,
};

const CUSTOMER = orderRequestReceivedEmail(DATA);
const ADMIN = newOrderRequestEmail(DATA, 'admin@example.com');

/** Every rendered string a recipient could read. */
function rendered(messages: { subject: string; text: string; html: string }[]): string[] {
  return messages.flatMap((message) => [message.subject, message.text, message.html]);
}

describe('escapeHtml', () => {
  it('escapes the five characters that matter in an HTML attribute or body', () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe(
      '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;',
    );
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeHtml('Submariner Date 126610LN')).toBe('Submariner Date 126610LN');
  });
});

describe('summariseItems', () => {
  it('names a single item without a count when the quantity is one', () => {
    expect(summariseItems([{ title: 'Speedmaster', quantity: 1 }])).toBe('Speedmaster');
  });

  it('shows the quantity when more than one of the same piece is requested', () => {
    expect(summariseItems([{ title: 'Speedmaster', quantity: 2 }])).toBe('Speedmaster (x2)');
  });

  it('collapses a longer basket to a count, keeping the first piece', () => {
    expect(
      summariseItems([
        { title: 'Speedmaster', quantity: 1 },
        { title: 'Navitimer', quantity: 1 },
        { title: 'Carrera', quantity: 1 },
      ]),
    ).toBe('Speedmaster and 2 more');
  });

  it('handles an empty basket without throwing', () => {
    expect(summariseItems([])).toBe('no items');
  });
});

describe('order request emails never claim a payment', () => {
  it('includes the not-paid statement in both messages', () => {
    expect(CUSTOMER.text).toContain(NOT_PAID);
    expect(CUSTOMER.html).toContain(NOT_PAID);
    expect(ADMIN.text).toContain(NOT_PAID);
    expect(ADMIN.html).toContain(NOT_PAID);
  });

  it.each([
    /\bpaid\b/i,
    /payment\s+(received|confirmed|complete|successful|taken|processed)/i,
    /\b(confirmed|completed|successful)\s+payment\b/i,
    /\bcharged\b/i,
    /\bcard\b/i,
    /\b(cvv|cvc)\b/i,
    /\btransaction\s+(id|complete|reference)\b/i,
  ])('does not contain %s in any rendered part', (pattern) => {
    for (const value of rendered([CUSTOMER, ADMIN])) {
      expect(value).not.toMatch(pattern);
    }
  });

  it('says plainly that no payment has been taken', () => {
    // The positive form of the rule: it is not enough to avoid the word "paid",
    // the customer must be told what the state actually is.
    expect(CUSTOMER.text).toMatch(/no payment has been taken/i);
  });
});

describe('orderRequestReceivedEmail', () => {
  it('addresses the customer and names the reference in the subject', () => {
    expect(CUSTOMER.to).toBe('customer@example.com');
    expect(CUSTOMER.subject).toContain('LW-26-100001');
    expect(CUSTOMER.text).toContain('A Customer');
  });

  it('quotes the figures the database computed', () => {
    // The figures are minor units: 1_250_000 cents is $12,500.00.
    expect(CUSTOMER.text).toContain('$12,500.00');
    expect(CUSTOMER.text).toContain('$12,550.00');
    expect(CUSTOMER.text).toContain('$50.00');
  });

  it('lists the item with its quantity', () => {
    expect(CUSTOMER.text).toContain('Submariner Date 126610LN x1');
    expect(CUSTOMER.html).toContain('Submariner Date 126610LN');
  });

  it('describes a delivery address when the request is for delivery', () => {
    expect(CUSTOMER.text).toContain('1 Example Street');
    expect(CUSTOMER.text).toContain('Geneva');
  });

  it('describes collection instead when the request is for pickup', () => {
    const pickup = orderRequestReceivedEmail({
      ...DATA,
      fulfilmentType: 'pickup',
      pickupLocation: '12 Rue du Rhone, Geneva',
      deliveryAddress: null,
    });
    expect(pickup.text).toContain('12 Rue du Rhone, Geneva');
    expect(pickup.text).not.toContain('1 Example Street');
  });

  it('says the location will be confirmed when pickup has no configured address', () => {
    const pickup = orderRequestReceivedEmail({
      ...DATA,
      fulfilmentType: 'pickup',
      pickupLocation: null,
      deliveryAddress: null,
    });
    expect(pickup.text).toMatch(/confirm the location/i);
  });

  it('omits a discount line when there is no discount', () => {
    expect(CUSTOMER.text).not.toMatch(/discount/i);
  });

  it('shows the discount with its code when one was applied', () => {
    const discounted = orderRequestReceivedEmail({
      ...DATA,
      discountCents: 50_000,
      discountCode: 'WELCOME10',
      totalCents: 1_205_000,
    });
    expect(discounted.text).toContain('WELCOME10');
    expect(discounted.text).toContain('$500');
  });
});

describe('newOrderRequestEmail', () => {
  it('goes to the administrator, not the customer', () => {
    expect(ADMIN.to).toBe('admin@example.com');
  });

  it('carries everything needed to act without opening the database', () => {
    expect(ADMIN.text).toContain('A Customer');
    expect(ADMIN.text).toContain('customer@example.com');
    expect(ADMIN.text).toContain('555 0100');
    expect(ADMIN.text).toContain('1 Example Street');
    expect(ADMIN.text).toContain('Bank transfer');
    expect(ADMIN.text).toContain('Please call before dispatch.');
    expect(ADMIN.text).toContain('LW-26-100001');
  });

  it('names the piece in the subject so the inbox is scannable', () => {
    expect(ADMIN.subject).toContain('Submariner Date 126610LN');
    expect(ADMIN.subject).toContain('LW-26-100001');
  });

  it('falls back to the raw code when the label is unknown', () => {
    const noLabel = newOrderRequestEmail(
      { ...DATA, paymentMethodLabel: null },
      'admin@example.com',
    );
    expect(noLabel.text).toContain('bank_transfer');
  });

  it('says "not specified" when no method was recorded', () => {
    const none = newOrderRequestEmail(
      { ...DATA, paymentMethodCode: null, paymentMethodLabel: null },
      'admin@example.com',
    );
    expect(none.text).toContain('not specified');
  });
});

describe('the guest confirmation link', () => {
  const LINK = 'https://example.test/order/LW-26-100001?token=abc123';

  it('is absent when the customer has no link, as a signed-in customer does not', () => {
    // `DATA.orderUrl` is null, so neither part may invent one.
    expect(CUSTOMER.text).not.toContain('/order/');
    expect(CUSTOMER.html).not.toContain('/order/');
  });

  it('appears in both parts of the customer message when there is one', () => {
    // The token is shown once and only its hash is stored, so this email is the
    // guest's only chance to keep the link (G51).
    const guest = orderRequestReceivedEmail({ ...DATA, orderUrl: LINK });
    expect(guest.text).toContain(LINK);
    expect(guest.html).toContain(LINK);
  });

  it('never reaches the administrator message, where the token is not needed', () => {
    // The link is a capability. An admin can look the request up; copying the
    // token into a second mailbox only widens who holds it.
    const admin = newOrderRequestEmail({ ...DATA, orderUrl: LINK }, 'admin@example.com');
    expect(admin.text).not.toContain('abc123');
    expect(admin.html).not.toContain('abc123');
  });

  it('is escaped in the HTML part, so a crafted reference cannot inject markup', () => {
    const nasty = 'https://example.test/order/x?token="><img src=x>';
    const message = orderRequestReceivedEmail({ ...DATA, orderUrl: nasty });
    expect(message.html).not.toContain('<img src=x');
    expect(message.html).toContain('&quot;&gt;&lt;img src=x&gt;');
  });
});

describe('customer-supplied text is escaped in the HTML part', () => {
  it('escapes a name that contains markup', () => {
    const message = orderRequestReceivedEmail({
      ...DATA,
      customerName: '<img src=x onerror=alert(1)>',
      customerNote: '<script>alert(2)</script>',
    });
    expect(message.html).not.toContain('<img src=x');
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;img src=x');
  });

  it('escapes a note in the administrator message', () => {
    const message = newOrderRequestEmail(
      { ...DATA, customerNote: '<b>bold</b>' },
      'admin@example.com',
    );
    expect(message.html).not.toContain('<b>bold</b>');
    expect(message.html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('escapes an address line', () => {
    const message = orderRequestReceivedEmail({
      ...DATA,
      deliveryAddress: { line1: '1 <b>Bold</b> Street', city: 'Geneva' },
    });
    expect(message.html).not.toContain('<b>Bold</b>');
  });
});

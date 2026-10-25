import { describe, expect, it } from 'vitest';

import {
  NOT_AN_AGREEMENT,
  SERVICE_LABELS,
  newServiceRequestEmail,
  serviceRequestReceivedEmail,
  type ServiceEmailData,
  type ServiceKind,
} from '@/lib/email/service';

/**
 * The service-flow emails.
 *
 * -----------------------------------------------------------------------------
 * THE PAYMENT INVARIANT
 * -----------------------------------------------------------------------------
 *
 * This project takes no payment online, and the confirmation messages are where
 * that rule is easiest to break by accident: a phrase like "your offer has been
 * accepted" or "payment received" in a service email would claim something that
 * never happened. The sell/trade and offer flows are the highest risk, because a
 * customer who has offered a price may read a receipt-shaped email as a
 * commitment. Every rendered part of every flow is scanned for those phrases, and
 * every message must positively state that nothing has been agreed or paid.
 *
 * The templates are pure functions of their data, so the whole matrix can be
 * rendered here without a transport.
 */

const KINDS: ServiceKind[] = [
  'sell_trade',
  'sourcing',
  'repair',
  'contact',
  'product_offer',
  'appointment',
];

function data(kind: ServiceKind, overrides: Partial<ServiceEmailData> = {}): ServiceEmailData {
  return {
    kind,
    reference: 'INQ-26-000123',
    customerName: 'A Customer',
    customerEmail: 'customer@example.com',
    customerPhone: '555 0100',
    label: SERVICE_LABELS[kind],
    details: [
      { label: 'Reference number', value: 'REF-1' },
      { label: 'Brand', value: 'Example' },
      { label: 'Empty detail', value: '   ' },
    ],
    message: 'Please could you let me know.',
    ...overrides,
  };
}

function rendered(kind: ServiceKind): string[] {
  const payload = data(kind);
  const customer = serviceRequestReceivedEmail(payload);
  const admin = newServiceRequestEmail(payload, 'admin@example.com');
  return [customer.subject, customer.text, customer.html, admin.subject, admin.text, admin.html];
}

/**
 * The rendered value with the required disclaimer removed.
 *
 * The disclaimer itself contains the word "paid" — it says nothing has been paid
 * — so a bare scan for that word would flag the very line that makes the message
 * honest. The exemption is exactly this one sentence, asserted present by its own
 * test above, so a claim anywhere else in the message still fails the scan. This
 * is the same shape as the order email's `NOT_PAID` line: the rule is "never claim
 * a payment", not "never write the word".
 */
function withoutDisclaimer(value: string): string {
  return value.split(NOT_AN_AGREEMENT).join(' ');
}

describe('service emails never claim a payment or an agreement', () => {
  it.each(KINDS)('states the not-an-agreement line in the %s messages', (kind) => {
    const payload = data(kind);
    const customer = serviceRequestReceivedEmail(payload);
    const admin = newServiceRequestEmail(payload, 'admin@example.com');

    expect(customer.text).toContain(NOT_AN_AGREEMENT);
    expect(customer.html).toContain(NOT_AN_AGREEMENT);
    expect(admin.text).toContain(NOT_AN_AGREEMENT);
    expect(admin.html).toContain(NOT_AN_AGREEMENT);
  });

  it.each([
    /\bpaid\b/i,
    /payment\s+(received|confirmed|complete|successful|taken|processed)/i,
    /\b(confirmed|completed|successful)\s+payment\b/i,
    /\bcharged\b/i,
    /\bcard\b/i,
    /\b(cvv|cvc)\b/i,
    /\btransaction\s+(id|complete|reference)\b/i,
    /\b(accepted|purchase complete|order confirmed)\b/i,
  ])('does not contain %s in any flow', (pattern) => {
    for (const kind of KINDS) {
      for (const value of rendered(kind)) {
        expect(withoutDisclaimer(value)).not.toMatch(pattern);
      }
    }
  });

  it('would catch a payment claim outside the disclaimer', () => {
    // Non-vacuity: the exemption must not blunt the scan. A message that claims a
    // payment *in addition to* the disclaimer still has to fail.
    const claim = `${NOT_AN_AGREEMENT} Payment received — thank you.`;
    expect(withoutDisclaimer(claim)).toMatch(/payment\s+received/i);
  });

  it('says plainly that nothing has been agreed or paid', () => {
    // The positive form of the rule: avoiding the word "paid" is not enough, the
    // customer must be told what the state actually is.
    expect(NOT_AN_AGREEMENT).toMatch(/nothing has been agreed or paid/i);
  });
});

describe('serviceRequestReceivedEmail', () => {
  it('names the reference in the subject so it can be found again', () => {
    const message = serviceRequestReceivedEmail(data('sourcing'));
    expect(message.subject).toContain('INQ-26-000123');
    expect(message.to).toBe('customer@example.com');
  });

  it('addresses the customer by name', () => {
    expect(serviceRequestReceivedEmail(data('contact')).text).toContain('A Customer');
  });

  it('omits a detail row that has no value', () => {
    const message = serviceRequestReceivedEmail(data('repair'));
    expect(message.text).not.toContain('Empty detail');
    expect(message.html).not.toContain('Empty detail');
  });

  it('includes the customer message when there is one', () => {
    expect(serviceRequestReceivedEmail(data('contact')).text).toContain(
      'Please could you let me know.',
    );
  });

  it('handles a submission with no message', () => {
    const message = serviceRequestReceivedEmail(data('appointment', { message: null }));
    expect(message.text).not.toContain('Your message:');
    expect(message.html).not.toContain('Your message:');
  });

  it('escapes markup in a customer-supplied value', () => {
    // The name, the details and the message are all visitor input and are
    // rendered into HTML. Escaping is what stops a stored value from becoming
    // markup in the store's own mail.
    const message = serviceRequestReceivedEmail(
      data('contact', {
        customerName: '<script>alert(1)</script>',
        message: '<img src=x onerror=alert(1)>',
      }),
    );
    expect(message.html).not.toContain('<script>');
    expect(message.html).not.toContain('<img');
    expect(message.html).toContain('&lt;script&gt;');
  });
});

describe('newServiceRequestEmail', () => {
  it('tells the business who to reply to', () => {
    const message = newServiceRequestEmail(data('sell_trade'), 'admin@example.com');
    expect(message.to).toBe('admin@example.com');
    expect(message.text).toContain('customer@example.com');
  });

  it('labels the flow so the admin queue is unambiguous', () => {
    const message = newServiceRequestEmail(data('product_offer'), 'admin@example.com');
    expect(message.subject).toContain(SERVICE_LABELS.product_offer);
  });
});

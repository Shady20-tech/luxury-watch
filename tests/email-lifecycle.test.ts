import { describe, expect, it } from 'vitest';

import {
  ORDER_STATUS_EMAIL,
  orderStatusEmail,
  settlementStatement,
  type LifecycleStatus,
} from '@/lib/email/lifecycle';
import { wrapEmailHtml } from '@/lib/email/layout';

/**
 * The lifecycle emails.
 *
 * -----------------------------------------------------------------------------
 * THE INVARIANT IS THE TEST
 * -----------------------------------------------------------------------------
 *
 * The reason these templates exist in a shape worth testing is that they are the
 * only messages in the project that are allowed to say money arrived — and only
 * after an administrator has recorded that it did, offline. Every assertion below
 * is one clause of that rule, written as a scan over the rendered output rather
 * than a check of a helper's return value, because a template can be wrong in the
 * sentence around the helper.
 *
 * The scan runs over the *text* part. That is deliberate: the text part is
 * written first and must stand alone, so if a claim is absent there it is absent
 * from the message a plain-text client reads. The HTML is generated from the same
 * values, and the escaping test below covers the other way a template fails.
 */

const DATA = {
  reference: 'LW-26-100001',
  customerName: 'A Customer',
  customerEmail: 'customer@example.com',
  itemSummary: 'Omega Speedmaster, 2021',
  totalCents: 1_205_000,
  currency: 'USD',
  note: null as string | null,
  storeEmail: 'store@example.com' as string | null,
};

/** Every status the type admits, so a new one cannot escape the scan. */
const ALL_STATUSES: LifecycleStatus[] = [
  'submitted',
  'under_review',
  'confirmed',
  'awaiting_payment',
  'paid_offline',
  'fulfilled',
  'cancelled',
  'rejected',
];

/**
 * Phrases that assert a payment has been taken *by the website*.
 *
 * Chosen narrowly. "Payment has been recorded" is legitimate at `paid_offline`
 * and is not on this list; "payment received" without the offline qualifier is
 * the shape that implies the site processed it.
 */
const FORBIDDEN_BEFORE_SETTLEMENT = [
  'payment received',
  'payment confirmed',
  'we have received your payment',
  'paid in full',
  'your card',
  'card number',
  'security code',
  'cvv',
  'cvc',
];

function textFor(status: LifecycleStatus): string {
  const message = orderStatusEmail({ ...DATA, status });
  if (!message) throw new Error(`no message rendered for ${status}`);
  return message.text;
}

describe('orderStatusEmail — which states speak', () => {
  it('renders nothing for the internal working state', () => {
    expect(orderStatusEmail({ ...DATA, status: 'under_review' })).toBeNull();
    expect(orderStatusEmail({ ...DATA, status: 'submitted' })).toBeNull();
  });

  it('renders a message for every status in the table', () => {
    for (const status of Object.keys(ORDER_STATUS_EMAIL) as LifecycleStatus[]) {
      const message = orderStatusEmail({ ...DATA, status });
      expect(message, `expected a message for ${status}`).not.toBeNull();
      expect(message!.subject).toContain(DATA.reference);
    }
  });

  it('addresses the customer and names the piece', () => {
    const text = textFor('confirmed');
    expect(text).toContain('A Customer');
    expect(text).toContain(DATA.itemSummary);
    expect(text).toContain('LW-26-100001');
  });
});

describe('orderStatusEmail — the payment invariant', () => {
  it('never claims a payment before one has been recorded', () => {
    const before: LifecycleStatus[] = ['confirmed', 'awaiting_payment', 'cancelled', 'rejected'];

    for (const status of before) {
      const text = textFor(status).toLowerCase();
      for (const phrase of FORBIDDEN_BEFORE_SETTLEMENT) {
        expect(text, `${status} must not say "${phrase}"`).not.toContain(phrase);
      }
      // The positive half of the same rule: the message must actively say that
      // nothing has been paid, not merely omit a claim.
      expect(text).toContain('no payment has been taken');
    }
  });

  it('says the settlement was recorded offline at and after the settled states', () => {
    for (const status of ['paid_offline', 'fulfilled'] as LifecycleStatus[]) {
      const text = textFor(status);
      expect(text).toContain('This records a payment our team received offline.');
      expect(text).toContain('No payment was taken through this website.');
    }
  });

  it('never mentions a card in any state', () => {
    for (const status of ALL_STATUSES) {
      const message = orderStatusEmail({ ...DATA, status });
      if (!message) continue;
      const haystack = `${message.subject}\n${message.text}\n${message.html}`.toLowerCase();
      for (const word of ['card number', 'security code', 'cvv', 'cvc', 'credit card']) {
        expect(haystack, `${status} must not name a ${word}`).not.toContain(word);
      }
    }
  });

  it('keeps settlementStatement aligned with the status it is asked about', () => {
    expect(settlementStatement('confirmed')).toContain('No payment has been taken');
    expect(settlementStatement('paid_offline')).toContain('received offline');
  });
});

describe('orderStatusEmail — what the customer must do next', () => {
  it('tells them how to settle at awaiting_payment, and repeats that nothing is paid', () => {
    const text = textFor('awaiting_payment');
    expect(text).toContain('store@example.com');
    expect(text).toContain('Nothing has been paid yet');
  });

  it('does not invent a contact address when the store has none', () => {
    const message = orderStatusEmail({ ...DATA, status: 'awaiting_payment', storeEmail: null });
    expect(message!.text).not.toContain('null');
    expect(message!.text).toContain('Please contact us to arrange payment');
  });

  it('carries an administrator note when one was written', () => {
    const text = textFor('confirmed');
    expect(text).not.toContain('A note from the team');

    const withNote = orderStatusEmail({ ...DATA, status: 'confirmed', note: 'Ready on Friday.' });
    expect(withNote!.text).toContain('Ready on Friday.');
  });
});

describe('orderStatusEmail — escaping', () => {
  it('escapes a customer name in the HTML part', () => {
    const message = orderStatusEmail({
      ...DATA,
      status: 'confirmed',
      customerName: '<img src=x onerror=alert(1)>',
    });
    expect(message!.html).not.toContain('<img src=x');
    expect(message!.html).toContain('&lt;img src=x');
  });

  it('escapes an administrator note in the HTML part', () => {
    const message = orderStatusEmail({
      ...DATA,
      status: 'confirmed',
      note: '<script>alert(1)</script>',
    });
    expect(message!.html).not.toContain('<script>');
    expect(message!.html).toContain('&lt;script&gt;');
  });

  it('escapes the item summary', () => {
    const message = orderStatusEmail({
      ...DATA,
      status: 'fulfilled',
      itemSummary: '<b>Bold</b> watch',
    });
    expect(message!.html).not.toContain('<b>Bold</b>');
    expect(message!.html).toContain('&lt;b&gt;Bold&lt;/b&gt;');
  });
});

describe('wrapEmailHtml', () => {
  it('produces a complete document, not a fragment', () => {
    const html = wrapEmailHtml({ title: 'Subject', preview: 'Preview', body: '<p>Hello</p>' });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html');
    expect(html).toContain('name="viewport"');
    expect(html).toContain('Subject');
    expect(html).toContain('<p>Hello</p>');
  });

  it('escapes the title, which comes from data in some templates', () => {
    const html = wrapEmailHtml({
      title: '<script>alert(1)</script>',
      preview: 'x',
      body: '',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('does not leak the preview text as visible body copy', () => {
    // The preview is hidden with a style, not omitted; a client that ignores the
    // style would show it, so it must be short and must not be the only content.
    const html = wrapEmailHtml({ title: 'S', preview: 'Short preview', body: '<p>Body</p>' });
    expect(html).toContain('Short preview');
    expect(html).toContain('<p>Body</p>');
  });
});

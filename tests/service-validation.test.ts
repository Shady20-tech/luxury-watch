import { describe, expect, it } from 'vitest';

import {
  appointmentSchema,
  contactSchema,
  fieldErrors,
  looksAutomated,
  offerSchema,
  repairSchema,
  safeDatabaseMessage,
  sellTradeSchema,
  sourcingSchema,
} from '@/lib/service/validation';

/**
 * Service-form validation.
 *
 * These schemas mirror the bounds `assert_submission_shape` enforces in SQL, so
 * the tests pin the two directions that matter: a well-formed submission is
 * accepted, and each bound is actually enforced rather than merely documented.
 * A schema that accepted everything would pass a happy-path test, so every rule
 * below is checked by an input that must fail.
 */

const base = {
  name: 'A Customer',
  email: 'customer@example.com',
  phone: '555 0100',
  company: '',
};

describe('sellTradeSchema', () => {
  const valid = {
    ...base,
    transactionType: 'sell',
    description: 'A watch I would like to sell.',
  };

  it('accepts a minimal well-formed request', () => {
    expect(sellTradeSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts the optional detail fields when supplied', () => {
    const parsed = sellTradeSchema.parse({
      ...valid,
      brandName: 'Example',
      modelName: 'Model',
      referenceNumber: 'REF-1',
      productionYear: '2019',
      hasBox: 'on',
      hasPapers: 'on',
      askingPriceCents: '125000',
    });
    expect(parsed.productionYear).toBe(2019);
    expect(parsed.hasBox).toBe(true);
    expect(parsed.askingPriceCents).toBe(125000);
  });

  it.each([
    ['a missing transaction type', { transactionType: undefined }],
    ['an unknown transaction type', { transactionType: 'donate' }],
    ['a blank description', { description: '   ' }],
    ['an over-long description', { description: 'x'.repeat(8001) }],
    ['a year before 1800', { productionYear: '1700' }],
    ['a year after 2200', { productionYear: '2300' }],
    ['a negative asking price', { askingPriceCents: '-1' }],
  ])('rejects %s', (_label, override) => {
    expect(sellTradeSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it('treats an empty optional field as absent rather than empty', () => {
    const parsed = sellTradeSchema.parse({ ...valid, brandName: '', productionYear: '' });
    expect(parsed.brandName).toBeUndefined();
    expect(parsed.productionYear).toBeUndefined();
  });
});

describe('sourcingSchema', () => {
  const valid = { ...base, notes: 'Looking for a steel sports watch.' };

  it('accepts a minimal request', () => {
    expect(sourcingSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a blank note', () => {
    expect(sourcingSchema.safeParse({ ...valid, notes: ' ' }).success).toBe(false);
  });

  it('accepts a budget as a whole number of minor units', () => {
    expect(sourcingSchema.parse({ ...valid, maxBudgetCents: '5000000' }).maxBudgetCents).toBe(
      5000000,
    );
  });
});

describe('repairSchema', () => {
  const valid = { ...base, description: 'The watch runs fast.' };

  it('accepts a minimal request', () => {
    expect(repairSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a preferred contact method', () => {
    expect(repairSchema.parse({ ...valid, preferredContact: 'phone' }).preferredContact).toBe(
      'phone',
    );
  });

  it('rejects an unknown preferred contact method', () => {
    expect(repairSchema.safeParse({ ...valid, preferredContact: 'carrier-pigeon' }).success).toBe(
      false,
    );
  });
});

describe('contactSchema', () => {
  const valid = { ...base, message: 'Do you have this piece in steel?' };

  it('accepts a message', () => {
    expect(contactSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a blank message', () => {
    expect(contactSchema.safeParse({ ...valid, message: '' }).success).toBe(false);
  });
});

describe('offerSchema', () => {
  const valid = { ...base, productSlug: 'test-watch', amount: '1200.50' };

  it('accepts an offer on a product', () => {
    const parsed = offerSchema.parse(valid);
    expect(parsed.amount).toBe(1200.5);
  });

  it.each([
    ['a missing product', { productSlug: '' }],
    ['a zero offer', { amount: '0' }],
    ['a negative offer', { amount: '-100' }],
    ['a non-numeric offer', { amount: 'a lot' }],
  ])('rejects %s', (_label, override) => {
    expect(offerSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe('appointmentSchema', () => {
  const valid = {
    ...base,
    purpose: 'showroom_visit',
    slotStart: '2026-11-02T14:00:00.000Z',
  };

  it('accepts a request for an offered slot', () => {
    expect(appointmentSchema.safeParse(valid).success).toBe(true);
  });

  it('defaults the purpose when it is omitted', () => {
    const { purpose: _purpose, ...withoutPurpose } = valid;
    expect(appointmentSchema.parse(withoutPurpose).purpose).toBe('showroom_visit');
  });

  it.each([
    ['an unknown purpose', { purpose: 'lunch' }],
    ['an unparseable time', { slotStart: 'next Tuesday' }],
    ['an empty time', { slotStart: '' }],
  ])('rejects %s', (_label, override) => {
    expect(appointmentSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });
});

describe('safeDatabaseMessage', () => {
  it('passes through a message the functions raise deliberately', () => {
    expect(
      safeDatabaseMessage(new Error('That time has just been taken. Please choose another.')),
    ).toContain('just been taken');
  });

  it('does not pass through an arbitrary Postgres error', () => {
    // The direction is the point: an allowlist turns anything unrecognised into a
    // generic failure, so a constraint name or a row fragment cannot reach the
    // page. A denylist would let this one through.
    expect(
      safeDatabaseMessage(
        new Error('duplicate key value violates unique constraint "appointments_slot_key"'),
      ),
    ).toBeNull();
  });

  it('does not pass through a message that merely contains a known phrase', () => {
    expect(safeDatabaseMessage(new Error('Unknown product for user 1234 at row 9'))).toContain(
      'Unknown product',
    );
  });
});

describe('fieldErrors', () => {
  it('keeps only the first issue per allowed field', () => {
    const result = sellTradeSchema.safeParse({ ...base, transactionType: 'x', description: '' });
    expect(result.success).toBe(false);
    if (result.success) return;

    const mapped = fieldErrors(result.error, ['transactionType', 'description'] as const);
    expect(Object.keys(mapped).sort()).toEqual(['description', 'transactionType']);
  });

  it('drops a field the form does not render', () => {
    const result = contactSchema.safeParse({ ...base, message: '' });
    expect(result.success).toBe(false);
    if (result.success) return;

    const mapped = fieldErrors(result.error, ['name'] as const);
    expect(mapped).toEqual({});
  });
});

describe('looksAutomated', () => {
  it('treats a filled honeypot as automated', () => {
    expect(looksAutomated('Acme Ltd')).toBe(true);
  });

  it('treats a blank or absent honeypot as a person', () => {
    expect(looksAutomated('')).toBe(false);
    expect(looksAutomated('   ')).toBe(false);
    expect(looksAutomated(undefined)).toBe(false);
  });
});

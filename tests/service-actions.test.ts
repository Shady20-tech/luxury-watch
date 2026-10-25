import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The service-form server actions.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS BEING TESTED, AND WHAT IS SUBSTITUTED
 * -----------------------------------------------------------------------------
 *
 * The actions are the boundary between a browser submission and the database.
 * Three behaviours matter there and are asserted directly:
 *
 *   1. A honeypot submission is accepted in shape but never reaches the
 *      repository — no row, no email, and no signal that the bot was detected.
 *   2. A malformed submission returns per-field messages and, again, never
 *      reaches the repository.
 *   3. On success only the reference is returned. The submitted name, email,
 *      phone and message are personal data and must not be echoed back.
 *
 * The repository and the notification service are substituted because they are
 * the network and the database; the action's own logic — validation, the
 * honeypot, the shape of the response — is the real code under test. The
 * repository mocks record their calls so "did not reach the repository" is an
 * assertion, not an assumption.
 */
vi.mock('server-only', () => ({}));

const env = { configured: true };
vi.mock('@/lib/env', () => ({
  isSupabaseConfigured: () => env.configured,
}));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('@/lib/logger', () => ({ logger }));

const repository = {
  submitSellTradeRequest: vi.fn(),
  submitSourcingRequest: vi.fn(),
  submitRepairRequest: vi.fn(),
  submitContactMessage: vi.fn(),
  submitProductOffer: vi.fn(),
  requestAppointment: vi.fn(),
};
vi.mock('@/server/repositories/service-repository', () => repository);

const notify = vi.fn();
vi.mock('@/server/services/service-notification-service', () => ({
  notifyServiceRequestSubmitted: notify,
}));

const { submitSellTradeAction, submitContactAction, submitOfferAction, requestAppointmentAction } =
  await import('@/server/actions/service-actions');

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const validSellTrade = {
  name: 'A Customer',
  email: 'customer@example.com',
  phone: '555 0100',
  transactionType: 'sell',
  description: 'A watch I would like to sell.',
};

beforeEach(() => {
  vi.clearAllMocks();
  env.configured = true;
  repository.submitSellTradeRequest.mockResolvedValue('INQ-26-000123');
  repository.submitContactMessage.mockResolvedValue('INQ-26-000124');
  repository.submitProductOffer.mockResolvedValue('INQ-26-000125');
  repository.requestAppointment.mockResolvedValue('INQ-26-000126');
  notify.mockResolvedValue(undefined);
});

describe('submitSellTradeAction', () => {
  it('returns the reference on a valid submission', async () => {
    const result = await submitSellTradeAction({ status: 'idle' }, form(validSellTrade));
    expect(result).toEqual({ status: 'success', reference: 'INQ-26-000123' });
  });

  it('does not echo the submitted personal data back', async () => {
    const result = await submitSellTradeAction({ status: 'idle' }, form(validSellTrade));
    // The success payload carries the reference and nothing else. A name or an
    // address in the response would be personal data reflected to the client and,
    // with it, into any log that records the result.
    expect(JSON.stringify(result)).not.toContain('customer@example.com');
    expect(JSON.stringify(result)).not.toContain('A Customer');
  });

  it('passes the validated input to the repository', async () => {
    await submitSellTradeAction({ status: 'idle' }, form(validSellTrade));
    expect(repository.submitSellTradeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'customer@example.com', transactionType: 'sell' }),
    );
  });

  it('rejects an invalid submission with per-field messages and no write', async () => {
    const result = await submitSellTradeAction(
      { status: 'idle' },
      form({ ...validSellTrade, email: 'not-an-email' }),
    );
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.fieldErrors?.email).toBeTruthy();
    expect(repository.submitSellTradeRequest).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('accepts a honeypot submission without a write or a notification', async () => {
    const result = await submitSellTradeAction(
      { status: 'idle' },
      form({ ...validSellTrade, company: 'Acme Ltd' }),
    );
    // Shaped like a success, so a bot gets no signal it was caught...
    expect(result.status).toBe('success');
    // ...but nothing was written and no mail was sent.
    expect(repository.submitSellTradeRequest).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports a deliberate database message as-is', async () => {
    repository.submitSellTradeRequest.mockRejectedValue(
      new Error(
        'Too many submissions have been received from this address. Please try again later.',
      ),
    );
    const result = await submitSellTradeAction({ status: 'idle' }, form(validSellTrade));
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.message).toContain('Too many submissions');
  });

  it('hides an unrecognised database error behind a generic message', async () => {
    repository.submitSellTradeRequest.mockRejectedValue(
      new Error('duplicate key value violates unique constraint "inquiries_reference_key"'),
    );
    const result = await submitSellTradeAction({ status: 'idle' }, form(validSellTrade));
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.message).not.toContain('constraint');
    expect(result.message).not.toContain('inquiries_reference_key');
  });

  it('reports the form as unavailable when Supabase is not configured', async () => {
    env.configured = false;
    const result = await submitSellTradeAction({ status: 'idle' }, form(validSellTrade));
    expect(result.status).toBe('error');
    expect(repository.submitSellTradeRequest).not.toHaveBeenCalled();
  });
});

describe('submitContactAction', () => {
  const valid = { name: 'A Customer', email: 'customer@example.com', message: 'Hello.' };

  it('returns the reference on a valid message', async () => {
    const result = await submitContactAction({ status: 'idle' }, form(valid));
    expect(result).toEqual({ status: 'success', reference: 'INQ-26-000124' });
  });

  it('rejects an empty message without writing', async () => {
    const result = await submitContactAction({ status: 'idle' }, form({ ...valid, message: '' }));
    expect(result.status).toBe('error');
    expect(repository.submitContactMessage).not.toHaveBeenCalled();
  });
});

describe('submitOfferAction', () => {
  const valid = {
    productSlug: 'test-watch',
    name: 'A Customer',
    email: 'customer@example.com',
    amount: '1200.50',
  };

  it('converts the major-unit amount to minor units exactly once', async () => {
    await submitOfferAction({ status: 'idle' }, form(valid));
    // 1200.50 in major units is 120050 minor units. The conversion happens in the
    // action and the database re-validates the integer, so a rounding drift here
    // would be visible as a wrong stored amount rather than a silent one.
    expect(repository.submitProductOffer).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 120050 }),
    );
  });

  it('rejects a non-positive amount without writing', async () => {
    const result = await submitOfferAction({ status: 'idle' }, form({ ...valid, amount: '0' }));
    expect(result.status).toBe('error');
    expect(repository.submitProductOffer).not.toHaveBeenCalled();
  });
});

describe('requestAppointmentAction', () => {
  const valid = {
    name: 'A Customer',
    email: 'customer@example.com',
    purpose: 'showroom_visit',
    slotStart: '2026-11-02T14:00:00.000Z',
  };

  it('returns the reference for a requested slot', async () => {
    const result = await requestAppointmentAction({ status: 'idle' }, form(valid));
    expect(result).toEqual({ status: 'success', reference: 'INQ-26-000126' });
  });

  it('rejects an unreadable time without writing', async () => {
    const result = await requestAppointmentAction(
      { status: 'idle' },
      form({ ...valid, slotStart: 'next Tuesday' }),
    );
    expect(result.status).toBe('error');
    expect(repository.requestAppointment).not.toHaveBeenCalled();
  });
});

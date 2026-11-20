import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The email transport.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS BEING TESTED, AND WHY IT IS NOT MOCKED AWAY
 * -----------------------------------------------------------------------------
 *
 * The behaviour that matters is what happens at the boundaries: with no key
 * configured, and when the provider answers with an error. Both are exercised
 * against the real `sendEmail`, with only two things substituted — the
 * environment (so a test can be "configured" or not) and the network (`fetch`).
 * The request body is asserted, so a change to the payload shape fails here.
 *
 * `server-only` is stubbed because it throws by design outside a Server
 * Component, and the transport is a server module. Stubbing it does not weaken
 * the test: the guarantee it provides is a build-time one, and it is asserted
 * separately by the build.
 */
vi.mock('server-only', () => ({}));

const env = {
  resendApiKey: undefined as string | undefined,
  resendFromEmail: undefined as string | undefined,
  resendFromName: undefined as string | undefined,
  resendReplyToEmail: undefined as string | undefined,
  resendAdminEmail: undefined as string | undefined,
};

vi.mock('@/lib/env.server', () => ({
  getServerEnv: () => env,
  isEmailConfigured: () => Boolean(env.resendApiKey && env.resendFromEmail),
}));

/**
 * The identity module is substituted here because it reads a table. What this
 * file is about is the *payload* the transport sends, so the identity is a fixed
 * input. The precedence it represents is tested in `email-identity.test.ts`.
 */
const identity = {
  fromAddress: 'store@example.com' as string | null,
  fromName: null as string | null,
  replyTo: null as string | null,
};

vi.mock('@/lib/email/identity', () => ({
  resolveMailIdentity: async () => identity,
}));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('@/lib/logger', () => ({ logger }));

const MESSAGE = {
  to: 'customer@example.com',
  subject: 'Order request received — LW-26-100001',
  text: 'A request was received.',
  html: '<p>A request was received.</p>',
};

describe('sendEmail', () => {
  beforeEach(() => {
    env.resendApiKey = undefined;
    env.resendFromEmail = undefined;
    env.resendFromName = undefined;
    env.resendReplyToEmail = undefined;
    identity.fromAddress = 'store@example.com';
    identity.fromName = null;
    identity.replyTo = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs instead of sending when no key is configured, and does not fail', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { sendEmail } = await import('@/lib/email/transport');
    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ status: 'skipped', reason: 'not-configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'email.skipped',
      expect.objectContaining({ to: MESSAGE.to, subject: MESSAGE.subject }),
    );
  });

  it('sends the message and reports the provider id when configured', async () => {
    env.resendApiKey = 'test-key';
    env.resendFromEmail = 'store@example.com';

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg_123' }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { sendEmail } = await import('@/lib/email/transport');
    const result = await sendEmail(MESSAGE);

    expect(result).toEqual({ status: 'sent', id: 'msg_123' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-key');

    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      from: 'store@example.com',
      to: ['customer@example.com'],
      subject: MESSAGE.subject,
      text: MESSAGE.text,
      html: MESSAGE.html,
    });
  });

  it('reports a provider error without throwing, so a placed order survives', async () => {
    env.resendApiKey = 'test-key';
    env.resendFromEmail = 'store@example.com';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ message: 'Invalid to field' }),
      }),
    );

    const { sendEmail } = await import('@/lib/email/transport');
    const result = await sendEmail(MESSAGE);

    expect(result).toMatchObject({ status: 'failed' });
    expect(logger.warn).toHaveBeenCalledWith(
      'email.send_failed',
      expect.objectContaining({ to: MESSAGE.to }),
    );
  });

  it('reports a network failure without throwing', async () => {
    env.resendApiKey = 'test-key';
    env.resendFromEmail = 'store@example.com';

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));

    const { sendEmail } = await import('@/lib/email/transport');
    const result = await sendEmail(MESSAGE);

    expect(result).toMatchObject({ status: 'failed', reason: 'socket hang up' });
  });

  it('sends the bare address when no display name is configured', async () => {
    env.resendApiKey = 'test-key';
    env.resendFromEmail = 'store@example.com';

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'm' }) });
    vi.stubGlobal('fetch', fetchSpy);

    const { sendEmail } = await import('@/lib/email/transport');
    await sendEmail(MESSAGE);

    expect(JSON.parse(fetchSpy.mock.calls[0]![1].body).from).toBe('store@example.com');
  });

  it('puts the display name beside the address, quoted', async () => {
    env.resendApiKey = 'test-key';
    env.resendFromEmail = 'store@example.com';
    identity.fromName = 'Maison Horlogère';

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'm' }) });
    vi.stubGlobal('fetch', fetchSpy);

    const { sendEmail } = await import('@/lib/email/transport');
    await sendEmail(MESSAGE);

    expect(JSON.parse(fetchSpy.mock.calls[0]![1].body).from).toBe(
      '"Maison Horlogère" <store@example.com>',
    );
  });

  it('cannot be made to add a second recipient through the display name', async () => {
    env.resendApiKey = 'test-key';
    env.resendFromEmail = 'store@example.com';
    // A value an administrator could type. A comma or an angle bracket left
    // unescaped would let it be read as a second address.
    identity.fromName = 'Store, evil@example.com <x>';

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'm' }) });
    vi.stubGlobal('fetch', fetchSpy);

    const { sendEmail } = await import('@/lib/email/transport');
    await sendEmail(MESSAGE);

    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body);
    expect(body.from).toBe('"Store, evil@example.com <x>" <store@example.com>');
    expect(body.to).toEqual(['customer@example.com']);
  });

  it('sends reply_to when one is resolved', async () => {
    env.resendApiKey = 'test-key';
    env.resendFromEmail = 'store@example.com';
    identity.replyTo = 'hello@example.com';

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'm' }) });
    vi.stubGlobal('fetch', fetchSpy);

    const { sendEmail } = await import('@/lib/email/transport');
    await sendEmail(MESSAGE);

    expect(JSON.parse(fetchSpy.mock.calls[0]![1].body).reply_to).toBe('hello@example.com');
  });

  it('lets a message override the configured reply-to', async () => {
    env.resendApiKey = 'test-key';
    env.resendFromEmail = 'store@example.com';
    identity.replyTo = 'hello@example.com';

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'm' }) });
    vi.stubGlobal('fetch', fetchSpy);

    const { sendEmail } = await import('@/lib/email/transport');
    await sendEmail({ ...MESSAGE, replyTo: 'order-desk@example.com' });

    expect(JSON.parse(fetchSpy.mock.calls[0]![1].body).reply_to).toBe('order-desk@example.com');
  });

  it('omits reply_to entirely when none is configured', async () => {
    env.resendApiKey = 'test-key';
    env.resendFromEmail = 'store@example.com';

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'm' }) });
    vi.stubGlobal('fetch', fetchSpy);

    const { sendEmail } = await import('@/lib/email/transport');
    await sendEmail(MESSAGE);

    // Absent, not null: an explicit null is a header Resend may reject.
    expect('reply_to' in JSON.parse(fetchSpy.mock.calls[0]![1].body)).toBe(false);
  });

  it('does not log the message body, which can carry a customer address', async () => {
    env.resendApiKey = 'test-key';
    env.resendFromEmail = 'store@example.com';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'msg_1' }) }),
    );

    const { sendEmail } = await import('@/lib/email/transport');
    await sendEmail({ ...MESSAGE, text: '1 Example Street, Geneva' });

    for (const call of logger.info.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('1 Example Street');
    }
  });
});

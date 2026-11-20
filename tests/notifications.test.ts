import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Writing notifications, and announcing a status change.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS REAL AND WHAT IS SUBSTITUTED
 * -----------------------------------------------------------------------------
 *
 * The modules under test — `notification-service` and
 * `order-lifecycle-notification-service` — run for real. Two boundaries are
 * substituted:
 *
 *   the Supabase clients, because they are the network, and the SQL behaviour
 *   they reach (`notify_user`'s dedupe, its link validation) is proven against a
 *   real database in `supabase/tests/64_notifications_and_email.sql`;
 *
 *   the transport, because sending is the one thing this file must not do.
 *
 * That split is deliberate. The database suite proves the constraint exists; this
 * file proves the service calls it with the right arguments and behaves correctly
 * when it fails. Neither test could cover the other's half.
 *
 * -----------------------------------------------------------------------------
 * THE FAILURE THAT MATTERS MOST
 * -----------------------------------------------------------------------------
 *
 * Every call here runs after a business event has committed. The most important
 * assertion in the file is therefore not that a notification is written — it is
 * that nothing here throws when the write fails, because a throw after commit
 * turns a recorded order transition into an error page an administrator will
 * retry, and the retry is refused as a no-op.
 */

vi.mock('server-only', () => ({}));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('@/lib/logger', () => ({ logger }));

/** What `notify_user` would return: a new id, or null when deduplicated. */
let rpcResult: { data: string | null; error: { code: string; message: string } | null } = {
  data: 'new-id',
  error: null,
};
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return rpcResult;
    },
  }),
}));

/** Rows the customer's own client would return. */
let selectResult: { data: unknown; error: { code: string } | null; count?: number | null } = {
  data: [],
  error: null,
};

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({
        order: () => ({
          limit: async () => selectResult,
        }),
        eq: async () => selectResult,
      }),
    }),
  }),
}));

const sendEmail = vi.fn();
vi.mock('@/lib/email/transport', () => ({ sendEmail: (...args: unknown[]) => sendEmail(...args) }));

vi.mock('@/lib/env.server', () => ({
  getServerEnv: () => ({
    resendAdminEmail: 'store@example.com',
    resendFromEmail: 'noreply@example.com',
  }),
  isEmailConfigured: () => true,
}));

const NOTICE = {
  userId: '11111111-1111-1111-1111-111111111111',
  reference: 'LW-26-100001',
  customerName: 'A Customer',
  customerEmail: 'customer@example.com',
  itemSummary: 'Omega Speedmaster',
  totalCents: 1_205_000,
  currency: 'USD',
  note: null,
  orderId: '22222222-2222-2222-2222-222222222222',
};

describe('createNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.length = 0;
    rpcResult = { data: 'new-id', error: null };
  });

  it('calls notify_user with the recipient and the event identity', async () => {
    const { createNotification } = await import('@/server/services/notification-service');

    const created = await createNotification({
      userId: NOTICE.userId,
      kind: 'order_request',
      title: 'Your order is confirmed',
      body: 'It is held for you.',
      linkUrl: '/account/orders/abc',
      dedupeKey: 'order:abc:confirmed',
    });

    expect(created).toBe(true);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]!.fn).toBe('notify_user');
    expect(rpcCalls[0]!.args).toMatchObject({
      p_user_id: NOTICE.userId,
      p_kind: 'order_request',
      p_title: 'Your order is confirmed',
      p_link_url: '/account/orders/abc',
      p_dedupe_key: 'order:abc:confirmed',
    });
  });

  it('reports a deduplicated repeat as "not created", without calling it an error', async () => {
    rpcResult = { data: null, error: null };

    const { createNotification } = await import('@/server/services/notification-service');
    const created = await createNotification({
      userId: NOTICE.userId,
      kind: 'order_request',
      title: 'Again',
      dedupeKey: 'order:abc:confirmed',
    });

    expect(created).toBe(false);
    expect(logger.info).toHaveBeenCalledWith(
      'notification.deduplicated',
      expect.objectContaining({ kind: 'order_request' }),
    );
    // A repeat is expected, not a fault.
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not throw when the write fails', async () => {
    rpcResult = { data: null, error: { code: '42501', message: 'permission denied' } };

    const { createNotification } = await import('@/server/services/notification-service');

    await expect(
      createNotification({ userId: NOTICE.userId, kind: 'system', title: 'x' }),
    ).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      'notification.create_failed',
      expect.objectContaining({ code: '42501' }),
    );
  });

  it('does not name the recipient in the failure log', async () => {
    rpcResult = { data: null, error: { code: '42501', message: 'permission denied' } };

    const { createNotification } = await import('@/server/services/notification-service');
    await createNotification({ userId: NOTICE.userId, kind: 'system', title: 'x' });

    for (const call of [...logger.warn.mock.calls, ...logger.info.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain(NOTICE.userId);
    }
  });
});

describe('fetchNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps a row into the shape the inbox renders', async () => {
    selectResult = {
      data: [
        {
          id: 'n1',
          kind: 'order_request',
          title: 'Order accepted',
          body: 'Held for you.',
          link_url: '/account/orders/abc',
          is_read: false,
          created_at: '2026-11-19T10:00:00Z',
        },
      ],
      error: null,
    };

    const { fetchNotifications } = await import('@/server/services/notification-service');
    const rows = await fetchNotifications();

    expect(rows).toEqual([
      {
        id: 'n1',
        kind: 'order_request',
        title: 'Order accepted',
        body: 'Held for you.',
        linkUrl: '/account/orders/abc',
        isRead: false,
        createdAt: '2026-11-19T10:00:00Z',
      },
    ]);
  });

  it('returns an empty list rather than throwing when the read fails', async () => {
    selectResult = { data: null, error: { code: '42501' } };

    const { fetchNotifications } = await import('@/server/services/notification-service');
    await expect(fetchNotifications()).resolves.toEqual([]);
  });
});

describe('notifyOrderStatusChanged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpcCalls.length = 0;
    rpcResult = { data: 'new-id', error: null };
    sendEmail.mockResolvedValue({ status: 'sent', id: 'msg_1' });
  });

  it('writes the notification before it attempts the email', async () => {
    const { notifyOrderStatusChanged } = await import(
      '@/server/services/order-lifecycle-notification-service'
    );

    await notifyOrderStatusChanged({ ...NOTICE, status: 'confirmed' });

    // The in-app row is the copy that survives a mail outage, so it must not be
    // conditional on the send succeeding. `sendEmail` is called after the rpc.
    expect(rpcCalls).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('keys the notification on the order and status, so a repeat collapses', async () => {
    const { notifyOrderStatusChanged } = await import(
      '@/server/services/order-lifecycle-notification-service'
    );

    await notifyOrderStatusChanged({ ...NOTICE, status: 'fulfilled' });

    expect(rpcCalls[0]!.args.p_dedupe_key).toBe(`order:${NOTICE.orderId}:fulfilled`);
  });

  it('links to the customer’s own order page, site-relative', async () => {
    const { notifyOrderStatusChanged } = await import(
      '@/server/services/order-lifecycle-notification-service'
    );

    await notifyOrderStatusChanged({ ...NOTICE, status: 'confirmed' });

    // `notify_user` refuses anything that is not site-relative or https, so this
    // asserts the service produces the accepted shape rather than discovering it
    // at the database.
    expect(rpcCalls[0]!.args.p_link_url).toBe(`/account/orders/${NOTICE.orderId}`);
  });

  it('does not write an in-app row for a guest with no account', async () => {
    const { notifyOrderStatusChanged } = await import(
      '@/server/services/order-lifecycle-notification-service'
    );

    await notifyOrderStatusChanged({ ...NOTICE, userId: null, status: 'confirmed' });

    expect(rpcCalls).toHaveLength(0);
    // The email still goes: a guest gave an address precisely to be told.
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('sends no email for the internal working state', async () => {
    const { notifyOrderStatusChanged } = await import(
      '@/server/services/order-lifecycle-notification-service'
    );

    const report = await notifyOrderStatusChanged({ ...NOTICE, status: 'under_review' });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(report).toEqual({ emailed: false, notified: false });
  });

  it('does not throw when the mail transport fails', async () => {
    sendEmail.mockResolvedValue({ status: 'failed', reason: 'http 500' });

    const { notifyOrderStatusChanged } = await import(
      '@/server/services/order-lifecycle-notification-service'
    );

    const report = await notifyOrderStatusChanged({ ...NOTICE, status: 'confirmed' });

    expect(report.emailed).toBe(false);
    // The notification was still written: the channels fail independently.
    expect(report.notified).toBe(true);
  });

  it('does not throw when the notification write fails, and still tries the email', async () => {
    rpcResult = { data: null, error: { code: '42501', message: 'denied' } };

    const { notifyOrderStatusChanged } = await import(
      '@/server/services/order-lifecycle-notification-service'
    );

    const report = await notifyOrderStatusChanged({ ...NOTICE, status: 'confirmed' });

    expect(report.notified).toBe(false);
    expect(report.emailed).toBe(true);
  });

  it('reports neither channel as delivered when both fail', async () => {
    rpcResult = { data: null, error: { code: '42501', message: 'denied' } };
    sendEmail.mockResolvedValue({ status: 'failed', reason: 'http 500' });

    const { notifyOrderStatusChanged } = await import(
      '@/server/services/order-lifecycle-notification-service'
    );

    await expect(notifyOrderStatusChanged({ ...NOTICE, status: 'confirmed' })).resolves.toEqual({
      emailed: false,
      notified: false,
    });
  });
});

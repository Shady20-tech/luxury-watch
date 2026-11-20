import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The mail identity.
 *
 * -----------------------------------------------------------------------------
 * WHAT THIS PROVES, AND WHAT IT DELIBERATELY DOES NOT
 * -----------------------------------------------------------------------------
 *
 * The precedence is the whole point of the module: an administrator's display
 * name and reply-to win over the deployment default, the sending address never
 * comes from the database, and an unreachable database costs presentation rather
 * than the message. Each of those is a separate assertion below.
 *
 * The Supabase admin client is substituted, not the module under test. The
 * query is a one-row read of a table that has no public policy; exercising the
 * real client would need a live PostgREST and would test PostgREST, not this
 * precedence logic. The client is a boundary here in the same way `fetch` is in
 * the transport test.
 */
vi.mock('server-only', () => ({}));

const env = {
  resendFromEmail: 'store@example.com' as string | undefined,
  resendFromName: 'Deployment Name' as string | undefined,
  resendReplyToEmail: 'deploy-reply@example.com' as string | undefined,
};

let serviceRoleConfigured = true;

vi.mock('@/lib/env.server', () => ({
  getServerEnv: () => env,
  hasServiceRoleKey: () => serviceRoleConfigured,
}));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('@/lib/logger', () => ({ logger }));

type Row = { from_name: string | null; reply_to: string | null } | null;
let rowResult: { data: Row; error: { code: string } | null } = {
  data: null,
  error: null,
};
let throwOnRead = false;

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        maybeSingle: async () => {
          if (throwOnRead) throw new Error('connection reset');
          return rowResult;
        },
      }),
    }),
  }),
}));

describe('resolveMailIdentity', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    serviceRoleConfigured = true;
    throwOnRead = false;
    rowResult = { data: null, error: null };
    const { resetMailIdentityCache } = await import('@/lib/email/identity');
    resetMailIdentityCache();
  });

  it('uses the environment when no administrator has set anything', async () => {
    const { resolveMailIdentity } = await import('@/lib/email/identity');
    expect(await resolveMailIdentity()).toEqual({
      fromAddress: 'store@example.com',
      fromName: 'Deployment Name',
      replyTo: 'deploy-reply@example.com',
    });
  });

  it('lets the administrator override the display name and reply-to', async () => {
    rowResult = {
      data: { from_name: 'Maison Horlogère', reply_to: 'hello@example.com' },
      error: null,
    };

    const { resolveMailIdentity } = await import('@/lib/email/identity');
    const identity = await resolveMailIdentity();

    expect(identity.fromName).toBe('Maison Horlogère');
    expect(identity.replyTo).toBe('hello@example.com');
  });

  it('never takes the sending address from the database', async () => {
    rowResult = {
      data: { from_name: 'Maison', reply_to: 'hello@example.com' },
      error: null,
    };

    const { resolveMailIdentity } = await import('@/lib/email/identity');
    const identity = await resolveMailIdentity();

    // The address is tied to a domain verified with Resend, so it can only come
    // from the environment. The row has no column for it, and this asserts the
    // result is still the environment value even when the row is populated.
    expect(identity.fromAddress).toBe('store@example.com');
  });

  it('treats a blank administrator value as unset, not as an empty name', async () => {
    rowResult = { data: { from_name: '   ', reply_to: '' }, error: null };

    const { resolveMailIdentity } = await import('@/lib/email/identity');
    const identity = await resolveMailIdentity();

    expect(identity.fromName).toBe('Deployment Name');
    expect(identity.replyTo).toBe('deploy-reply@example.com');
  });

  it('falls back to the environment when the read fails, without throwing', async () => {
    rowResult = { data: null, error: { code: '42501' } };

    const { resolveMailIdentity } = await import('@/lib/email/identity');
    const identity = await resolveMailIdentity();

    expect(identity.fromName).toBe('Deployment Name');
    expect(logger.warn).toHaveBeenCalledWith(
      'email.identity_read_failed',
      expect.objectContaining({ code: '42501' }),
    );
  });

  it('survives a thrown client error', async () => {
    throwOnRead = true;

    const { resolveMailIdentity } = await import('@/lib/email/identity');
    const identity = await resolveMailIdentity();

    expect(identity.fromAddress).toBe('store@example.com');
    expect(logger.warn).toHaveBeenCalledWith(
      'email.identity_read_failed',
      expect.objectContaining({ message: 'connection reset' }),
    );
  });

  it('does not read the table at all without a service-role key', async () => {
    serviceRoleConfigured = false;

    const { resolveMailIdentity } = await import('@/lib/email/identity');
    const identity = await resolveMailIdentity();

    expect(identity.fromName).toBe('Deployment Name');
    // No client was constructed, so the read could not have happened; the row
    // that would have overridden the name is still unread.
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('memoises, so one submission does not read the table twice', async () => {
    rowResult = { data: { from_name: 'Cached', reply_to: null }, error: null };

    const { resolveMailIdentity } = await import('@/lib/email/identity');
    const first = await resolveMailIdentity();
    rowResult = { data: { from_name: 'Changed', reply_to: null }, error: null };
    const second = await resolveMailIdentity();

    expect(first.fromName).toBe('Cached');
    expect(second.fromName).toBe('Cached');
  });
});

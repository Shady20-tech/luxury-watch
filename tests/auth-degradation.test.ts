import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetPublicEnvCache } from '@/lib/env';
import { getAuthUser } from '@/server/repositories/auth-repository';

// `server-only` throws outside a Server Component by design; stubbing it is what
// lets the real repository module load in a node test.
vi.mock('server-only', () => ({}));

/**
 * `getAuthUser` must answer `null`, never throw, when there is no auth backend.
 *
 * This is the regression guard for a build-breaking defect. `getAuthUser` is
 * called from the render of `/login`, `/register`, `/reset-password` and the
 * account guard. It used to call `createSupabaseServerClient()` directly, which
 * throws when the environment is unconfigured, so `next build` failed while
 * prerendering those pages — and CI's build step runs with placeholder values
 * and no Supabase project, so it failed there too. Every other service in this
 * repository fails closed; this one did not.
 *
 * The test asserts the property rather than the implementation: with no Supabase
 * configuration, the call resolves to `null`. That is both the honest answer (an
 * unconfigured deployment has no sessions) and the safe one (a caller treats
 * `null` as signed-out, so the worst outcome is asking someone to sign in again).
 */
const MANAGED_KEYS = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of MANAGED_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetPublicEnvCache();
});

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetPublicEnvCache();
});

describe('getAuthUser without a configured backend', () => {
  it('resolves to null rather than throwing', async () => {
    await expect(getAuthUser()).resolves.toBeNull();
  });
});

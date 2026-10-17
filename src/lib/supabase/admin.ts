/**
 * Privileged Supabase client using the service-role key.
 *
 * `server-only` is imported first on purpose: the build fails if this module is
 * ever pulled into a client bundle. That is the guard that keeps the
 * service-role key — which bypasses Row Level Security entirely — on the
 * server.
 *
 * Every call site must still perform its own authorisation check. Bypassing RLS
 * does not bypass authorisation.
 */
import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { getPublicEnv } from '@/lib/env';
import { requireServiceRoleKey } from '@/lib/env.server';
import type { Database } from '@/lib/database.types';

let cached: ReturnType<typeof createClient<Database>> | undefined;

/**
 * Create (or reuse) the service-role client. Throws when the key is absent, so
 * a missing secret surfaces as a clear error at the point of use rather than
 * as an unexpected permission failure later.
 */
export function createSupabaseAdminClient() {
  if (cached) return cached;

  const { supabaseUrl } = getPublicEnv();
  if (!supabaseUrl) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not set, so the service-role client cannot be created.',
    );
  }

  cached = createClient<Database>(supabaseUrl, requireServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cached;
}

/** Reset the memoised client. Tests only. */
export function resetSupabaseAdminClient(): void {
  cached = undefined;
}

import { createBrowserClient } from '@supabase/ssr';

import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/lib/database.types';

/**
 * Supabase client for Client Components.
 *
 * Uses only the publishable anon key, so Row Level Security is what protects
 * the data. This module must never import `env.server.ts` or the service-role
 * key.
 */
export function createSupabaseBrowserClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY in the Vercel dashboard and in your local .env.local.',
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

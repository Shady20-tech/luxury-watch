import { createClient } from '@supabase/supabase-js';

import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/lib/database.types';

/**
 * A cookie-less, read-only Supabase client using the publishable anon key.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS EXISTS SEPARATELY FROM `server.ts`
 * -----------------------------------------------------------------------------
 *
 * `createSupabaseServerClient()` reads the request's cookies, because it is
 * shared with the session-bearing routes. Reading cookies makes a route dynamic
 * in Next.js. That is correct for a page whose content depends on who is asking,
 * and wrong for one whose content is the same for everybody:
 *
 *  - The sitemap is fetched by crawlers, repeatedly, and should be cacheable.
 *    Forcing it dynamic means every crawl re-queries the database.
 *  - A route that is prerendered at build time cannot read cookies at all.
 *
 * The anon key and RLS are the same as the cookie client's, so this sees exactly
 * the rows an anonymous visitor would: active brands, active collections,
 * published products. It simply does not carry a session, which is the honest
 * description of "a crawler".
 *
 * It does not import `server-only`, because it is also usable from a build-time
 * or cached context where the module graph is otherwise public. It never touches
 * a privileged key, so there is nothing here to leak.
 */
export function createSupabasePublicClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY before creating a public client.',
    );
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/lib/database.types';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Sessions are stored in cookies through the `@supabase/ssr` cookie API. Two
 * distinct call sites exist because Next.js only allows cookies to be written
 * in a Server Action or Route Handler, never during the render of a Server
 * Component:
 *
 *   - `createSupabaseServerClient()` — read-only. Safe anywhere on the server.
 *     Its `setAll` swallows the write error that Next.js raises when a Server
 *     Component tries to mutate cookies.
 *   - `createSupabaseServerClientWritable()` — use in Server Actions and Route
 *     Handlers, where cookie writes are legal, so refreshed tokens persist.
 *
 * Only the publishable anon key is used. RLS protects the data. Privileged
 * access lives in `admin.ts`, which is separately guarded.
 */
export async function createSupabaseServerClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY in the Vercel dashboard and in your local .env.local.',
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Thrown when called during a Server Component render, where Next.js
          // forbids cookie writes. Safe to ignore: middleware refreshes the
          // session and persists it, so the token is not lost.
        }
      },
    },
  });
}

/**
 * Same as `createSupabaseServerClient`, but for Server Actions and Route
 * Handlers where writing cookies is permitted. Refreshed auth tokens are
 * persisted so the session does not silently expire.
 */
export async function createSupabaseServerClientWritable() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY in the Vercel dashboard and in your local .env.local.',
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}

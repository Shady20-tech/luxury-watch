import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { getPublicEnv } from '@/lib/env';
import type { Database } from '@/lib/database.types';

/**
 * Refresh the Supabase auth session on every navigation, and forward the
 * pathname to the render.
 *
 * Why this exists: Server Components cannot write cookies. If the auth token is
 * refreshed during a Server Component render, the new token cannot be
 * persisted, and the user is silently signed out when the old token expires.
 * Middleware runs before rendering and *can* write the response, so it is the
 * correct place to refresh.
 *
 * The documented `@supabase/ssr` rule is followed exactly: do not run any logic
 * between creating the client and calling `getUser()`, and always return the
 * same `response` object whose cookies were mutated.
 */
export async function middleware(request: NextRequest) {
  /**
   * The pathname is forwarded to Server Components.
   *
   * A layout cannot see the URL it is rendering, so the account guard has no way
   * to know which page the visitor was heading for and would have to send
   * everyone to the same place after sign-in. Forwarding it as a request header
   * is the documented way to make it available.
   *
   * The header is built once and reused for every `NextResponse.next()` below.
   * The Supabase `setAll` callback rebuilds the response, and a rebuilt response
   * made from a bare `NextResponse.next({ request })` would drop this header.
   */
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);

  const next = () => NextResponse.next({ request: { headers: requestHeaders } });

  let response = next();

  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

  // When Supabase is not configured the app must still serve pages rather than
  // crash on every request. This is the normal state before Phase 2.
  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = next();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Must be called: it refreshes the token and triggers `setAll` when needed.
  // `getUser()` is used rather than `getSession()` because only `getUser()`
  // validates the token against the auth server.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  /**
   * Run on everything except Next.js internals and static assets, so the
   * session stays fresh across page navigations without adding latency to
   * image and font requests.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2)$).*)',
  ],
};

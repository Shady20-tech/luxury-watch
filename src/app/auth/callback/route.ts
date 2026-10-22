import { NextResponse, type NextRequest } from 'next/server';

import { safeRedirectPath } from '@/lib/auth/redirect';
import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createSupabaseServerClientWritable } from '@/lib/supabase/server';

/**
 * The landing point for every emailed link.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS A ROUTE HANDLER AND NOT A PAGE
 * -----------------------------------------------------------------------------
 *
 * Supabase emails a link carrying a one-time `code`. Exchanging that code for a
 * session sets cookies. A Server Component cannot set cookies during render, so
 * a page could receive the code and then fail to persist the session — the user
 * would appear signed out on the very next request, with no error to explain it.
 * A Route Handler can set cookies, so this is the correct place.
 *
 * It is also outside the `(site)` group on purpose. The `(site)` layout
 * prerenders with `revalidate = 300`; a route that must run on every request
 * should not sit under a cached layout.
 *
 * -----------------------------------------------------------------------------
 * THE `next` PARAMETER IS NOT TRUSTED
 * -----------------------------------------------------------------------------
 *
 * `next` decides where the customer goes after the exchange. Taken from the URL,
 * it is attacker-controllable, and an unchecked value turns a genuine link from
 * this site into an open redirect — the classic phishing pattern, where the
 * victim sees the real domain before being handed to another. `safeRedirectPath`
 * accepts only a same-site absolute path and falls back to `/account`.
 *
 * -----------------------------------------------------------------------------
 * FAILURES ARE REPORTED, NOT HIDDEN
 * -----------------------------------------------------------------------------
 *
 * A code can be expired, already used, or absent. All three end in a redirect to
 * the sign-in page carrying a short reason code — never the raw error, which can
 * name a policy or a table. The reason is a fixed token the page maps to text.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeRedirectPath(url.searchParams.get('next'));

  if (!isSupabaseConfigured()) {
    return redirectTo(request, '/login', 'unavailable');
  }

  if (!code) {
    // Reached when a customer opens the confirmation page without following the
    // email, or when the provider returns `error_description` instead of a code.
    return redirectTo(request, '/login', 'missing_code');
  }

  try {
    const supabase = await createSupabaseServerClientWritable();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      logger.warn('auth.callback_exchange_failed', { message: error.message });
      return redirectTo(request, '/login', 'link_expired');
    }

    // `next` carries the destination the customer was originally sent towards:
    // `/account` after confirmation, `/reset-password` after a recovery link.
    return redirectTo(request, next, null);
  } catch (error) {
    logger.error('auth.callback_failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return redirectTo(request, '/login', 'link_expired');
  }
}

/**
 * Build the redirect.
 *
 * Cookie mutations made through `createSupabaseServerClientWritable` go to the
 * `cookies()` store, which Next.js applies to the outgoing response for a Route
 * Handler. Returning a redirect response is therefore compatible with the
 * session that `exchangeCodeForSession` just established.
 */
function redirectTo(request: NextRequest, path: string, reason: string | null): NextResponse {
  const target = new URL(path, request.url);
  if (reason) target.searchParams.set('reason', reason);

  return NextResponse.redirect(target);
}

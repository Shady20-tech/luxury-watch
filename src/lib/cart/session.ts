/**
 * The guest cart session token.
 *
 * -----------------------------------------------------------------------------
 * WHY A COOKIE AND NOT localStorage
 * -----------------------------------------------------------------------------
 *
 * A guest cart must survive a page reload and must not be readable by a script
 * on the page. `carts.session_token` is what identifies the cart, and the RLS
 * design in migration 0007 already decided how it is handled:
 *
 *   > Guest carts are handled exclusively server-side with the service-role
 *   > client, where the session token lives in an httpOnly cookie and never
 *   > appears in a query the browser can influence.
 *
 * So the token is `httpOnly`, `sameSite: 'lax'` and `secure` in production. The
 * browser never sees it, cannot forge it, and cannot read another visitor's.
 * This module is the only place the cookie is written, so the attributes cannot
 * drift between call sites.
 *
 * -----------------------------------------------------------------------------
 * WHY IT IS NOT A SESSION ID
 * -----------------------------------------------------------------------------
 *
 * It is not an authentication token. Holding it grants access to one anonymous
 * cart and nothing else: it is never accepted as proof of identity, it is not
 * consulted by any RLS policy, and it is discarded once the cart is merged into
 * a signed-in account. The name says "session token" because that is the column
 * name; the comment says what it is not.
 *
 * `server-only` makes the build fail if this is ever imported into a Client
 * Component, which is what keeps the token off the browser entirely.
 */
import 'server-only';

import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

export const CART_SESSION_COOKIE = 'lw_cart_session';

/** How long a guest cart lives. Long enough to survive a considered purchase. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * A fresh token: 32 random bytes as hex.
 *
 * The format matches `carts_session_token_format` (`^[a-f0-9]{32,128}$`), so a
 * token this module produces can never be rejected by the constraint.
 */
export function generateCartSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Read the existing token, without creating one.
 *
 * Safe in a Server Component, where cookies cannot be written. Returns `null`
 * when the visitor has no cart yet, which the caller reads as "empty guest
 * cart" rather than creating one just to render an empty page.
 */
export async function readCartSessionToken(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(CART_SESSION_COOKIE)?.value;
  return value && /^[a-f0-9]{32,128}$/.test(value) ? value : null;
}

/**
 * Read the token, creating and persisting one when it is absent.
 *
 * Only valid in a Server Action or Route Handler, where Next.js permits a cookie
 * write. Calling it during a Server Component render would throw, which is the
 * correct behaviour: a read-only render must not mint a cart.
 */
export async function ensureCartSessionToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(CART_SESSION_COOKIE)?.value;

  if (existing && /^[a-f0-9]{32,128}$/.test(existing)) {
    return existing;
  }

  const token = generateCartSessionToken();
  store.set(CART_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });

  return token;
}

/**
 * Forget the guest cart token.
 *
 * Called after a guest cart has been merged into an account, so a stale token
 * cannot resurrect the old cart on a shared device.
 */
export async function clearCartSessionToken(): Promise<void> {
  const store = await cookies();
  store.delete(CART_SESSION_COOKIE);
}

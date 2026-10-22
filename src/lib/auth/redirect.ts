/**
 * Where it is safe to send a customer after sign-in or after following an
 * emailed link.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS ONE MODULE AND NOT THREE SMALL CHECKS
 * -----------------------------------------------------------------------------
 *
 * The same guard is needed in three places: the sign-in action, the sign-in page
 * (which redirects an already-signed-in visitor) and the `/auth/callback` route
 * handler. Three copies of a security check is three chances for one of them to
 * be fixed and the others forgotten, and the failure is silent — a working
 * redirect that happens to point off-site.
 *
 * So there is one function, and it is tested directly.
 *
 * -----------------------------------------------------------------------------
 * THE ATTACK IT PREVENTS
 * -----------------------------------------------------------------------------
 *
 * A redirect target taken from a URL is attacker-controlled. The classic abuse
 * is a link to the real site that immediately hands the visitor to another one:
 *
 *     https://our-shop.test/login?next=https://our-shop.test.evil.test/verify
 *
 * The victim sees a genuine domain in the link they were sent, lands on the real
 * sign-in page, signs in — and is then forwarded to a page that asks them to
 * "confirm" their password. This is why an unchecked `next` parameter is treated
 * as a vulnerability rather than a convenience.
 *
 * Four forms must all be rejected:
 *
 *   `https://evil.test`   an absolute URL to another origin
 *   `//evil.test`         protocol-relative; the browser supplies the scheme
 *   `/\evil.test`         a backslash, which browsers normalise to `/`
 *   `\/evil.test`         the same trick with the slashes reversed
 *
 * A single leading `/` is not sufficient to accept: `//evil.test` also begins
 * with one, which is exactly the mistake this function exists to avoid.
 */

/** The destination used whenever the requested one is not acceptable. */
export const DEFAULT_REDIRECT_PATH = '/account';

/**
 * Reduce a candidate redirect target to a same-site absolute path.
 *
 * Accepts `null`, `undefined` and any unusable value, and always returns a
 * usable path — so a caller never has to handle the rejection separately and
 * cannot accidentally treat "rejected" as "no redirect".
 */
export function safeRedirectPath(value: string | null | undefined): string {
  if (typeof value !== 'string') return DEFAULT_REDIRECT_PATH;

  // A control character could be used to smuggle a newline into a header if the
  // value were ever placed in one. Rejected outright rather than stripped.
  if (/[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_REDIRECT_PATH;

  // A relative path, not an absolute URL. This rejects `https://evil.test`,
  // `javascript:alert(1)` and `data:...` in one comparison.
  if (!value.startsWith('/')) return DEFAULT_REDIRECT_PATH;

  // Reject a second slash or a backslash in the second position. `//evil.test`
  // is protocol-relative and `/\evil.test` is normalised to it by browsers.
  if (value.startsWith('//') || value.startsWith('/\\')) return DEFAULT_REDIRECT_PATH;

  // A path that navigates out of the site is not a destination, it is a bug.
  if (value.startsWith('/..')) return DEFAULT_REDIRECT_PATH;

  return value;
}

/**
 * The same rule, applied to a value from a form field.
 *
 * A Server Action reads `FormDataEntryValue`, which may be a `File`. Narrowing
 * here keeps the cast out of every action.
 */
export function safeRedirectPathFromForm(value: FormDataEntryValue | null): string {
  return safeRedirectPath(typeof value === 'string' ? value : null);
}

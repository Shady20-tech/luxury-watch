/**
 * The guest wishlist, held in the browser.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS STORED, AND WHAT IS DELIBERATELY NOT
 * -----------------------------------------------------------------------------
 *
 * Only product ids, under one `localStorage` key. Nothing else. Not a title,
 * not a price, not an image URL, not a count of anything derived from stock.
 *
 * The reason is that this value sits in a storage area any script on the origin
 * can read and any visitor can edit, so it is treated as untrusted input, not as
 * a record. A saved id is a *request* to save a product; the product's title,
 * price and availability are read from the database when the list is displayed.
 * That is also why the list cannot go stale in a way that matters: a price
 * "cached" in `localStorage` would be wrong the moment the administrator changed
 * it, and a stale price shown to a customer is worse than no price.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS NOT THE SOURCE OF TRUTH AFTER SIGN-IN
 * -----------------------------------------------------------------------------
 *
 * The brief is explicit: "Treat the database as the source of truth after
 * sign-in." So a signed-in visitor never reads this list to decide what is
 * saved. `mergeGuestWishlist` copies these ids into the account once, on the
 * transition from signed-out to signed-in, and the browser copy is then cleared.
 * If the merge fails, the browser copy is kept so nothing is lost and the next
 * sign-in can retry.
 *
 * Pure: no DOM access at module scope, so this is testable and safe to import
 * from a module that also runs on the server. Every function that touches
 * storage guards against it being unavailable (private browsing, a disabled
 * storage policy), because a wishlist that throws in those modes would break the
 * page rather than simply not persist.
 */

export const GUEST_WISHLIST_KEY = 'lw:wishlist';

/** A saved id is a UUID; anything else is not a product reference. */
const PRODUCT_ID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * The most ids the guest list will hold.
 *
 * Bounded so a hostile or corrupted value cannot make every page read an
 * enormous list. The merge into the account is bounded again server-side.
 */
export const MAX_GUEST_WISHLIST_ITEMS = 200;

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    // Access itself can throw when storage is blocked by policy.
    return null;
  }
}

/**
 * Parse a stored value into a clean id list.
 *
 * Tolerant on purpose: an unparseable, wrong-typed or hand-edited value yields
 * the ids that are still valid rather than throwing. Duplicates are collapsed
 * and the order of first appearance is preserved, so the list is stable across
 * reloads.
 */
export function parseGuestWishlist(raw: string | null | undefined): string[] {
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const ids: string[] = [];

  for (const entry of parsed) {
    if (typeof entry !== 'string' || !PRODUCT_ID_PATTERN.test(entry)) continue;
    const id = entry.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_GUEST_WISHLIST_ITEMS) break;
  }

  return ids;
}

/** The saved ids, or an empty list when storage is unavailable. */
export function readGuestWishlist(): string[] {
  const store = storage();
  if (!store) return [];
  try {
    return parseGuestWishlist(store.getItem(GUEST_WISHLIST_KEY));
  } catch {
    return [];
  }
}

function writeGuestWishlist(ids: string[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(GUEST_WISHLIST_KEY, JSON.stringify(ids.slice(0, MAX_GUEST_WISHLIST_ITEMS)));
  } catch {
    // Quota or a blocked storage policy. The list simply does not persist; the
    // caller still gets the updated in-memory value.
  }
}

/**
 * Add an id, returning the new list.
 *
 * Adding an id that is already present changes nothing, which is what makes a
 * double-tap or a replayed request harmless. The database's unique constraint is
 * the real guard for the signed-in list; this is its guest-side equivalent.
 */
export function addToGuestWishlist(productId: string, current = readGuestWishlist()): string[] {
  const id = productId.toLowerCase();
  if (!PRODUCT_ID_PATTERN.test(id) || current.includes(id)) return current;

  const next = [...current, id].slice(0, MAX_GUEST_WISHLIST_ITEMS);
  writeGuestWishlist(next);
  return next;
}

/** Remove an id, returning the new list. Removing an absent id is a no-op. */
export function removeFromGuestWishlist(
  productId: string,
  current = readGuestWishlist(),
): string[] {
  const id = productId.toLowerCase();
  const next = current.filter((entry) => entry !== id);
  writeGuestWishlist(next);
  return next;
}

/** Empty the guest list. Called after a successful merge. */
export function clearGuestWishlist(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(GUEST_WISHLIST_KEY);
  } catch {
    // Nothing to do; the ids are already in the account.
  }
}

/** Whether an id is saved. Used by the toggle's initial state. */
export function isInGuestWishlist(productId: string, current = readGuestWishlist()): boolean {
  return current.includes(productId.toLowerCase());
}

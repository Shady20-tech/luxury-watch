/**
 * The cart/wishlist change signal.
 *
 * The header badge, the cart drawer and the cart page are in different parts of
 * the tree and are mounted independently. When one of them changes the cart or
 * the wishlist, the others need to know so they do not show a stale number or a
 * stale set of lines.
 *
 * A custom DOM event is used rather than a shared store, because the only state
 * being shared is two counters and a "refetch" signal, and a store would be more
 * machinery than that justifies. It also keeps this module free of any server
 * import, so a Client Component can import the signal without pulling the
 * database layer into its bundle — which is what makes the components testable
 * in isolation.
 *
 * The event carries no payload. A listener re-reads the current state from the
 * server, so a listener that missed an event is corrected by the next one rather
 * than showing a number it accumulated.
 */

export const COUNTS_CHANGED_EVENT = 'lw:counts-changed';

/** Ask every interested surface to refresh. Safe to call during SSR (no-op). */
export function announceCountsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(COUNTS_CHANGED_EVENT));
}

/**
 * Subscribe to change signals. Returns an unsubscribe function.
 *
 * The `storage` event is included so a second tab editing the same guest
 * wishlist updates this one; a `localStorage` write fires it in the other tabs
 * only, which is exactly the cross-tab case.
 */
export function onCountsChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith('lw:')) listener();
  };

  window.addEventListener(COUNTS_CHANGED_EVENT, listener);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(COUNTS_CHANGED_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

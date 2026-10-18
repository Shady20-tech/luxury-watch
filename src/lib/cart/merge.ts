/**
 * Merge rules for the cart and the wishlist.
 *
 * Pure functions with no I/O, so the merge semantics can be tested exhaustively
 * without a database. They are the part of the merge that is easy to get subtly
 * wrong — "without duplicating or silently dropping items" is the brief's
 * wording, and it is a statement about exactly these functions.
 */

/**
 * Merge two lists of ids, preserving order and removing duplicates.
 *
 * Used when a guest wishlist is merged into an account, and when two carts are
 * combined on sign-in. The rule is: the existing list keeps its order, and any
 * id from the incoming list that is not already present is appended. Nothing is
 * dropped and nothing is duplicated.
 *
 * Ids are compared case-insensitively, because a UUID is case-insensitive in
 * Postgres and `localStorage` could hold either case.
 */
export function mergeIds(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((id) => id.toLowerCase()));
  const merged = [...existing];

  for (const id of incoming) {
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(id);
  }

  return merged;
}

/** A cart line as the merge sees it: a product and a quantity. */
export type MergeableLine = {
  productId: string;
  quantity: number;
};

/**
 * Merge a guest cart into a signed-in cart.
 *
 * Two rules, both chosen so nothing is lost:
 *
 *   1. A product in both carts keeps the **larger** quantity. Taking the guest
 *      quantity would drop items the customer added while signed in, and taking
 *      the account quantity would drop items they added while signed out. The
 *      larger of the two is the only choice that loses nothing, and it is
 *      capped at the schema's maximum so the merge cannot produce a line the
 *      database would reject.
 *   2. A product in only one cart is carried across unchanged.
 *
 * This does not reserve stock and does not re-price: the merged cart is
 * re-priced from the database on the next read, and the quantity is clamped
 * again by `cart_pricing` if the product model permits only one.
 */
export function mergeCartLines(
  accountLines: MergeableLine[],
  guestLines: MergeableLine[],
  maxQuantity = 99,
): MergeableLine[] {
  const byProduct = new Map<string, MergeableLine>();

  const put = (line: MergeableLine) => {
    const key = line.productId.toLowerCase();
    const quantity = clampQuantity(line.quantity, maxQuantity);
    const existing = byProduct.get(key);

    byProduct.set(key, {
      productId: existing?.productId ?? line.productId,
      quantity: existing ? Math.max(existing.quantity, quantity) : quantity,
    });
  };

  // Account lines first, so a product present in both keeps the account's id
  // spelling and the merged cart reads in the account's order.
  for (const line of accountLines) put(line);
  for (const line of guestLines) put(line);

  return [...byProduct.values()];
}

/** Clamp a quantity into the range the schema allows (`1..99`). */
export function clampQuantity(quantity: number, max = 99): number {
  if (!Number.isFinite(quantity)) return 1;
  const whole = Math.trunc(quantity);
  if (whole < 1) return 1;
  if (whole > max) return max;
  return whole;
}

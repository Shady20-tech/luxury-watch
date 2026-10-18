'use server';

import { getCart } from '@/server/services/cart-service';
import type { CartView } from '@/lib/cart/types';

/**
 * Read the caller's cart, priced.
 *
 * Exists so the cart drawer can fetch the same view the cart page renders
 * without a full navigation. It returns the `CartView` the page passes to the
 * shared `CartContents` component, so the drawer and the page cannot show
 * different numbers.
 *
 * It takes no arguments, which is the point: a caller cannot ask for a price, a
 * subtotal or a discount. It reads the caller's own cart and prices it with
 * `cart_pricing`.
 */
export async function readCartView(): Promise<CartView> {
  return getCart();
}

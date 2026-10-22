import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * `/account/wishlist` exists so the account navigation has a consistent shape and
 * no link is dead, but it renders nothing of its own.
 *
 * The wishlist already has a page at `/wishlist`, and it is the right page: it
 * renders the database-backed list for a signed-in visitor and the
 * `localStorage` list for a guest, and it owns the guest-to-account merge. A
 * second rendering of the same list would be a second place for the merge to
 * happen, and the merge is the one operation that must run exactly once.
 *
 * So this redirects. It is a permanent redirect for a signed-in customer, who is
 * the only person who can reach it — the account layout has already sent a guest
 * to sign in.
 */
export default function AccountWishlistPage() {
  redirect('/wishlist');
}

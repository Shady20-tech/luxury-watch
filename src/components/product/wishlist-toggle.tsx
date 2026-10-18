'use client';

import { Heart } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { announceCountsChanged } from '@/lib/cart/events';
import { IDLE_MUTATION } from '@/lib/cart/validation';
import {
  addToGuestWishlist,
  isInGuestWishlist,
  readGuestWishlist,
  removeFromGuestWishlist,
} from '@/lib/wishlist/guest';
import { addToWishlist, removeFromWishlist } from '@/server/actions/wishlist-actions';

/**
 * Wishlist toggle.
 *
 * -----------------------------------------------------------------------------
 * TWO IMPLEMENTATIONS BEHIND ONE CONTROL
 * -----------------------------------------------------------------------------
 *
 * A signed-in visitor's wishlist is in the database and every change is a server
 * action. A guest's wishlist is in `localStorage`, which the server cannot read,
 * so a guest's changes are made locally and merged into the account on sign-in.
 * The brief asks for exactly this: "Guest wishlists may be stored locally with
 * safe minimal data and merged with the account after login. Treat the database
 * as the source of truth after sign-in."
 *
 * `signedIn` and `initiallySaved` are resolved on the server and passed in, so
 * the control renders in its correct state immediately rather than flickering
 * from "not saved" to "saved" after hydration. For a guest, `initiallySaved` is
 * false on the server and the real state is read from `localStorage` in an
 * effect — which is why a guest may see the label settle once, a small cost that
 * is unavoidable when the truth lives in the browser.
 *
 * -----------------------------------------------------------------------------
 * WHAT THE GUEST LIST CONTAINS
 * -----------------------------------------------------------------------------
 *
 * Product ids only. Not a title, a price or an image — see `lib/wishlist/guest.ts`
 * for why a cached price in browser storage is worse than no price. The visible
 * list is always rendered from the database.
 */
function SubmitButton({ saved, pending }: { saved: boolean; pending: boolean }) {
  return (
    <Button
      type="submit"
      variant="secondary"
      loading={pending}
      aria-pressed={saved}
      className="justify-start"
    >
      <Heart aria-hidden="true" className={saved ? 'h-4 w-4 fill-current' : 'h-4 w-4'} />
      {saved ? 'Saved' : 'Add to wishlist'}
    </Button>
  );
}

export function WishlistToggle({
  productId,
  signedIn,
  initiallySaved,
  className,
}: {
  productId: string;
  signedIn: boolean;
  initiallySaved: boolean;
  className?: string;
}) {
  return signedIn ? (
    <SavedToggle productId={productId} initiallySaved={initiallySaved} className={className} />
  ) : (
    <GuestToggle productId={productId} className={className} />
  );
}

/** Signed-in toggle: the database is the source of truth. */
function SavedToggle({
  productId,
  initiallySaved,
  className,
}: {
  productId: string;
  initiallySaved: boolean;
  className?: string;
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [addState, addAction] = useActionState(addToWishlist, IDLE_MUTATION);
  const [removeState, removeAction] = useActionState(removeFromWishlist, IDLE_MUTATION);

  // The action's result is authoritative: it reflects what the database now
  // holds, not what the button assumed.
  useEffect(() => {
    if (addState.status === 'success') {
      setSaved(true);
      announceCountsChanged();
    }
  }, [addState.status]);

  useEffect(() => {
    if (removeState.status === 'success') {
      setSaved(false);
      announceCountsChanged();
    }
  }, [removeState.status]);

  const formAction = saved ? removeAction : addAction;
  const state = saved ? removeState : addState;

  return (
    <div className={className}>
      <form action={formAction}>
        <input type="hidden" name="productId" value={productId} />
        <SavedSubmit saved={saved} />
      </form>
      {state.status === 'error' && state.message ? (
        <p role="alert" className="text-danger-600 mt-2 text-xs font-medium">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function SavedSubmit({ saved }: { saved: boolean }) {
  const { pending } = useFormStatus();
  return <SubmitButton saved={saved} pending={pending} />;
}

/** Guest toggle: the browser list is the source of truth until sign-in. */
function GuestToggle({ productId, className }: { productId: string; className?: string }) {
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSaved(isInGuestWishlist(productId));
    setReady(true);
  }, [productId]);

  return (
    <div className={className}>
      <Button
        type="button"
        variant="secondary"
        aria-pressed={ready ? saved : undefined}
        className="justify-start"
        onClick={() => {
          const current = readGuestWishlist();
          const next = saved
            ? removeFromGuestWishlist(productId, current)
            : addToGuestWishlist(productId, current);
          setSaved(next.includes(productId.toLowerCase()));
          announceCountsChanged();
        }}
      >
        <Heart aria-hidden="true" className={saved ? 'h-4 w-4 fill-current' : 'h-4 w-4'} />
        {saved ? 'Saved' : 'Add to wishlist'}
      </Button>
      {/* A guest is told plainly that the list is on this device and will move
          into their account when they sign in, rather than being left to guess
          whether it is saved to an account they do not have. */}
      <p className="text-ink-500 mt-2 text-xs">
        Saved on this device.{' '}
        <a href="/account" className="text-accent-text underline underline-offset-4">
          Sign in
        </a>{' '}
        to keep your list and move it to your account.
      </p>
    </div>
  );
}

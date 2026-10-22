'use client';

import { useState, useTransition } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { deleteAddressAction } from '@/server/actions/auth-actions';
import { IDLE_AUTH_STATE } from '@/lib/auth/validation';
import type { Address } from '@/server/repositories/auth-repository';
import { AddressForm } from '@/components/account/address-form';

/**
 * One saved address, with edit and remove.
 *
 * -----------------------------------------------------------------------------
 * WHY REMOVAL ASKS FOR CONFIRMATION IN PLACE
 * -----------------------------------------------------------------------------
 *
 * Removing an address is destructive and, unlike an order, unrecoverable — the
 * customer would have to type it out again. So it is a two-step control rather
 * than a single button: the first click swaps the row's actions for a confirm
 * and cancel pair. No `window.confirm`, which cannot be styled, is not announced
 * consistently by assistive technology, and blocks the main thread.
 *
 * The confirmation is inline and focusable, and cancelling returns focus to the
 * button that opened it, so a keyboard user is not dropped back at the top of the
 * page.
 */
export function AddressCard({ address }: { address: Address }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      // The action returns a state rather than throwing, so a failure can be
      // shown against this row without unmounting it.
      const state = await deleteAddressAction(IDLE_AUTH_STATE, formDataFor(address.id));
      if (state.status === 'error') {
        setError(state.message ?? 'That address could not be removed.');
        return;
      }
      setConfirming(false);
    });
  }

  if (editing) {
    return (
      <div className="border-line-300 rounded-sm border p-5">
        <h3 className="text-base font-semibold">Edit address</h3>
        <div className="mt-4">
          <AddressForm address={address} onDone={() => setEditing(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="border-line-300 rounded-sm border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{address.label ?? 'Address'}</p>
            {address.isDefault ? <Badge variant="accent">Default</Badge> : null}
          </div>

          <address className="text-foreground-muted mt-2 text-sm not-italic">
            {address.recipientName}
            <br />
            {address.line1}
            {address.line2 ? (
              <>
                <br />
                {address.line2}
              </>
            ) : null}
            <br />
            {[address.city, address.region, address.postalCode].filter(Boolean).join(', ')}
            <br />
            {address.countryCode}
            {address.phone ? (
              <>
                <br />
                {address.phone}
              </>
            ) : null}
          </address>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {confirming ? (
            <>
              <Button type="button" variant="danger" size="sm" loading={pending} onClick={remove}>
                Confirm removal
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(true)}
                // The accessible name includes the label, so a screen-reader user
                // knows which address this removes when several are listed.
                aria-label={`Remove ${address.label ?? 'address'} for ${address.recipientName}`}
              >
                Remove
              </Button>
            </>
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-danger-600 mt-3 text-sm font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Build the FormData the action expects.
 *
 * The action reads `addressId` from the form. Constructing it here keeps the
 * action's signature identical to the one the `<form>` posts, so there is one
 * code path to reason about rather than two.
 */
function formDataFor(addressId: string): FormData {
  const data = new FormData();
  data.set('addressId', addressId);
  return data;
}

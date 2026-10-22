'use client';

import { useState } from 'react';
import { useActionState } from 'react';

import { AuthField, FormAlert, SubmitButton } from '@/components/auth/auth-form';
import { Button } from '@/components/ui/button';
import { IDLE_AUTH_STATE } from '@/lib/auth/validation';
import type { Address } from '@/server/repositories/auth-repository';
import { createAddressAction, updateAddressAction } from '@/server/actions/auth-actions';

/**
 * Add or edit a postal address.
 *
 * One form serves both operations because the fields are identical; only the
 * action and the button label differ. `addressId` is a hidden field rather than
 * a URL segment, so there is no address id in the address bar to tamper with
 * casually — and the action validates ownership regardless, scoping the update
 * to the session's own `user_id`.
 *
 * The form is collapsed until requested. A customer with three saved addresses
 * does not need three open forms on the page, and an open empty form invites a
 * half-filled submission.
 */
export function AddressForm({ address, onDone }: { address?: Address; onDone?: () => void }) {
  const action = address ? updateAddressAction : createAddressAction;
  const [state, formAction] = useActionState(action, IDLE_AUTH_STATE);

  // The success state is not rendered here — the parent list refreshes through
  // `revalidatePath`, and the form is unmounted. This component only reports
  // failure, which keeps the two responsibilities apart.
  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {address ? <input type="hidden" name="addressId" value={address.id} /> : null}

      <FormAlert state={state} />

      <AuthField
        state={state}
        name="recipientName"
        label="Recipient name"
        autoComplete="name"
        maxLength={200}
        defaultValue={address?.recipientName ?? ''}
      />

      <AuthField
        state={state}
        name="label"
        label="Label"
        required={false}
        maxLength={60}
        defaultValue={address?.label ?? ''}
        hint="Optional. For example Home or Office."
      />

      <AuthField
        state={state}
        name="line1"
        label="Address line 1"
        autoComplete="address-line1"
        maxLength={300}
        defaultValue={address?.line1 ?? ''}
      />

      <AuthField
        state={state}
        name="line2"
        label="Address line 2"
        autoComplete="address-line2"
        required={false}
        maxLength={300}
        defaultValue={address?.line2 ?? ''}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <AuthField
          state={state}
          name="city"
          label="City"
          autoComplete="address-level2"
          maxLength={120}
          defaultValue={address?.city ?? ''}
        />

        <AuthField
          state={state}
          name="region"
          label="County or region"
          autoComplete="address-level1"
          required={false}
          maxLength={120}
          defaultValue={address?.region ?? ''}
        />

        <AuthField
          state={state}
          name="postalCode"
          label="Postcode"
          autoComplete="postal-code"
          required={false}
          maxLength={20}
          defaultValue={address?.postalCode ?? ''}
        />

        <AuthField
          state={state}
          name="countryCode"
          label="Country code"
          autoComplete="country"
          maxLength={2}
          defaultValue={address?.countryCode ?? ''}
          hint="Two letters, for example GB."
        />
      </div>

      <AuthField
        state={state}
        name="phone"
        label="Telephone"
        type="tel"
        autoComplete="tel"
        required={false}
        maxLength={40}
        defaultValue={address?.phone ?? ''}
      />

      <div className="flex items-start gap-3">
        <input
          id={address ? `isDefault-${address.id}` : 'isDefault'}
          name="isDefault"
          type="checkbox"
          defaultChecked={address?.isDefault ?? false}
          className="border-line-300 mt-0.5 h-4 w-4 shrink-0 rounded-xs border"
        />
        <label htmlFor={address ? `isDefault-${address.id}` : 'isDefault'} className="text-sm">
          Use this as my default address
        </label>
      </div>

      <div className="flex gap-3">
        <SubmitButton
          label={address ? 'Save address' : 'Add address'}
          pendingLabel="Saving…"
          block={false}
        />
        {onDone ? (
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** A disclosure button that reveals the add form. */
export function AddAddressDisclosure() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        Add an address
      </Button>
    );
  }

  return (
    <div className="border-line-300 rounded-sm border p-5">
      <h3 className="text-base font-semibold">New address</h3>
      <div className="mt-4">
        <AddressForm onDone={() => setOpen(false)} />
      </div>
    </div>
  );
}

'use client';

import { useActionState } from 'react';

import { AuthField, FormAlert, SubmitButton } from '@/components/auth/auth-form';
import { IDLE_AUTH_STATE } from '@/lib/auth/validation';
import { updateProfileAction } from '@/server/actions/auth-actions';

/**
 * Profile form.
 *
 * The email address is shown but not editable, and that is deliberate rather than
 * an omission. The address is what the customer signs in with and what every
 * order confirmation is sent to; changing it is an authentication operation with
 * its own confirmation step, not a text edit. A free-text email field here would
 * let a typo lock someone out of their own account, and would let a stolen
 * session redirect the account to another address.
 *
 * The value is rendered as read-only text with an explanation, rather than as a
 * disabled input: a disabled input is skipped by assistive technology, so the
 * address would be invisible to a screen-reader user.
 */
export function ProfileForm({
  email,
  fullName,
  phone,
  marketingOptIn,
}: {
  email: string | null;
  fullName: string | null;
  phone: string | null;
  marketingOptIn: boolean;
}) {
  const [state, formAction] = useActionState(updateProfileAction, IDLE_AUTH_STATE);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-5" noValidate>
      <FormAlert state={state} />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Email address</span>
        <p className="text-foreground">{email ?? 'Not set'}</p>
        <p className="text-ink-500 text-xs">
          This is the address you sign in with and where we send order updates. Contact us if it
          needs to change.
        </p>
      </div>

      <AuthField
        state={state}
        name="fullName"
        label="Name"
        autoComplete="name"
        required={false}
        maxLength={120}
        defaultValue={fullName ?? ''}
      />

      <AuthField
        state={state}
        name="phone"
        label="Telephone"
        type="tel"
        autoComplete="tel"
        required={false}
        maxLength={40}
        defaultValue={phone ?? ''}
      />

      <div className="flex items-start gap-3">
        <input
          id="marketingOptIn"
          name="marketingOptIn"
          type="checkbox"
          defaultChecked={marketingOptIn}
          className="border-line-300 mt-0.5 h-4 w-4 shrink-0 rounded-xs border"
        />
        <label htmlFor="marketingOptIn" className="text-sm">
          Send me occasional news about new arrivals and events.
        </label>
      </div>

      <SubmitButton label="Save details" pendingLabel="Saving…" block={false} />
    </form>
  );
}

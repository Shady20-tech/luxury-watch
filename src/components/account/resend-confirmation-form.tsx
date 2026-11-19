'use client';

import { useActionState } from 'react';

import { FormAlert, SubmitButton } from '@/components/auth/auth-form';
import { resendConfirmationAction } from '@/server/actions/auth-actions';
import { IDLE_AUTH_STATE } from '@/lib/auth/validation';

/**
 * Re-send the confirmation email for an unconfirmed address.
 *
 * Shown only when the session says the address is unconfirmed, and the address is
 * fixed into a hidden field from the session rather than being editable: this is
 * a "resend the link I already should have" control, not a way to send
 * confirmation mail to an arbitrary address.
 *
 * The action reports the same outcome whether or not the address is registered,
 * so this cannot be used to probe for accounts.
 */
export function ResendConfirmationForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(resendConfirmationAction, IDLE_AUTH_STATE);

  if (state.status === 'success') {
    return <FormAlert state={state} />;
  }

  return (
    <form action={formAction} className="mt-4 flex max-w-sm flex-col gap-3">
      <FormAlert state={state} />
      <input type="hidden" name="email" value={email} />
      <div>
        <SubmitButton label="Resend confirmation email" pendingLabel="Sending…" block={false} />
      </div>
    </form>
  );
}

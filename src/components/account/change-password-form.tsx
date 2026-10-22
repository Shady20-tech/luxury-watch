'use client';

import { useActionState } from 'react';

import { AuthField, FormAlert, SubmitButton } from '@/components/auth/auth-form';
import { IDLE_AUTH_STATE } from '@/lib/auth/validation';
import { changePasswordAction } from '@/server/actions/auth-actions';

/**
 * Change-password form.
 *
 * Requires the current password even though the customer is already signed in.
 * Supabase's `updateUser` does not ask for it, so without this an unattended,
 * signed-in browser is enough to change the password and lock the owner out.
 * The current password is verified by re-authenticating before the change is
 * made (see `changePassword` in the auth repository).
 *
 * All three fields use `autoComplete="new-password"` for the new ones and
 * `current-password` for the existing one, so a password manager fills them
 * correctly rather than offering to save the old password over the new.
 */
export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, IDLE_AUTH_STATE);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-5" noValidate>
      <FormAlert state={state} />

      <AuthField
        state={state}
        name="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
      />

      <AuthField
        state={state}
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        maxLength={72}
        hint="At least 12 characters."
      />

      <AuthField
        state={state}
        name="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        minLength={12}
        maxLength={72}
      />

      <SubmitButton label="Update password" pendingLabel="Updating…" block={false} />
    </form>
  );
}

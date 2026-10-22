'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { AuthField, AuthPanel, FormAlert, SubmitButton } from '@/components/auth/auth-form';
import { resetPasswordAction } from '@/server/actions/auth-actions';
import { IDLE_AUTH_STATE } from '@/lib/auth/validation';

/**
 * Set-a-new-password form.
 *
 * Reached from the emailed recovery link, which lands on `/auth/callback` and
 * exchanges the one-time code for a session before redirecting here. That session
 * is what authorises the change; the form submits only the new password, never a
 * user id or an email. So there is nothing here to point at another account.
 *
 * The success state links to the account page rather than to sign-in: the
 * customer is already signed in, having proved control of the address by
 * following the link.
 */
export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, IDLE_AUTH_STATE);

  if (state.status === 'success') {
    return (
      <AuthPanel title="Password updated" description={state.message}>
        <Link
          href="/account"
          className="text-accent-text text-sm font-medium underline-offset-4 hover:underline"
        >
          Go to your account
        </Link>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      title="Choose a new password"
      description="Your other sessions stay signed in. If you did not request this, contact us."
      footer={
        <p>
          <Link
            href="/login"
            className="text-accent-text font-medium underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <FormAlert state={state} />

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

        <SubmitButton label="Update password" pendingLabel="Updating…" />
      </form>
    </AuthPanel>
  );
}

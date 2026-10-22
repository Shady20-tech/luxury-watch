'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { AuthField, AuthPanel, FormAlert, SubmitButton } from '@/components/auth/auth-form';
import { forgotPasswordAction } from '@/server/actions/auth-actions';
import { IDLE_AUTH_STATE } from '@/lib/auth/validation';

/**
 * Forgot-password form.
 *
 * Always reports the same outcome: "if an account exists, we have sent a link."
 * The alternative — confirming that no such account exists — would let anyone
 * test a list of addresses against this form. The action returns success for
 * every valid address, whether or not it is registered.
 *
 * A malformed address is still reported as a field error, because that is
 * something the submitter already knows and can fix.
 */
export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, IDLE_AUTH_STATE);

  if (state.status === 'success') {
    return (
      <AuthPanel title="Check your email" description={state.message}>
        <p className="text-foreground-muted text-sm">
          The link expires shortly. If it does not arrive, check your spam folder before requesting
          another — repeated requests are rate limited.
        </p>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      title="Reset your password"
      description="Enter the email address on your account and we will send you a link to choose a new password."
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
          name="email"
          label="Email address"
          type="email"
          autoComplete="username"
          maxLength={254}
        />

        <SubmitButton label="Send reset link" pendingLabel="Sending…" />
      </form>
    </AuthPanel>
  );
}

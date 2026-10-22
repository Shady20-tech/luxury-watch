'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { AuthField, AuthPanel, FormAlert, SubmitButton } from '@/components/auth/auth-form';
import { registerAction } from '@/server/actions/auth-actions';
import { IDLE_AUTH_STATE } from '@/lib/auth/validation';

/**
 * Registration form.
 *
 * The password rule is stated up front rather than revealed after a failed
 * submission. Twelve characters, no composition requirement — the reasoning is in
 * `lib/auth/validation.ts`. The hint is attached to the field so a screen reader
 * reads it as part of the input's description.
 *
 * The success panel replaces the form. Leaving a filled registration form on
 * screen after the account is created invites a second submission, which would
 * fail as a duplicate and confuse the customer.
 */
export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, IDLE_AUTH_STATE);

  if (state.status === 'success') {
    return (
      <AuthPanel title="Confirm your email address" description={state.message}>
        <p className="text-foreground-muted text-sm">
          The link expires in a few hours. If it does not arrive, check your spam folder before
          requesting another — repeated requests are rate limited.
        </p>
      </AuthPanel>
    );
  }

  return (
    <AuthPanel
      title="Create your account"
      description="Save pieces, track orders and send service requests."
      footer={
        <p>
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-accent-text font-medium underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <FormAlert state={state} />

        <AuthField
          state={state}
          name="fullName"
          label="Name"
          autoComplete="name"
          required={false}
          maxLength={120}
          hint="Optional. We use this on your orders and emails."
        />

        <AuthField
          state={state}
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          maxLength={254}
        />

        <AuthField
          state={state}
          name="password"
          label="Password"
          type="password"
          // `new-password`, not `current-password`: this is what makes a password
          // manager offer to generate a strong one instead of autofilling an
          // existing credential.
          autoComplete="new-password"
          minLength={12}
          maxLength={72}
          hint="At least 12 characters. A phrase you will remember beats a short password with symbols."
        />

        <SubmitButton label="Create account" pendingLabel="Creating your account…" />
      </form>
    </AuthPanel>
  );
}

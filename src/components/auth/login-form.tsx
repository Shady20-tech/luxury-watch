'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { AuthField, AuthPanel, FormAlert, SubmitButton } from '@/components/auth/auth-form';
import { loginAction } from '@/server/actions/auth-actions';
import { IDLE_AUTH_STATE } from '@/lib/auth/validation';

/**
 * Sign-in form.
 *
 * -----------------------------------------------------------------------------
 * WHY THE MESSAGE IS THE SAME FOR EVERY FAILURE
 * -----------------------------------------------------------------------------
 *
 * A wrong password, an unknown address and a disabled account all produce the
 * same sentence. The alternative — "no account with that email" — turns this form
 * into a way to test whether a given person shops here, and for a business whose
 * customers buy high-value watches, that list is worth stealing.
 *
 * The `next` field carries where the customer was heading. It is posted, so the
 * server treats it as untrusted and accepts only a same-site path
 * (`safeNextPath` in the action).
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(loginAction, IDLE_AUTH_STATE);

  return (
    <AuthPanel
      title="Sign in"
      description="Access your orders, saved pieces and service requests."
      footer={
        <div className="flex flex-col gap-3">
          <p>
            No account yet?{' '}
            <Link
              href="/register"
              className="text-accent-text font-medium underline-offset-4 hover:underline"
            >
              Create one
            </Link>
          </p>
          <p>
            <Link
              href="/forgot-password"
              className="text-accent-text underline-offset-4 hover:underline"
            >
              Forgotten your password?
            </Link>
          </p>
        </div>
      }
    >
      <form action={formAction} className="flex flex-col gap-5" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <FormAlert state={state} />

        <AuthField
          state={state}
          name="email"
          label="Email address"
          type="email"
          autoComplete="username"
          maxLength={254}
        />

        <AuthField
          state={state}
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
        />

        <SubmitButton label="Sign in" pendingLabel="Signing in…" />
      </form>
    </AuthPanel>
  );
}

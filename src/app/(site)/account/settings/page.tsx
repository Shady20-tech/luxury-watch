import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ChangePasswordForm } from '@/components/account/change-password-form';
import { ResendConfirmationForm } from '@/components/account/resend-confirmation-form';
import { Badge } from '@/components/ui/badge';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { getAccountAccess, loginPathFor } from '@/server/services/authorization-service';
import { logoutAction } from '@/server/actions/auth-actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Settings');

/**
 * Account settings.
 *
 * Every statement on this page is derived from the session, not assumed. The
 * email-confirmation status in particular reads `access.user.emailConfirmed`
 * rather than printing a fixed "your email is confirmed" line — a page that
 * asserts something it has not checked will eventually assert it about an
 * unconfirmed account, and that is the one state where the customer needs to
 * know.
 *
 * Preferences are limited to what the schema stores. There is no notification
 * preference matrix here because `profiles` carries only `marketing_opt_in`, and
 * inventing toggles that write nowhere would be worse than not offering them;
 * the marketing choice lives with the rest of the profile.
 */
export default async function AccountSettingsPage() {
  const access = await getAccountAccess();
  if (!access) redirect(loginPathFor('/account/settings'));

  const { user } = access;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h2 className="text-xl">Settings</h2>
        <p className="text-foreground-muted mt-2 max-w-prose text-sm">
          Sign-in details and how we contact you.
        </p>
      </div>

      <section aria-labelledby="email-status-heading">
        <h3 id="email-status-heading" className="text-base font-semibold">
          Email address
        </h3>

        <div className="border-line-300 mt-4 rounded-sm border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-foreground text-sm font-medium break-all">
              {user.email ?? 'No email address on this account'}
            </p>
            {user.emailConfirmed ? (
              <Badge variant="success">Confirmed</Badge>
            ) : (
              <Badge variant="accent">Not confirmed</Badge>
            )}
          </div>

          {user.emailConfirmed ? (
            <p className="text-foreground-muted mt-3 max-w-prose text-sm">
              This address is confirmed and is what you sign in with. To change it,{' '}
              <Link href="/contact" className="text-accent-text underline-offset-4 hover:underline">
                contact us
              </Link>{' '}
              — we will confirm the new address before it takes effect.
            </p>
          ) : (
            <div className="mt-3">
              <p className="text-foreground-muted max-w-prose text-sm">
                This address has not been confirmed yet. Until it is, some features may be
                restricted. Check your inbox for the confirmation link, including your spam folder.
              </p>
              {user.email ? <ResendConfirmationForm email={user.email} /> : null}
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="password-heading" className="border-line-300 border-t pt-8">
        <h3 id="password-heading" className="text-base font-semibold">
          Password
        </h3>
        <p className="text-foreground-muted mt-1 mb-5 max-w-prose text-sm">
          Changing your password does not sign you out on other devices. If you think someone else
          has it, change it and contact us.
        </p>
        <ChangePasswordForm />
      </section>

      <section aria-labelledby="contact-prefs-heading" className="border-line-300 border-t pt-8">
        <h3 id="contact-prefs-heading" className="text-base font-semibold">
          Contact preferences
        </h3>
        <p className="text-foreground-muted mt-1 max-w-prose text-sm">
          Your name, phone number and marketing choice are edited in{' '}
          <Link
            href="/account/profile"
            className="text-accent-text underline-offset-4 hover:underline"
          >
            your profile
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="session-heading" className="border-line-300 border-t pt-8">
        <h3 id="session-heading" className="text-base font-semibold">
          Sign out
        </h3>
        <p className="text-foreground-muted mt-1 max-w-prose text-sm">
          Sign out of this browser. You can sign back in at any time.
        </p>
        <form action={logoutAction} className="mt-4">
          <button
            type="submit"
            className="border-line-300 hover:border-ink-500 focus-visible:outline-gold-700 rounded-sm border px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}

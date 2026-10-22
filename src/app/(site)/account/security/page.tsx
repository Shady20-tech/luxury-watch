import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ChangePasswordForm } from '@/components/account/change-password-form';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { getAccountAccess, loginPathFor } from '@/server/services/authorization-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Security');

/**
 * Security settings.
 *
 * Only what the project can honestly support. There is no two-factor enrolment
 * here because Supabase Auth's MFA has not been configured for this deployment,
 * and showing a control that silently does nothing would be worse than showing
 * none. The session notice states what is true: changing the password does not
 * end sessions on other devices.
 */
export default async function AccountSecurityPage() {
  const access = await getAccountAccess();
  if (!access) redirect(loginPathFor('/account/security'));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl">Security</h2>
        <p className="text-foreground-muted mt-2 max-w-prose text-sm">
          Manage the password for your account.
        </p>
      </div>

      <section aria-labelledby="password-heading" className="flex flex-col gap-5">
        <div>
          <h3 id="password-heading" className="text-base font-semibold">
            Change your password
          </h3>
          <p className="text-foreground-muted mt-1 max-w-prose text-sm">
            Enter your current password, then choose a new one. Changing it does not sign you out on
            other devices, so if you think someone else has your password, change it and contact us.
          </p>
        </div>

        <ChangePasswordForm />
      </section>

      <section aria-labelledby="email-heading" className="border-line-300 border-t pt-8">
        <h3 id="email-heading" className="text-base font-semibold">
          Email address
        </h3>
        <p className="text-foreground-muted mt-1 max-w-prose text-sm">
          You sign in with{' '}
          <strong className="text-foreground font-medium">
            {access.user.email ?? 'your account'}
          </strong>
          . To change it,{' '}
          <Link href="/contact" className="text-accent-text underline-offset-4 hover:underline">
            contact us
          </Link>{' '}
          — we will confirm the new address before it takes effect.
        </p>
      </section>
    </div>
  );
}

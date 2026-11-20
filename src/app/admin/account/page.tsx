import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AvatarUploader } from '@/components/account/avatar-uploader';
import { ChangePasswordForm } from '@/components/account/change-password-form';
import { ProfileForm } from '@/components/account/profile-form';
import { fetchProfile } from '@/server/repositories/auth-repository';
import { getAdminIdentity } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your account',
  robots: { index: false, follow: false },
};

/**
 * The signed-in administrator's own account.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS EXISTS IN ADDITION TO `/account`
 * -----------------------------------------------------------------------------
 *
 * A staff member has the same profile and password as any other user, but the
 * customer account area is a different shell — it has the storefront header, the
 * shopping navigation and no admin chrome. Sending an administrator there to
 * change their own password is a context switch for no benefit, and in practice
 * means the password does not get changed.
 *
 * It reuses the customer components rather than copying them. Both call the same
 * server actions, which resolve the user from the session, so there is exactly
 * one implementation of "change my password" and one of "save my profile".
 *
 * -----------------------------------------------------------------------------
 * WHY `notFound()` RATHER THAN A REDIRECT
 * -----------------------------------------------------------------------------
 *
 * The layout already refuses a non-staff caller with a 404-shaped page. Reaching
 * this page without a staff identity would mean the layout did not run, which
 * cannot happen — but if it ever did, `notFound()` keeps the same refusal rather
 * than redirecting to a login page that would reveal the route exists.
 */
export default async function AdminAccountPage() {
  const identity = await getAdminIdentity();
  if (!identity) notFound();

  const profile = await fetchProfile(identity.userId);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-xl">Your account</h1>
        <p className="text-foreground-muted mt-2 max-w-prose text-sm">
          Your own details, photo and password. These are separate from the site&apos;s customer
          accounts and are not visible in the storefront.
        </p>
        <p className="text-ink-500 mt-2 text-xs">
          {identity.email ?? 'Signed in'}
          {identity.roles.length > 0 ? ` · ${identity.roles.join(', ')}` : null}
        </p>
      </div>

      {profile ? (
        <div className="flex flex-col gap-10">
          <AvatarUploader initialUrl={profile.avatarUrl} name={profile.fullName} />

          <section aria-labelledby="details-heading" className="border-line-300 border-t pt-8">
            <h2 id="details-heading" className="text-base font-semibold">
              Your details
            </h2>
            <p className="text-foreground-muted mt-1 mb-5 max-w-prose text-sm">
              Used when we contact you about an order or an enquiry.
            </p>
            <ProfileForm
              email={profile.email}
              fullName={profile.fullName}
              phone={profile.phone}
              marketingOptIn={profile.marketingOptIn}
            />
          </section>

          <section aria-labelledby="password-heading" className="border-line-300 border-t pt-8">
            <h2 id="password-heading" className="text-base font-semibold">
              Change your password
            </h2>
            <p className="text-foreground-muted mt-1 mb-5 max-w-prose text-sm">
              Enter your current password, then choose a new one. Changing it does not sign you out
              on other devices.
            </p>
            <ChangePasswordForm />
          </section>
        </div>
      ) : (
        <p role="alert" className="text-foreground-muted text-sm">
          We could not load your details. Please refresh the page, or contact the site administrator
          if this continues.
        </p>
      )}
    </div>
  );
}

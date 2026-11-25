import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AvatarUploader } from '@/components/account/avatar-uploader';
import { AdminCard, AdminPageHeader } from '@/components/admin/ui';
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
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Your account"
        title="Details, photo and password"
        description="Your own details, photo and password. These are separate from the site's customer accounts and are not visible in the storefront."
        actions={
          <span className="text-ink-500 text-xs">
            {identity.email ?? 'Signed in'}
            {identity.roles.length > 0 ? ` · ${identity.roles.join(', ')}` : null}
          </span>
        }
      />

      {profile ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-start">
          <AdminCard title="Your photo" description="Shown beside your activity">
            <AvatarUploader initialUrl={profile.avatarUrl} name={profile.fullName} />
          </AdminCard>

          <div className="flex flex-col gap-5">
            <AdminCard
              title="Your details"
              description="Used when we contact you about an order or an enquiry"
            >
              <ProfileForm
                email={profile.email}
                fullName={profile.fullName}
                phone={profile.phone}
                marketingOptIn={profile.marketingOptIn}
              />
            </AdminCard>

            <AdminCard
              title="Change your password"
              description="Changing it does not sign you out on other devices"
            >
              <ChangePasswordForm />
            </AdminCard>
          </div>
        </div>
      ) : (
        <AdminCard>
          <p role="alert" className="text-foreground-muted text-sm">
            We could not load your details. Please refresh the page, or contact the site
            administrator if this continues.
          </p>
        </AdminCard>
      )}
    </div>
  );
}

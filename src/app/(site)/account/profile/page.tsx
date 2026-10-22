import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ProfileForm } from '@/components/account/profile-form';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchProfile } from '@/server/repositories/auth-repository';
import { getAccountAccess, loginPathFor } from '@/server/services/authorization-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Your details');

/**
 * Profile page.
 *
 * The row is read with the session's own id. The profile is created by the
 * `handle_new_user` trigger when the account is made, so a missing row means the
 * trigger did not run — which is worth reporting rather than rendering an empty
 * form that would then fail on save.
 */
export default async function AccountProfilePage() {
  const access = await getAccountAccess();
  if (!access) redirect(loginPathFor('/account/profile'));

  const profile = await fetchProfile(access.user.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl">Your details</h2>
        <p className="text-foreground-muted mt-2 max-w-prose text-sm">
          These details are used on your order requests and when we contact you.
        </p>
      </div>

      {profile ? (
        <ProfileForm
          email={profile.email}
          fullName={profile.fullName}
          phone={profile.phone}
          marketingOptIn={profile.marketingOptIn}
        />
      ) : (
        <p role="alert" className="text-foreground-muted text-sm">
          We could not load your details. Please refresh the page, or contact us if this continues.
        </p>
      )}
    </div>
  );
}

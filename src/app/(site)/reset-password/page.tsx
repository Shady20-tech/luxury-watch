import type { Metadata } from 'next';
import Link from 'next/link';

import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { AuthPanel } from '@/components/auth/auth-form';
import { buildMetadata } from '@/lib/seo/metadata';
import { getAuthUser } from '@/server/repositories/auth-repository';

export const metadata: Metadata = buildMetadata({
  title: 'Choose a new password',
  description: 'Set a new password for your account.',
  path: '/reset-password',
  robots: { index: false, follow: true },
});

/**
 * Reached only through a recovery link.
 *
 * The link lands on `/auth/callback`, which exchanges the one-time code for a
 * session and then redirects here. So a visitor with a session on this page has
 * already proved they control the address, and the form can be shown.
 *
 * A visitor *without* a session arrived by typing the URL or following a stale
 * link. Showing them the form would be misleading — the action would reject it —
 * so they are told what happened and pointed at the request form instead. The
 * page does not redirect to `/login`, because the useful next step is a new
 * link, not a sign-in.
 */
export default async function ResetPasswordPage() {
  const user = await getAuthUser();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
        <AuthPanel
          title="This link is not valid"
          description="A password reset link can only be used once, and it expires. Request a new one to continue."
        >
          <div className="flex flex-col gap-3 text-sm">
            <Link
              href="/forgot-password"
              className="text-accent-text font-medium underline-offset-4 hover:underline"
            >
              Request a new reset link
            </Link>
            <Link href="/login" className="text-accent-text underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </div>
        </AuthPanel>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
      <ResetPasswordForm />
    </div>
  );
}

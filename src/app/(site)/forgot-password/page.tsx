import type { Metadata } from 'next';

import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildMetadata({
  title: 'Reset your password',
  description: 'Request a link to choose a new password for your account.',
  path: '/forgot-password',
  robots: { index: false, follow: true },
});

/**
 * Deliberately does not redirect a signed-in visitor.
 *
 * Unlike `/login` and `/register`, this page is useful to someone who is already
 * signed in — they may have forgotten the password on a second device, or be
 * signed in on a session they no longer trust and want to rotate the password
 * from. Redirecting them would remove the only route to that.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
      <ForgotPasswordForm />
    </div>
  );
}

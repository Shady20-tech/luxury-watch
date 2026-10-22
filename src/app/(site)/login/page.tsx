import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoginForm } from '@/components/auth/login-form';
import { FormAlert } from '@/components/auth/auth-form';
import { buildMetadata } from '@/lib/seo/metadata';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { getAuthUser } from '@/server/repositories/auth-repository';
import type { AuthFormState } from '@/lib/auth/validation';

export const metadata: Metadata = buildMetadata({
  title: 'Sign in',
  description: 'Sign in to view your orders, saved pieces and service requests.',
  path: '/login',
  robots: { index: false, follow: true },
});

/**
 * Fixed reason codes the callback appends when an emailed link fails.
 *
 * A code, not a message. The raw Supabase error can name a policy or a table, so
 * only the tokens below are rendered, and an unrecognised value shows nothing.
 */
const REASON_MESSAGES: Record<string, string> = {
  missing_code: 'That link was incomplete. Request a new one and try again.',
  link_expired: 'That link has expired or has already been used. Request a new one.',
  unavailable: 'Accounts are temporarily unavailable. Please try again shortly.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  // A signed-in visitor has no use for this page. The check uses `getUser()`,
  // which validates the token, so a stale cookie does not bounce them in a loop.
  const user = await getAuthUser();
  if (user) redirect(safeRedirectPath(typeof params.next === 'string' ? params.next : null));

  const reason = typeof params.reason === 'string' ? params.reason : undefined;
  const reasonMessage = reason ? REASON_MESSAGES[reason] : undefined;
  const reasonState: AuthFormState | null = reasonMessage
    ? { status: 'error', message: reasonMessage }
    : null;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
      {reasonState ? (
        <div className="mb-6">
          <FormAlert state={reasonState} />
        </div>
      ) : null}

      <LoginForm next={safeRedirectPath(typeof params.next === 'string' ? params.next : null)} />
    </div>
  );
}

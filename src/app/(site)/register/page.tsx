import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { RegisterForm } from '@/components/auth/register-form';
import { buildMetadata } from '@/lib/seo/metadata';
import { getAuthUser } from '@/server/repositories/auth-repository';

export const metadata: Metadata = buildMetadata({
  title: 'Create your account',
  description: 'Create an account to save pieces, track orders and send service requests.',
  path: '/register',
  robots: { index: false, follow: true },
});

export default async function RegisterPage() {
  // A signed-in visitor already has an account.
  const user = await getAuthUser();
  if (user) redirect('/account');

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 sm:py-24">
      <RegisterForm />
    </div>
  );
}

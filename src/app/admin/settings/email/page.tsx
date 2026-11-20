import type { Metadata } from 'next';

import { EmailSettingsEditor } from '@/components/admin/settings-editors';
import { AdminPageHeader } from '@/components/admin/ui';
import { getServerEnv } from '@/lib/env.server';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAdminEmailSettings } from '@/server/repositories/admin-content-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Email settings · Administration');

/**
 * The mail identity.
 *
 * The sending address is read from the environment and shown, not edited. It has
 * to match a domain verified with Resend, and a form field that could change it
 * would let whoever could write it send mail from a domain the store does not
 * own. What is editable is presentation: the display name and the reply-to
 * address, both of which fall back to the deployment default when blank.
 */
export default async function AdminEmailSettingsPage() {
  await requirePermission('settings.write');

  const settings = await fetchAdminEmailSettings();
  const fromAddress = getServerEnv().resendFromEmail ?? null;

  return (
    <div>
      <AdminPageHeader
        title="Email"
        description="How the store presents itself in the messages customers receive. The sending address itself is configured in the deployment."
      />
      <EmailSettingsEditor settings={settings} fromAddress={fromAddress} />
    </div>
  );
}

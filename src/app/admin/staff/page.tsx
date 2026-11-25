import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AdminPageHeader } from '@/components/admin/ui';
import { AddStaffByEmailForm, StaffRoleManager } from '@/components/admin/staff-role-manager';
import { noIndexMetadata } from '@/lib/seo/metadata';
import {
  findAccountByEmail,
  groupRoster,
  listStaffRoster,
  type StaffAccount,
} from '@/server/repositories/admin-staff-repository';
import { getAdminIdentity, requirePermission } from '@/server/services/admin-authorization';

/**
 * The staff role manager.
 *
 * Gated on `SUPER_ADMIN` in the page itself, not merely on `customers.read`.
 * `requirePermission` is the general guard, but a role screen reachable by an
 * ordinary `ADMIN` would show who holds what and would sit next to actions that
 * change it. The page is therefore the narrowest possible audience, which is what
 * the operation deserves.
 *
 * `?email=` resolves one exact account for appointment; `?account=` selects an
 * account already on the roster for an additional grant. Neither is a search
 * field: an `ilike` browse over `profiles` would let a caller enumerate customers,
 * so the parameter is always an exact address or a known roster id.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Staff and roles · Administration');

export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await getAdminIdentity();
  if (!identity) redirect('/login?next=/admin/staff');

  if (!identity.roles.includes('SUPER_ADMIN')) {
    await requirePermission('customers.read');
    return (
      <div>
        <AdminPageHeader
          title="Staff and roles"
          description="Changing roles is restricted to super administrators."
        />
        <p className="border-line-300 text-foreground-muted rounded-md border border-dashed p-4 text-sm">
          You do not have permission to manage staff roles. Granting and revoking a role requires
          the super administrator role.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const rawEmail = typeof params.email === 'string' ? params.email.trim() : '';
  const rawAccount = typeof params.account === 'string' ? params.account : '';

  const [roster, emailAccount] = await Promise.all([
    listStaffRoster(),
    rawEmail ? findAccountByEmail(rawEmail) : Promise.resolve<StaffAccount | null>(null),
  ]);

  const accounts = groupRoster(roster);

  // The lookup may resolve a person who holds no role yet. Fold them into the
  // list so the grant form has somewhere to point, without pretending they are
  // staff.
  const accountsWithCandidate = emailAccount
    ? [...accounts.filter((a) => a.userId !== emailAccount.userId), emailAccount]
    : accounts;

  const selectedAccountId =
    emailAccount?.userId ??
    (rawAccount && accounts.some((a) => a.userId === rawAccount) ? rawAccount : null);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Staff and roles"
        description="Who may use the admin platform, and what they may do. Appointing a person grants a role; the role decides every screen and every action they can reach."
      />

      {rawEmail && !emailAccount ? (
        <p
          className="border-line-300 bg-surface-0 text-ink-700 rounded-md border p-3 text-sm"
          role="status"
        >
          No account uses the address <span className="font-medium">{rawEmail}</span>. The person
          has to register before a role can be attached.
        </p>
      ) : null}

      <AddStaffByEmailForm />

      <StaffRoleManager
        accounts={accountsWithCandidate}
        roster={roster}
        selectedAccountId={selectedAccountId}
      />
    </div>
  );
}

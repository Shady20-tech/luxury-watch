'use client';

import { Plus, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import {
  AdminForm,
  inputClass,
  labelClass,
  SelectField,
  TextField,
} from '@/components/admin/form-kit';
import type { AdminFormState } from '@/lib/admin/validation';
import { grantRoleAction, revokeRoleAction } from '@/server/actions/admin-staff-actions';
import type { StaffAccount, StaffRosterRow } from '@/server/repositories/admin-staff-repository';
import type { StaffRole } from '@/server/services/admin-authorization';

/**
 * The role manager.
 *
 * A super administrator's screen: it lists who holds which role and lets them
 * grant or revoke one. The client component only renders the two forms; the
 * permission decision is made twice, in the action and again inside the database
 * function, neither of which this component can influence.
 *
 * -----------------------------------------------------------------------------
 * WHY A GRANT STARTS FROM AN ACCOUNT, NOT AN EMAIL FORM ALONE
 * -----------------------------------------------------------------------------
 *
 * A role is attached to a user id, and the person appointing somebody knows their
 * email. The form therefore carries the account's user id from the roster below,
 * found via the URL (`?account=<id>`), so a grant always targets a row the
 * administrator can see. That removes the chance of a typo addressing a different
 * customer, and it means the screen never has to search the customer table by
 * substring to find its target.
 */

const IDLE: AdminFormState = { status: 'idle' };

/** A readable label for a role enum value. */
export function roleLabel(role: StaffRole): string {
  const special: Partial<Record<StaffRole, string>> = { SUPER_ADMIN: 'Super admin' };
  return (
    special[role] ??
    role
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** One revoke control, as its own form because each targets a different role. */
function RevokeButton({
  userId,
  role,
  person,
}: {
  userId: string;
  role: StaffRole;
  /** The person's display name, so the button says who it acts on. */
  person: string;
}) {
  const [state, formAction, pending] = useActionState(revokeRoleAction, IDLE);

  return (
    <form action={formAction} className="inline-flex items-center">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={role} />
      <button
        type="submit"
        disabled={pending}
        className="text-ink-500 hover:text-danger-600 focus-visible:outline-gold-700 inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      >
        <X aria-hidden="true" className="h-3 w-3" />
        Revoke
        <span className="sr-only">
          {' '}
          {roleLabel(role)} from {person}
        </span>
      </button>
      {state.status === 'error' && state.message ? (
        <span className="text-danger-600 ml-2 text-xs" role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

const ROLE_OPTIONS: StaffRole[] = [
  'ADMIN',
  'SALES_MANAGER',
  'INVENTORY_MANAGER',
  'WATCH_EXPERT',
  'CUSTOMER_SUPPORT',
  'CONTENT_MANAGER',
  'SUPER_ADMIN',
];

export function StaffRoleManager({
  accounts,
  roster,
  selectedAccountId,
}: {
  accounts: StaffAccount[];
  roster: StaffRosterRow[];
  /** The account the grant form targets, chosen from the roster via `?account=`. */
  selectedAccountId: string | null;
}) {
  const selected = accounts.find((account) => account.userId === selectedAccountId) ?? null;

  return (
    <div className="space-y-8">
      <section id="grant" aria-labelledby="grant-heading">
        <h2 id="grant-heading" className="text-lg font-semibold">
          Grant a role
        </h2>
        <p className="text-foreground-muted mt-1 text-sm">
          Choose an account below, then add the role. You cannot change your own roles, and the last
          super administrator cannot be removed.
        </p>

        {selected ? (
          <div className="border-line-200 bg-surface-0 mt-4 rounded-2xl border p-4">
            <p className="text-ink-700 text-sm">
              Granting to{' '}
              <span className="text-ink-900 font-medium">
                {selected.fullName ?? selected.email ?? selected.userId}
              </span>
              {selected.email ? (
                <span className="text-foreground-muted"> · {selected.email}</span>
              ) : null}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {selected.roles.length > 0 ? (
                selected.roles.map((entry) => (
                  <span
                    key={entry.role}
                    className="border-line-300 text-ink-700 rounded-full border px-2.5 py-1 text-xs"
                  >
                    {roleLabel(entry.role)}
                    {entry.isExpired ? ' · expired' : ''}
                  </span>
                ))
              ) : (
                <span className="text-foreground-muted text-xs">No staff roles yet.</span>
              )}
            </div>

            <AdminForm
              action={grantRoleAction}
              hidden={{ userId: selected.userId }}
              submitLabel="Grant role"
            >
              <SelectField
                name="role"
                label="Role"
                options={ROLE_OPTIONS.map((role) => ({ value: role, label: roleLabel(role) }))}
              />
              <TextField
                name="expiresAt"
                label="Expires (optional)"
                type="date"
                hint="Leave blank for a permanent grant. A temporary grant lapses without a manual revoke."
              />
            </AdminForm>
          </div>
        ) : (
          <p className="border-line-300 text-foreground-muted mt-4 rounded-2xl border border-dashed p-4 text-sm">
            Select an account from the list below to grant a role.
          </p>
        )}
      </section>

      <section aria-labelledby="roster-heading">
        <h2 id="roster-heading" className="text-lg font-semibold">
          Staff and roles
        </h2>
        <p className="text-foreground-muted mt-1 text-sm tabular-nums">
          {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'} hold a staff role.
        </p>

        {roster.length === 0 ? (
          <p className="border-line-300 text-foreground-muted mt-4 rounded-2xl border border-dashed p-4 text-sm">
            No staff roles have been granted yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {accounts.map((account) => (
              <li
                key={account.userId}
                className="border-line-200 bg-surface-0 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3"
              >
                <div className="min-w-0">
                  <p className="text-ink-900 truncate text-sm font-medium">
                    {account.fullName ?? account.email ?? account.userId}
                  </p>
                  {/* The address is the second line only when a name is shown
                      above it. An account with no name would otherwise print
                      its email twice, which reads as a rendering fault. */}
                  {account.email && account.fullName ? (
                    <p className="text-foreground-muted truncate text-xs">{account.email}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {account.roles.map((entry) => (
                    <span
                      key={entry.role}
                      className="border-line-300 text-ink-700 inline-flex items-center gap-1.5 rounded-full border py-1 pr-1 pl-2.5 text-xs"
                    >
                      {roleLabel(entry.role)}
                      {entry.isExpired ? (
                        <span className="text-foreground-muted">· expired</span>
                      ) : null}
                      <RevokeButton
                        userId={account.userId}
                        role={entry.role}
                        person={account.fullName ?? account.email ?? account.userId}
                      />
                    </span>
                  ))}
                  {/* An additional role is granted from the same roster, not by
                      retyping the email. Without this link `?account=` was the
                      only way to target an existing person and nothing produced
                      it, so a second role could not be granted from the screen
                      at all. A link, not a button: it navigates. */}
                  <Link
                    href={`/admin/staff?account=${account.userId}#grant`}
                    className="text-ink-600 hover:text-ink-900 focus-visible:outline-ink-900 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                    Add role
                    <span className="sr-only">
                      {' '}
                      for {account.fullName ?? account.email ?? account.userId}
                    </span>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * The "grant a role" entry point for an account that is not yet staff.
 *
 * The roster lists people who already hold a role. Appointing a brand-new person
 * starts from their exact email address, which the page resolves to an account
 * before the grant form appears.
 */
export function AddStaffByEmailForm() {
  return (
    <section aria-labelledby="add-staff-heading">
      <h2 id="add-staff-heading" className="text-lg font-semibold">
        Appoint someone new
      </h2>
      <p className="text-foreground-muted mt-1 text-sm">
        Enter the exact email address of an existing account. A grant is attached to the account, so
        the person must have registered already.
      </p>

      <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="staff-email" className={labelClass}>
            Email address
          </label>
          <input
            id="staff-email"
            name="email"
            type="email"
            required
            placeholder="name@example.com"
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          className="border-line-300 hover:border-line-400 focus-visible:outline-gold-700 inline-flex items-center gap-1.5 rounded-sm border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <UserPlus aria-hidden="true" className="h-4 w-4" />
          Find account
        </button>
      </form>
    </section>
  );
}

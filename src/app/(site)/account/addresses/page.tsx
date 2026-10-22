import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AddAddressDisclosure } from '@/components/account/address-form';
import { AddressCard } from '@/components/account/address-card';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAddresses } from '@/server/repositories/auth-repository';
import { getAccountAccess, loginPathFor } from '@/server/services/authorization-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Your addresses');

/**
 * Address book.
 *
 * The list is read on the server and rendered in order, default first. Adding,
 * editing and removing all revalidate this path, so the rendered list is never a
 * stale copy of the database.
 */
export default async function AccountAddressesPage() {
  const access = await getAccountAccess();
  if (!access) redirect(loginPathFor('/account/addresses'));

  const addresses = await fetchAddresses(access.user.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl">Addresses</h2>
        <p className="text-foreground-muted mt-2 max-w-prose text-sm">
          Saved addresses speed up an order request. You can still enter a different address when
          you send one.
        </p>
      </div>

      {addresses.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {addresses.map((address) => (
            <li key={address.id}>
              <AddressCard address={address} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-foreground-muted text-sm">You have no saved addresses yet.</p>
      )}

      <AddAddressDisclosure />
    </div>
  );
}

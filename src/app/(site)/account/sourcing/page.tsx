import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ServiceRequestList } from '@/components/account/service-request-list';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchAccountServiceRequests } from '@/server/repositories/service-repository';
import { getAccountAccess, loginPathFor } from '@/server/services/authorization-service';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Sourcing');

/**
 * The customer's own sourcing.
 *
 * The layout already guards `/account/*`, but the check is repeated here. A page
 * must be safe to render on its own; relying on the layout would mean a future
 * refactor that renders this page elsewhere silently removes the guard, and the
 * failure mode is a query with no owner.
 *
 * `fetchAccountServiceRequests` filters on the session's user id and runs under
 * RLS, so a customer cannot reach another customer's request even if an id were
 * somehow supplied.
 */
export default async function AccountSourcingPage() {
  const access = await getAccountAccess();
  if (!access) redirect(loginPathFor('/account/sourcing'));

  const requests = (await fetchAccountServiceRequests(access.user.id)).filter(
    (request) => request.kind === 'sourcing',
  );

  return <ServiceRequestList kind="sourcing" requests={requests} />;
}

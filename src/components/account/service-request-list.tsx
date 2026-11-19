import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import {
  SERVICE_KIND_COPY,
  serviceStatusLabel,
  serviceStatusTone,
  type ServiceKind,
} from '@/lib/services/presentation';
import type { ServiceRequestSummary } from '@/server/repositories/service-repository';

/**
 * The list body shared by the four service-request account pages.
 *
 * One component rather than four near-identical pages: the pages differ only in
 * which `kind` they filter to, and a layout fix (a wrap bug at 320px, a contrast
 * failure on the badge) must not have to be made four times.
 *
 * The status badge carries a text label, never colour alone. `serviceStatusTone`
 * maps an unrecognised state to neutral rather than throwing, so a workflow state
 * added to an enum later degrades to "shows the raw status" instead of an error
 * page.
 */
export function ServiceRequestList({
  kind,
  requests,
}: {
  kind: ServiceKind;
  requests: ServiceRequestSummary[];
}) {
  const copy = SERVICE_KIND_COPY[kind];

  if (requests.length === 0) {
    return (
      <EmptyState
        title={`No ${copy.title.toLowerCase()} requests yet`}
        description={copy.empty}
        action={
          <Link
            href={copy.startHref}
            className="text-accent-text text-sm font-medium underline-offset-4 hover:underline"
          >
            {copy.startLabel}
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <h2 className="text-xl">{copy.title}</h2>
      <p className="text-foreground-muted mt-2 max-w-prose text-sm">{copy.description}</p>

      <ul className="border-line-300 divide-line-200 mt-6 divide-y rounded-sm border">
        {requests.map((request) => (
          <li
            key={request.id}
            className="flex flex-wrap items-start justify-between gap-3 p-4 sm:items-center"
          >
            <div className="min-w-0">
              <p className="text-foreground font-medium break-words">{request.title}</p>
              <p className="text-foreground-muted mt-1 text-sm">
                {request.reference ? (
                  <span className="font-mono text-xs tracking-wide">{request.reference}</span>
                ) : null}
                {request.reference ? ' · ' : null}
                Sent {formatDate(request.createdAt)}
                {request.slotStart ? ` · Slot ${formatDateTime(request.slotStart)}` : null}
              </p>
            </div>

            <Badge variant={badgeVariant(serviceStatusTone(request.status))}>
              {serviceStatusLabel(request.status)}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function badgeVariant(tone: 'neutral' | 'positive' | 'negative' | 'pending') {
  switch (tone) {
    case 'positive':
      return 'success' as const;
    case 'negative':
      return 'danger' as const;
    case 'pending':
      return 'accent' as const;
    default:
      return 'neutral' as const;
  }
}

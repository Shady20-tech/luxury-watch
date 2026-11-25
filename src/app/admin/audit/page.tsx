import type { Metadata } from 'next';

import { AdminCard, AdminPageHeader, AdminTd, AdminTh, EmptyState } from '@/components/admin/ui';
import { formatAdminDateTime } from '@/lib/admin/format';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { fetchRecentActivity } from '@/server/repositories/admin-dashboard-repository';
import { requirePermission } from '@/server/services/admin-authorization';

/**
 * The audit trail.
 *
 * Read-only, and that is the point: `admin_audit_logs` has no write policy for
 * any API role (0006), so not even a super administrator can edit or delete a
 * row through the application. Writes go through the `SECURITY DEFINER` function,
 * which stamps the actor from `auth.uid()`. A trail that its subject can alter is
 * not a trail.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Audit trail · Administration');

export default async function AdminAuditPage() {
  await requirePermission('audit.read');
  const rows = await fetchRecentActivity(100);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Audit"
        title="Trail of every change"
        description="Every administrative change, newest first. Entries cannot be edited or removed from the application."
        actions={
          <span className="text-ink-500 text-sm tabular-nums">
            {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
          </span>
        }
      />

      <AdminCard title="Recent activity" description="Newest first" flush>
        {rows.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState title="Nothing recorded yet">
              <p>Actions taken in the administration area appear here.</p>
            </EmptyState>
          </div>
        ) : (
          <div className="border-line-200 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <caption className="sr-only">Audit trail</caption>
              <thead>
                <tr>
                  <AdminTh>When</AdminTh>
                  <AdminTh>Actor</AdminTh>
                  <AdminTh>Action</AdminTh>
                  <AdminTh>Entity</AdminTh>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <AdminTd className="text-foreground-muted text-xs whitespace-nowrap tabular-nums">
                      {formatAdminDateTime(row.createdAt)}
                    </AdminTd>
                    <AdminTd className="text-xs">{row.actorEmail ?? 'Unknown'}</AdminTd>
                    <AdminTd className="font-medium">{row.action}</AdminTd>
                    <AdminTd className="text-foreground-muted text-xs">
                      {row.entityType}
                      {row.entityId ? (
                        <span className="block font-mono">{row.entityId.slice(0, 8)}…</span>
                      ) : null}
                    </AdminTd>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}

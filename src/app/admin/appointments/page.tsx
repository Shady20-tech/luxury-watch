import type { Metadata } from 'next';

import {
  AdminPageHeader,
  AdminTable,
  AdminTd,
  AdminTh,
  EmptyState,
  StatusPill,
} from '@/components/admin/ui';
import { formatAdminDateTime } from '@/lib/admin/format';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { listAppointments } from '@/server/repositories/admin-service-repository';
import { requirePermission } from '@/server/services/admin-authorization';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Appointments · Administration');

export default async function AdminAppointmentsPage() {
  await requirePermission('inquiries.read');
  const appointments = await listAppointments();

  return (
    <div>
      <AdminPageHeader
        title="Appointments"
        description="Viewing requests. A slot is only held while the appointment is requested or confirmed; cancelling releases it."
      />

      {appointments.length === 0 ? (
        <EmptyState title="No appointment requests yet" />
      ) : (
        <AdminTable caption="Appointments">
          <thead>
            <tr>
              <AdminTh>Customer</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Requested slot</AdminTh>
              <AdminTh>Received</AdminTh>
            </tr>
          </thead>
          <tbody>
            {appointments.map((appointment) => (
              <tr key={appointment.id}>
                <AdminTd>
                  <span className="block font-medium">{appointment.customerName}</span>
                  <span className="text-foreground-muted block text-xs">
                    {appointment.customerEmail}
                  </span>
                </AdminTd>
                <AdminTd>
                  <StatusPill status={appointment.status} />
                </AdminTd>
                <AdminTd className="text-xs whitespace-nowrap tabular-nums">
                  {appointment.slotStart
                    ? formatAdminDateTime(appointment.slotStart)
                    : 'No slot chosen'}
                </AdminTd>
                <AdminTd className="text-foreground-muted text-xs whitespace-nowrap tabular-nums">
                  {formatAdminDateTime(appointment.createdAt)}
                </AdminTd>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </div>
  );
}

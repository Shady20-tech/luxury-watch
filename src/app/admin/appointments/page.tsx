import type { Metadata } from 'next';
import { CalendarClock, CheckCircle2 } from 'lucide-react';

import {
  AdminCard,
  AdminPageHeader,
  AdminStatCard,
  AdminStatGrid,
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

  const pending = appointments.filter((row) => row.status === 'requested').length;
  const confirmed = appointments.filter((row) => row.status === 'confirmed').length;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Appointments"
        title="Viewing requests"
        description="A slot is only held while the appointment is requested or confirmed; cancelling releases it."
      />

      <AdminStatGrid>
        <li>
          <AdminStatCard label="Total requests" value={appointments.length} icon={CalendarClock} />
        </li>
        <li>
          <AdminStatCard
            label="Awaiting confirmation"
            value={pending}
            detail="Requested, no slot held yet"
            icon={CalendarClock}
          />
        </li>
        <li>
          <AdminStatCard
            label="Confirmed"
            value={confirmed}
            detail="Slot held for the customer"
            icon={CheckCircle2}
          />
        </li>
      </AdminStatGrid>

      <AdminCard title="All appointments" description="Newest first" flush>
        {appointments.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState title="No appointment requests yet" />
          </div>
        ) : (
          <div className="border-line-200 overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <caption className="sr-only">Appointments</caption>
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
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}

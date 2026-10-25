'use client';

import { useActionState, useMemo, useState } from 'react';

import {
  FormError,
  FormSuccess,
  Honeypot,
  SubmitButton,
  TextareaField,
} from '@/components/service/form-parts';
import { Input } from '@/components/ui/input';
import { dayLabel, type BookableSlot } from '@/lib/service/slots';
import { IDLE_SERVICE_STATE } from '@/lib/service/validation';
import { requestAppointmentAction } from '@/server/actions/service-actions';

/**
 * The appointment request form.
 *
 * -----------------------------------------------------------------------------
 * A REQUEST, NOT A CONFIRMED APPOINTMENT
 * -----------------------------------------------------------------------------
 *
 * The confirmation says the request has been received and that the store will
 * confirm it. It does not say "your appointment is booked", because nothing has
 * been confirmed: `request_appointment` writes the status `requested`, and only a
 * member of staff moving it to `confirmed` makes it an appointment. Promising a
 * slot the business has not agreed to would be the failure this wording avoids.
 *
 * -----------------------------------------------------------------------------
 * THE SLOTS COME FROM THE DATABASE'S AVAILABILITY
 * -----------------------------------------------------------------------------
 *
 * `slots` is generated from the active `appointment_availability` windows the
 * server read. A time that is not on this list is refused by the database, so
 * offering only these is what keeps the form's promise and the database's rule
 * the same. When there is no availability configured, the form says so rather
 * than showing an empty picker with no explanation.
 */
const PURPOSES = [
  { value: 'showroom_visit', label: 'Visit the showroom' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'sell_trade', label: 'Sell or trade a watch' },
  { value: 'sourcing', label: 'Sourcing a piece' },
  { value: 'repair', label: 'Repair or restoration' },
] as const;

export function AppointmentForm({
  slots,
  className,
}: {
  slots: BookableSlot[];
  className?: string;
}) {
  const [state, formAction] = useActionState(requestAppointmentAction, IDLE_SERVICE_STATE);
  const [purpose, setPurpose] = useState<string>('showroom_visit');

  // The purpose can narrow which windows apply, so the offered slots are rebuilt
  // when it changes. This is a display concern only: the database re-checks the
  // window that actually applies to the submitted purpose.
  const visibleSlots = useMemo(
    () => slots.filter((slot) => slot.purpose === null || slot.purpose === purpose),
    [slots, purpose],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, BookableSlot[]>();
    for (const slot of visibleSlots) {
      const list = map.get(slot.dayKey) ?? [];
      list.push(slot);
      map.set(slot.dayKey, list);
    }
    return [...map.entries()];
  }, [visibleSlots]);

  if (state.status === 'success') {
    return (
      <FormSuccess
        state={state}
        heading="Thank you — your appointment request has been received"
        body={
          <p>
            This is a request, not a confirmed appointment. A member of the team will check the slot
            and contact you to confirm, reschedule or suggest another time.
          </p>
        }
        footnote={<p>Please do not travel to the showroom until we have confirmed.</p>}
      />
    );
  }

  const fieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className={className} noValidate>
      <Honeypot id="appointment-company" />
      <FormError state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="appointment-name"
          name="name"
          label="Your name"
          autoComplete="name"
          required
          error={fieldErrors.name}
        />
        <Input
          id="appointment-email"
          name="email"
          type="email"
          label="Email address"
          autoComplete="email"
          required
          error={fieldErrors.email}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          id="appointment-phone"
          name="phone"
          type="tel"
          label="Phone number (optional)"
          autoComplete="tel"
          error={fieldErrors.phone}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="appointment-purpose" className="text-sm font-medium">
            What is the appointment for?
          </label>
          <select
            id="appointment-purpose"
            name="purpose"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
            className="border-line-300 bg-surface-0 text-foreground focus-visible:border-gold-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-700 h-11 rounded-sm border px-3 text-sm"
          >
            {PURPOSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="mt-6">
        <legend className="text-sm font-medium">Choose a time</legend>

        {grouped.length === 0 ? (
          <p className="border-line-200 bg-surface-100 text-foreground-muted mt-3 rounded-sm border p-4 text-sm">
            There are no appointment times available for this purpose at the moment. Please send us
            a message instead and we will arrange a time with you.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-4">
            {grouped.map(([dayKey, daySlots]) => (
              <div key={dayKey}>
                <p className="text-foreground text-sm font-medium">{dayLabel(dayKey)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {daySlots.map((slot) => (
                    <label
                      key={slot.value}
                      className="border-line-300 has-checked:border-gold-700 has-checked:bg-gold-700/5 focus-within:outline-gold-700 flex h-11 cursor-pointer items-center rounded-sm border px-4 text-sm focus-within:outline-2 focus-within:outline-offset-2"
                    >
                      <input
                        type="radio"
                        name="slotStart"
                        value={slot.value}
                        required
                        className="sr-only"
                      />
                      {slot.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {fieldErrors.slotStart ? (
          <p className="text-danger-600 mt-2 text-xs font-medium">{fieldErrors.slotStart}</p>
        ) : null}
      </fieldset>

      <div className="mt-6">
        <TextareaField
          id="appointment-note"
          name="customerNote"
          label="Anything you would like us to know (optional)"
          rows={4}
          error={fieldErrors.customerNote}
          hint="For example, the piece you would like to see."
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton label="Request appointment" />
        <p className="text-ink-500 text-xs">We will confirm before the appointment is booked.</p>
      </div>
    </form>
  );
}

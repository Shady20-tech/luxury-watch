'use client';

import { useActionState } from 'react';

import {
  CheckboxField,
  FormError,
  FormSuccess,
  Honeypot,
  SubmitButton,
  TextareaField,
} from '@/components/service/form-parts';
import { Input } from '@/components/ui/input';
import { IDLE_SERVICE_STATE } from '@/lib/service/validation';
import { submitRepairAction } from '@/server/actions/service-actions';

/**
 * The repair / restoration request form.
 *
 * The confirmation makes clear that a request is not a quote: the estimate comes
 * after the watch has been inspected, and the customer approves it before any
 * work starts. Saying that here is what stops the form being read as a booking
 * for work at a price.
 */
export function RepairForm({ className }: { className?: string }) {
  const [state, formAction] = useActionState(submitRepairAction, IDLE_SERVICE_STATE);

  if (state.status === 'success') {
    return (
      <FormSuccess
        state={state}
        heading="Thank you — your repair request has been received"
        body={
          <p>
            A member of the team will review the details you provided. We will inspect the watch and
            send you an estimate before any work begins.
          </p>
        }
        footnote={<p>No work has been booked and no payment has been made.</p>}
      />
    );
  }

  const fieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className={className} noValidate>
      <Honeypot id="repair-company" />
      <FormError state={state} />

      <fieldset className="border-line-200 rounded-sm border p-5">
        <legend className="px-2 text-sm font-semibold">About you</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="repair-name"
            name="name"
            label="Your name"
            autoComplete="name"
            required
            error={fieldErrors.name}
          />
          <Input
            id="repair-email"
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
            id="repair-phone"
            name="phone"
            type="tel"
            label="Phone number (optional)"
            autoComplete="tel"
            error={fieldErrors.phone}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="repair-preferred-contact" className="text-sm font-medium">
              Preferred contact method (optional)
            </label>
            <select
              id="repair-preferred-contact"
              name="preferredContact"
              defaultValue=""
              className="border-field-border bg-field text-foreground focus-visible:border-gold-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-700 h-11 rounded-sm border px-3 text-sm"
            >
              <option value="">No preference</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="either">Either</option>
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="border-line-200 mt-6 rounded-sm border p-5">
        <legend className="px-2 text-sm font-semibold">The watch</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input id="repair-brand" name="brandName" label="Brand" error={fieldErrors.brandName} />
          <Input id="repair-model" name="modelName" label="Model" error={fieldErrors.modelName} />
          <Input
            id="repair-reference"
            name="referenceNumber"
            label="Reference number"
            error={fieldErrors.referenceNumber}
          />
          <Input
            id="repair-service"
            name="serviceType"
            label="Requested service (optional)"
            hint="For example: full service, polish, crystal replacement."
            error={fieldErrors.serviceType}
          />
        </div>

        <div className="mt-4">
          <Input
            id="repair-issue"
            name="issueSummary"
            label="Summary of the issue (optional)"
            hint="One line, for example: losing time."
            error={fieldErrors.issueSummary}
          />
        </div>

        <div className="mt-4">
          <Input
            id="repair-budget"
            name="budgetCents"
            type="number"
            inputMode="decimal"
            label="Budget (optional)"
            hint="An approximate figure, if you have one in mind."
            error={fieldErrors.budgetCents}
          />
        </div>

        <div className="mt-4">
          <CheckboxField
            id="repair-insured"
            name="isInsured"
            label="The watch is insured"
            hint="This can help when we discuss shipping."
          />
        </div>
      </fieldset>

      <div className="mt-6">
        <TextareaField
          id="repair-description"
          name="description"
          label="Describe what the watch needs"
          required
          error={fieldErrors.description}
          hint="When it started, how it behaves, and any service history you know of."
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton label="Send request" />
        <p className="text-ink-500 text-xs">We use your details only to respond to this request.</p>
      </div>
    </form>
  );
}

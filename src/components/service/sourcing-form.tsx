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
import { submitSourcingAction } from '@/server/actions/service-actions';

/**
 * The watch sourcing request form.
 *
 * A sourcing request is a search, not a purchase: the customer describes what
 * they are looking for and the store looks for it. The confirmation says that,
 * so the request is not read as an order.
 */
export function SourcingForm({ className }: { className?: string }) {
  const [state, formAction] = useActionState(submitSourcingAction, IDLE_SERVICE_STATE);

  if (state.status === 'success') {
    return (
      <FormSuccess
        state={state}
        heading="Thank you — we will start looking"
        body={
          <p>
            We have your search criteria and will let you know if we find a piece that matches. If
            we do, we will send you the details before anything is agreed.
          </p>
        }
        footnote={<p>Nothing has been ordered and no payment has been made.</p>}
      />
    );
  }

  const fieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className={className} noValidate>
      <Honeypot id="sourcing-company" />
      <FormError state={state} />

      <fieldset className="border-line-200 rounded-sm border p-5">
        <legend className="px-2 text-sm font-semibold">About you</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="sourcing-name"
            name="name"
            label="Your name"
            autoComplete="name"
            required
            error={fieldErrors.name}
          />
          <Input
            id="sourcing-email"
            name="email"
            type="email"
            label="Email address"
            autoComplete="email"
            required
            error={fieldErrors.email}
          />
        </div>
        <div className="mt-4">
          <Input
            id="sourcing-phone"
            name="phone"
            type="tel"
            label="Phone number (optional)"
            autoComplete="tel"
            error={fieldErrors.phone}
          />
        </div>
      </fieldset>

      <fieldset className="border-line-200 mt-6 rounded-sm border p-5">
        <legend className="px-2 text-sm font-semibold">What you are looking for</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input id="sourcing-brand" name="brandName" label="Brand" error={fieldErrors.brandName} />
          <Input id="sourcing-model" name="modelName" label="Model" error={fieldErrors.modelName} />
          <Input
            id="sourcing-reference"
            name="referenceNumber"
            label="Reference number"
            error={fieldErrors.referenceNumber}
          />
          <Input
            id="sourcing-dial"
            name="dialColor"
            label="Dial colour (optional)"
            error={fieldErrors.dialColor}
          />
          <Input
            id="sourcing-bracelet"
            name="braceletType"
            label="Bracelet (optional)"
            error={fieldErrors.braceletType}
          />
          <Input
            id="sourcing-budget"
            name="maxBudgetCents"
            type="number"
            inputMode="decimal"
            label="Budget (optional)"
            hint="An approximate upper figure helps us search."
            error={fieldErrors.maxBudgetCents}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            id="sourcing-min-year"
            name="minYear"
            type="number"
            inputMode="numeric"
            label="Earliest year (optional)"
            error={fieldErrors.minYear}
          />
          <Input
            id="sourcing-max-year"
            name="maxYear"
            type="number"
            inputMode="numeric"
            label="Latest year (optional)"
            error={fieldErrors.maxYear}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            id="sourcing-material"
            name="material"
            label="Case material (optional)"
            hint="For example: stainless steel, rose gold."
            error={fieldErrors.material}
          />
          <Input
            id="sourcing-condition"
            name="conditionPreference"
            label="Condition preference (optional)"
            hint="For example: unworn only, or happy with light wear."
            error={fieldErrors.conditionPreference}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <CheckboxField id="sourcing-box" name="requiresBox" label="Box is essential" />
          <CheckboxField id="sourcing-papers" name="requiresPapers" label="Papers are essential" />
        </div>
      </fieldset>

      <div className="mt-6">
        <TextareaField
          id="sourcing-notes"
          name="notes"
          label="Anything else we should know"
          required
          error={fieldErrors.notes}
          hint="Box and papers requirements, condition preference, or a specific variation you are after."
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton label="Send request" />
        <p className="text-ink-500 text-xs">We use your details only to respond to this request.</p>
      </div>
    </form>
  );
}

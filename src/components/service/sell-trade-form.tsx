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
import { submitSellTradeAction } from '@/server/actions/service-actions';

/**
 * The sell / trade request form.
 *
 * A real `<form>` bound to a server action, so it works with JavaScript disabled
 * and there is no JSON payload to tamper with. Every value is re-validated and
 * bounded inside `submit_sell_trade_request`, so the schema here is for a useful
 * message before a round trip, not a boundary.
 *
 * The success panel says the request has been received and that a valuation
 * follows. It deliberately does not quote a figure: nothing has been valued, and
 * a number on this screen would be read as an offer.
 */
export function SellTradeForm({ className }: { className?: string }) {
  const [state, formAction] = useActionState(submitSellTradeAction, IDLE_SERVICE_STATE);

  if (state.status === 'success') {
    return (
      <FormSuccess
        state={state}
        heading="Thank you — your request has been received"
        body={
          <p>
            A member of the team will review the details you provided and contact you to discuss a
            valuation. If we need photographs or further information, we will ask.
          </p>
        }
        footnote={<p>Nothing has been agreed and no payment has been made.</p>}
      />
    );
  }

  const fieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className={className} noValidate>
      <Honeypot id="sell-trade-company" />
      <FormError state={state} />

      <fieldset className="border-line-200 rounded-sm border p-5">
        <legend className="px-2 text-sm font-semibold">About you</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="sell-name"
            name="name"
            label="Your name"
            autoComplete="name"
            required
            error={fieldErrors.name}
          />
          <Input
            id="sell-email"
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
            id="sell-phone"
            name="phone"
            type="tel"
            label="Phone number (optional)"
            autoComplete="tel"
            hint="Only if you would prefer a call back."
            error={fieldErrors.phone}
          />
        </div>
      </fieldset>

      <fieldset className="border-line-200 mt-6 rounded-sm border p-5">
        <legend className="px-2 text-sm font-semibold">The watch</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input id="sell-brand" name="brandName" label="Brand" error={fieldErrors.brandName} />
          <Input id="sell-model" name="modelName" label="Model" error={fieldErrors.modelName} />
          <Input
            id="sell-reference"
            name="referenceNumber"
            label="Reference number"
            error={fieldErrors.referenceNumber}
          />
          <Input
            id="sell-year"
            name="productionYear"
            type="number"
            inputMode="numeric"
            label="Year of production (optional)"
            error={fieldErrors.productionYear}
          />
        </div>

        <div className="mt-4">
          <Input
            id="sell-condition"
            name="conditionNotes"
            label="Condition (optional)"
            hint="For example: unworn, worn regularly, serviced in 2024."
            error={fieldErrors.conditionNotes}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <CheckboxField id="sell-box" name="hasBox" label="Box included" />
          <CheckboxField id="sell-papers" name="hasPapers" label="Papers included" />
        </div>
      </fieldset>

      <fieldset className="border-line-200 mt-6 rounded-sm border p-5">
        <legend className="px-2 text-sm font-semibold">What you would like</legend>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sell-transaction" className="text-sm font-medium">
            Sell or trade
          </label>
          <select
            id="sell-transaction"
            name="transactionType"
            defaultValue="sell"
            aria-invalid={fieldErrors.transactionType ? true : undefined}
            aria-describedby={fieldErrors.transactionType ? 'sell-transaction-error' : undefined}
            className="border-line-300 bg-surface-0 text-foreground focus-visible:border-gold-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-700 h-11 rounded-sm border px-3 text-sm"
          >
            <option value="sell">I would like to sell it</option>
            <option value="trade">I would like to trade it</option>
          </select>
          {fieldErrors.transactionType ? (
            <p id="sell-transaction-error" className="text-danger-600 text-xs font-medium">
              {fieldErrors.transactionType}
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          <Input
            id="sell-asking"
            name="askingPriceCents"
            type="number"
            inputMode="decimal"
            label="Asking price (optional)"
            hint="The figure you have in mind. This is not an offer and nothing is agreed until we confirm it."
            error={fieldErrors.askingPriceCents}
          />
        </div>
      </fieldset>

      <div className="mt-6">
        <TextareaField
          id="sell-description"
          name="description"
          label="Tell us about the watch"
          required
          error={fieldErrors.description}
          hint="Provenance, service history and anything else that would help us value it."
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton label="Send request" />
        <p className="text-ink-500 text-xs">We use your details only to respond to this request.</p>
      </div>
    </form>
  );
}

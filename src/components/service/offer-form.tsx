'use client';

import { useActionState } from 'react';

import {
  FormError,
  FormSuccess,
  Honeypot,
  SubmitButton,
  TextareaField,
} from '@/components/service/form-parts';
import { Input } from '@/components/ui/input';
import { IDLE_SERVICE_STATE } from '@/lib/service/validation';
import { submitOfferAction } from '@/server/actions/service-actions';

/**
 * The make-an-offer form.
 *
 * -----------------------------------------------------------------------------
 * WHY AN OFFER IS NOT A PURCHASE
 * -----------------------------------------------------------------------------
 *
 * The confirmation says the offer has been received and that the store will
 * respond. It does not say the piece is the customer's, and the form is explicit
 * that nothing is agreed until the store accepts. An offer on a unique piece is
 * the flow where a customer is most likely to assume they have bought something,
 * so the wording has to be unambiguous in both the label and the confirmation.
 *
 * The amount is submitted in major units and converted to minor units in the
 * action. `submit_product_offer` re-validates it as a positive integer, so a
 * tampered figure is a shape error there rather than an accepted value.
 */
export function OfferForm({
  productSlug,
  productTitle,
  className,
}: {
  productSlug: string;
  productTitle: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(submitOfferAction, IDLE_SERVICE_STATE);

  if (state.status === 'success') {
    return (
      <FormSuccess
        state={state}
        heading="Thank you — your offer has been received"
        body={
          <p>
            A member of the team will review your offer on the {productTitle} and reply to the email
            address you provided.
          </p>
        }
        footnote={
          <p>
            This is an offer, not a purchase. The piece is not reserved and nothing is agreed until
            the store accepts in writing.
          </p>
        }
      />
    );
  }

  const fieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className={className} noValidate>
      <input type="hidden" name="productSlug" value={productSlug} />
      <Honeypot id="offer-company" />
      <FormError state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="offer-name"
          name="name"
          label="Your name"
          autoComplete="name"
          required
          error={fieldErrors.name}
        />
        <Input
          id="offer-email"
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
          id="offer-phone"
          name="phone"
          type="tel"
          label="Phone number (optional)"
          autoComplete="tel"
          error={fieldErrors.phone}
        />
        <Input
          id="offer-amount"
          name="amount"
          type="number"
          inputMode="decimal"
          min="1"
          step="0.01"
          label="Your offer"
          hint="In the store's currency, as a number."
          required
          error={fieldErrors.amount}
        />
      </div>

      <div className="mt-4">
        <TextareaField
          id="offer-message"
          name="message"
          label="Anything you would like to add (optional)"
          rows={4}
          error={fieldErrors.message}
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton label="Send offer" />
        <p className="text-ink-500 text-xs">
          An offer does not reserve the piece. Nothing is agreed until the store accepts.
        </p>
      </div>
    </form>
  );
}

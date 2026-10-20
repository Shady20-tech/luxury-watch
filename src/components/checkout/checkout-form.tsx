'use client';

import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CheckoutView } from '@/server/services/checkout-service';
import type { OrderRequestState } from '@/lib/orders/order-request';
import { ORDER_COPY } from '@/lib/orders/copy';
import { submitOrderRequestAction } from '@/server/actions/order-actions';

/**
 * The order-request form.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS SENT, AND WHAT IS NOT
 * -----------------------------------------------------------------------------
 *
 * The form posts product ids and quantities, who the customer is, how they want
 * to receive the piece, how they intend to settle, and a discount *code*. It
 * posts no price, no subtotal, no fee and no discount amount, and there is no
 * field here to hold one. `submit_order_request` re-derives every figure from the
 * catalogue. A tampered form can change which product is requested; it cannot
 * change what it costs.
 *
 * The items travel as one hidden JSON field because a form posts strings and a
 * server action cannot receive a nested object. They are re-validated in the
 * action and again in the database.
 *
 * -----------------------------------------------------------------------------
 * NO PAYMENT FIELDS, ON PURPOSE
 * -----------------------------------------------------------------------------
 *
 * There is no card-detail field and no gateway field anywhere in this file, and
 * adding one would fail the CI guard. The customer chooses how they intend to
 * settle — a bank transfer, payment on collection — and an administrator settles
 * it offline.
 *
 * -----------------------------------------------------------------------------
 * USABLE WITHOUT JAVASCRIPT
 * -----------------------------------------------------------------------------
 *
 * A real `<form>` bound to a server action through `useActionState`. The
 * delivery-address fields are revealed by client state, but they are always in
 * the DOM and the server validates them by fulfilment type, so a no-JS customer
 * can still complete a delivery request by filling the fields that are present.
 */
const INITIAL_STATE: OrderRequestState = { status: 'idle' };

function SubmitButton({ disabled }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" loading={pending} disabled={disabled} className="w-full sm:w-auto">
      {pending ? 'Sending request…' : 'Send order request'}
    </Button>
  );
}

export function CheckoutForm({ checkout }: { checkout: CheckoutView }) {
  const [state, formAction] = useActionState(submitOrderRequestAction, INITIAL_STATE);
  const [fulfilment, setFulfilment] = useState<'delivery' | 'pickup'>(
    checkout.options.canDeliver ? 'delivery' : 'pickup',
  );
  const [paymentCode, setPaymentCode] = useState(checkout.options.paymentMethods[0]?.code ?? '');

  const { cart, options } = checkout;

  const selectedMethod = options.paymentMethods.find((method) => method.code === paymentCode);

  // The exact lines the cart currently holds, for the server to re-price. Only
  // ids and quantities; the server never reads a price from here.
  const items = cart.lines
    .filter((line) => line.purchasable)
    .map((line) => ({ productId: line.productId, quantity: line.quantity }));

  if (state.status === 'success') {
    return <OrderReceived state={state} />;
  }

  const fieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  // A card with an unavailable line is not submitted, because the line cannot be
  // requested and sending the form without it would drop it without saying so.
  // The customer is told to resolve the cart instead.
  const blockedByUnavailable = cart.hasUnavailable;
  const disableSubmit = items.length === 0 || !options.canSettle || blockedByUnavailable;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-8">
      <input type="hidden" name="items" value={JSON.stringify(items)} readOnly />
      <input type="hidden" name="idempotencyKey" value={checkout.idempotencyKey} readOnly />
      {/* The code the cart already applied. The value is a code, never an amount. */}
      {cart.discountCode?.applied ? (
        <input type="hidden" name="discountCode" value={cart.discountCode.code} readOnly />
      ) : null}

      {/* Honeypot. Hidden from sight and from assistive technology, and never
          focusable, so only an automated submission fills it. */}
      <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden">
        <label htmlFor="checkout-company">Company (leave blank)</label>
        <input id="checkout-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="border-danger-600/30 bg-danger-600/5 rounded-sm border p-3 text-sm"
        >
          {state.message}
        </p>
      ) : null}

      {items.length === 0 || blockedByUnavailable ? (
        <p
          role="alert"
          className="border-line-300 bg-surface-100 text-foreground-muted rounded-sm border p-3 text-sm"
        >
          {blockedByUnavailable
            ? 'One or more pieces in your cart are no longer available. Return to your cart and remove them before sending this request — nothing has been dropped silently.'
            : 'None of the pieces in your cart can be requested as they stand. Please return to your cart and review them.'}
        </p>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Who you are                                                        */}
      {/* ------------------------------------------------------------------ */}
      <fieldset className="flex flex-col gap-4">
        <legend className="font-display text-lg">Your details</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="checkout-name"
            name="customerName"
            label="Your name"
            autoComplete="name"
            required
            error={fieldErrors.customerName}
          />
          <Input
            id="checkout-email"
            name="customerEmail"
            type="email"
            label="Email address"
            autoComplete="email"
            required
            error={fieldErrors.customerEmail}
            hint="We will reply here to confirm availability."
          />
        </div>

        <Input
          id="checkout-phone"
          name="customerPhone"
          type="tel"
          label="Phone number (optional)"
          autoComplete="tel"
          hint="Only if you would prefer a call back."
          error={fieldErrors.customerPhone}
        />
      </fieldset>

      {/* ------------------------------------------------------------------ */}
      {/* How to receive it                                                  */}
      {/* ------------------------------------------------------------------ */}
      <fieldset className="flex flex-col gap-4">
        <legend className="font-display text-lg">How you would like to receive it</legend>

        <div className="flex flex-col gap-3">
          {options.canDeliver ? (
            <FulfilmentOption
              value="delivery"
              label="Delivery"
              description="We will confirm the delivery fee and arrange a suitable time."
              checked={fulfilment === 'delivery'}
              onChange={() => setFulfilment('delivery')}
              name="fulfilmentType"
            />
          ) : null}

          <FulfilmentOption
            value="pickup"
            label="Collect in person"
            description={
              options.pickupLocation
                ? `Collect from ${options.pickupLocation}.`
                : 'We will confirm the collection location with you.'
            }
            checked={fulfilment === 'pickup'}
            onChange={() => setFulfilment('pickup')}
            name="fulfilmentType"
          />
        </div>

        {fieldErrors.fulfilmentType ? (
          <p className="text-danger-600 text-xs font-medium">{fieldErrors.fulfilmentType}</p>
        ) : null}

        {/* Always in the DOM so a no-JS customer can complete a delivery
            request. They are validated only when delivery is chosen. */}
        <div
          hidden={fulfilment !== 'delivery'}
          className="border-line-200 bg-surface-50 flex flex-col gap-4 rounded-sm border p-4"
        >
          <p className="text-foreground-muted text-sm">Where should we deliver?</p>

          <Input
            id="checkout-delivery-line1"
            name="deliveryLine1"
            label="Address line 1"
            autoComplete="address-line1"
            error={fieldErrors.deliveryLine1}
          />
          <Input
            id="checkout-delivery-line2"
            name="deliveryLine2"
            label="Address line 2 (optional)"
            autoComplete="address-line2"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="checkout-delivery-city"
              name="deliveryCity"
              label="Town or city"
              autoComplete="address-level2"
              error={fieldErrors.deliveryCity}
            />
            <Input
              id="checkout-delivery-region"
              name="deliveryRegion"
              label="County or region (optional)"
              autoComplete="address-level1"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="checkout-delivery-postal"
              name="deliveryPostalCode"
              label="Post or ZIP code (optional)"
              autoComplete="postal-code"
            />
            <Input
              id="checkout-delivery-country"
              name="deliveryCountryCode"
              label="Country code"
              autoComplete="country"
              maxLength={2}
              hint="Two letters, for example GB."
              error={fieldErrors.deliveryCountryCode}
            />
          </div>
        </div>
      </fieldset>

      {/* ------------------------------------------------------------------ */}
      {/* How to settle                                                      */}
      {/* ------------------------------------------------------------------ */}
      <fieldset className="flex flex-col gap-4">
        <legend className="font-display text-lg">How you would like to settle</legend>

        <p className="border-line-300 bg-surface-100 text-foreground-muted rounded-sm border p-3 text-xs">
          {ORDER_COPY.noPaymentNotice}
        </p>

        {options.canSettle ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="checkout-payment" className="text-sm font-medium">
              Settlement method
            </label>
            <select
              id="checkout-payment"
              name="paymentMethodCode"
              required
              value={paymentCode}
              onChange={(event) => setPaymentCode(event.target.value)}
              aria-invalid={fieldErrors.paymentMethodCode ? true : undefined}
              aria-describedby={
                fieldErrors.paymentMethodCode ? 'checkout-payment-error' : undefined
              }
              className="border-line-300 bg-surface-0 text-foreground focus-visible:border-gold-700 focus-visible:outline-gold-700 h-11 rounded-sm border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1"
            >
              {options.paymentMethods.map((method) => (
                <option key={method.code} value={method.code}>
                  {method.label}
                </option>
              ))}
            </select>
            {fieldErrors.paymentMethodCode ? (
              <p id="checkout-payment-error" className="text-danger-600 text-xs font-medium">
                {fieldErrors.paymentMethodCode}
              </p>
            ) : null}

            {/* The guidance for the chosen method, so the customer knows the next
                step before they send the request. */}
            {selectedMethod && (selectedMethod.instructions ?? selectedMethod.description) ? (
              <p className="text-foreground-muted text-xs">
                {selectedMethod.instructions ?? selectedMethod.description}
              </p>
            ) : null}
          </div>
        ) : (
          <p role="alert" className="text-danger-600 text-sm">
            No settlement method is configured at the moment, so an order request cannot be
            submitted online. Please contact us directly.
          </p>
        )}

        {options.canDeliver ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="checkout-delivery-option" className="text-sm font-medium">
              Delivery option
            </label>
            <select
              id="checkout-delivery-option"
              name="deliveryOptionCode"
              defaultValue={options.deliveryOptions[0]?.code ?? ''}
              className="border-line-300 bg-surface-0 text-foreground focus-visible:border-gold-700 focus-visible:outline-gold-700 h-11 rounded-sm border px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1"
            >
              {options.deliveryOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label} — {option.fee}
                </option>
              ))}
            </select>
            <p className="text-ink-500 text-xs">
              The fee shown is confirmed again from the catalogue when the request is submitted.
            </p>
          </div>
        ) : null}
      </fieldset>

      {/* ------------------------------------------------------------------ */}
      {/* Anything else                                                      */}
      {/* ------------------------------------------------------------------ */}
      <fieldset className="flex flex-col gap-3">
        <legend className="font-display text-lg">Anything else</legend>
        <label htmlFor="checkout-note" className="text-sm font-medium">
          Note (optional)
        </label>
        <textarea
          id="checkout-note"
          name="customerNote"
          rows={4}
          aria-invalid={fieldErrors.customerNote ? true : undefined}
          aria-describedby={fieldErrors.customerNote ? 'checkout-note-error' : undefined}
          className="border-line-300 bg-surface-0 text-foreground focus-visible:border-gold-700 focus-visible:outline-gold-700 rounded-sm border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1"
          placeholder="Delivery timing, a question about the piece, or anything we should know."
        />
        {fieldErrors.customerNote ? (
          <p id="checkout-note-error" className="text-danger-600 text-xs font-medium">
            {fieldErrors.customerNote}
          </p>
        ) : null}
      </fieldset>

      {/* ------------------------------------------------------------------ */}
      {/* Terms and submit                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="border-line-200 flex flex-col gap-4 border-t pt-6">
        <div className="flex items-start gap-3">
          <input
            id="checkout-terms"
            name="termsAccepted"
            type="checkbox"
            required
            aria-invalid={fieldErrors.termsAccepted ? true : undefined}
            aria-describedby={fieldErrors.termsAccepted ? 'checkout-terms-error' : undefined}
            className="border-line-300 text-gold-700 focus-visible:outline-gold-700 mt-1 h-4 w-4 rounded-sm border focus-visible:outline-2 focus-visible:outline-offset-2"
          />
          <label htmlFor="checkout-terms" className="text-sm">
            {ORDER_COPY.termsLabel}{' '}
            <Link href="/pages/terms" className="underline">
              Terms of sale
            </Link>{' '}
            and{' '}
            <Link href="/pages/privacy" className="underline">
              privacy notice
            </Link>
            .
          </label>
        </div>
        {fieldErrors.termsAccepted ? (
          <p id="checkout-terms-error" className="text-danger-600 text-xs font-medium">
            {fieldErrors.termsAccepted}
          </p>
        ) : null}

        <SubmitButton disabled={disableSubmit} />
        <p className="text-ink-500 text-xs">
          Nothing is charged now. Sending this request asks us to hold the piece for you, and it is
          held from the moment the request is submitted — we release it again if the request is
          declined or you cancel it.
        </p>
      </div>
    </form>
  );
}

/** A radio-style option for how the piece is received. */
function FulfilmentOption({
  value,
  label,
  description,
  checked,
  onChange,
  name,
}: {
  value: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  name: string;
}) {
  return (
    <label className="border-line-300 has-checked:border-gold-700 flex cursor-pointer items-start gap-3 rounded-sm border p-3">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="text-gold-700 focus-visible:outline-gold-700 mt-1 h-4 w-4 focus-visible:outline-2 focus-visible:outline-offset-2"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="text-foreground-muted block text-xs">{description}</span>
      </span>
    </label>
  );
}

/** The confirmation panel, shown in place of the form. */
function OrderReceived({ state }: { state: Extract<OrderRequestState, { status: 'success' }> }) {
  const { reference, accessToken } = state.receipt;

  return (
    <div role="status" className="flex flex-col gap-4">
      <div className="border-success-600/30 bg-success-600/5 flex items-start gap-3 rounded-sm border p-5">
        <CheckCircle2 aria-hidden="true" className="text-success-600 mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h2 className="text-lg font-semibold">{ORDER_COPY.successTitle}</h2>
          <p className="text-foreground-muted mt-1 text-sm">{ORDER_COPY.successBody}</p>

          {reference ? (
            <p className="text-foreground-muted mt-3 text-sm">
              Your reference is{' '}
              <strong className="text-foreground font-semibold">{reference}</strong>.{' '}
              {ORDER_COPY.keepReference}
            </p>
          ) : null}
        </div>
      </div>

      {reference && accessToken ? (
        <div className="border-line-200 rounded-sm border p-5">
          <h3 className="text-sm font-semibold">Keep this private link</h3>
          <p className="text-foreground-muted mt-1 text-sm">
            This is the only time this link is shown. Save it to check on your request without an
            account — anyone with it can read this request, so keep it private.
          </p>
          <p className="mt-3">
            <Link
              href={`/order/${encodeURIComponent(reference)}?token=${encodeURIComponent(accessToken)}`}
              className="text-accent-text break-all text-sm underline"
            >
              View your order request
            </Link>
          </p>
        </div>
      ) : null}

      <Button asChild variant="secondary" className="w-full sm:w-auto">
        <Link href="/shop">Continue shopping</Link>
      </Button>
    </div>
  );
}

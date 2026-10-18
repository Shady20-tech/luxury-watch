'use client';

import { CheckCircle2 } from 'lucide-react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { EnquiryState } from '@/lib/product/enquiry';
import { submitEnquiry } from '@/server/actions/product-actions';

/**
 * Product enquiry form.
 *
 * A real `<form>` bound to a server action through `useActionState`, so the form
 * is usable with JavaScript disabled: the browser posts it and the action's
 * returned state is rendered on the server. No client-side fetch, no JSON
 * payload to tamper with.
 *
 * `useFormStatus` drives the busy state from the form's own submission status
 * rather than local state, so the button cannot get stuck reporting "Sending"
 * after the action has finished.
 *
 * The success panel replaces the form rather than sitting above it. Leaving the
 * fields filled in after a successful send invites a duplicate submission, and
 * the reference is the one thing the visitor needs to keep.
 */
const INITIAL_STATE: EnquiryState = { status: 'idle' };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" loading={pending} className="w-full sm:w-auto">
      {pending ? 'Sending…' : label}
    </Button>
  );
}

export function EnquiryForm({
  productSlug,
  productTitle,
  className,
}: {
  productSlug: string;
  productTitle: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(submitEnquiry, INITIAL_STATE);

  if (state.status === 'success') {
    return (
      <div role="status" className={className}>
        <div className="border-success-600/30 bg-success-600/5 flex items-start gap-3 rounded-sm border p-5">
          <CheckCircle2 aria-hidden="true" className="text-success-600 mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h3 className="text-base font-semibold">Thank you — your enquiry has been received</h3>
            <p className="text-foreground-muted mt-1 text-sm">
              We have your message about the {productTitle}. A member of the team will reply to the
              email address you provided.
            </p>
            {state.reference ? (
              <p className="text-foreground-muted mt-3 text-sm">
                Your reference is{' '}
                <strong className="text-foreground font-semibold">{state.reference}</strong>. Quote
                it if you contact us again about this piece.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const fieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className={className} noValidate>
      <input type="hidden" name="productSlug" value={productSlug} />

      {/* Honeypot. Hidden from sight and from assistive technology, and never
          focusable, so only an automated submission fills it. */}
      <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden">
        <label htmlFor="enquiry-company">Company (leave blank)</label>
        <input id="enquiry-company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.status === 'error' ? (
        <p
          role="alert"
          className="border-danger-600/30 bg-danger-600/5 mb-4 rounded-sm border p-3 text-sm"
        >
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="enquiry-name"
          name="name"
          label="Your name"
          autoComplete="name"
          required
          error={fieldErrors.name}
        />
        <Input
          id="enquiry-email"
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
          id="enquiry-phone"
          name="phone"
          type="tel"
          label="Phone number (optional)"
          autoComplete="tel"
          hint="Only if you would prefer a call back."
          error={fieldErrors.phone}
        />
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor="enquiry-message" className="text-sm font-medium">
          Your question
        </label>
        <textarea
          id="enquiry-message"
          name="message"
          rows={5}
          required
          aria-invalid={fieldErrors.message ? true : undefined}
          aria-describedby={fieldErrors.message ? 'enquiry-message-error' : undefined}
          className="border-line-300 bg-surface-0 text-foreground focus-visible:border-gold-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-700 rounded-sm border px-3 py-2 text-sm"
          placeholder="Ask about condition, provenance, servicing or delivery."
        />
        {fieldErrors.message ? (
          <p id="enquiry-message-error" className="text-danger-600 text-xs font-medium">
            {fieldErrors.message}
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton label="Send enquiry" />
        <p className="text-ink-500 text-xs">We use your details only to answer this enquiry.</p>
      </div>
    </form>
  );
}

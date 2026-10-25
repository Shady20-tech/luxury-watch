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
import { submitContactAction } from '@/server/actions/service-actions';

/**
 * The contact form.
 *
 * Saves to `contact_submissions` through `submit_contact_message`, which
 * validates the shape and enforces a per-address rate limit inside Postgres. The
 * honeypot is the cheap first filter; the rate limit is the one that holds when a
 * bot fills it correctly.
 */
export function ContactForm({ className }: { className?: string }) {
  const [state, formAction] = useActionState(submitContactAction, IDLE_SERVICE_STATE);

  if (state.status === 'success') {
    return (
      <FormSuccess
        state={state}
        heading="Thank you — your message has been received"
        body={
          <p>
            A member of the team will reply to the email address you provided. If your message is
            about a specific piece, mentioning its reference helps us answer faster.
          </p>
        }
      />
    );
  }

  const fieldErrors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className={className} noValidate>
      <Honeypot id="contact-company" />
      <FormError state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="contact-name"
          name="name"
          label="Your name"
          autoComplete="name"
          required
          error={fieldErrors.name}
        />
        <Input
          id="contact-email"
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
          id="contact-phone"
          name="phone"
          type="tel"
          label="Phone number (optional)"
          autoComplete="tel"
          error={fieldErrors.phone}
        />
        <Input
          id="contact-subject"
          name="subject"
          label="Subject (optional)"
          error={fieldErrors.subject}
        />
      </div>

      <div className="mt-4">
        <TextareaField
          id="contact-message"
          name="message"
          label="Your message"
          required
          error={fieldErrors.message}
          placeholder="Ask about a piece, a service, or anything else."
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton label="Send message" />
        <p className="text-ink-500 text-xs">We use your details only to answer this message.</p>
      </div>
    </form>
  );
}

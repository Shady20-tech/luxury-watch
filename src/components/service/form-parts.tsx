'use client';

import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import type { ServiceFormState } from '@/lib/service/validation';

/**
 * The parts every service form shares.
 *
 * Kept in one place because the five forms differ only in their fields: the
 * honeypot, the error summary, the busy state and the success panel must behave
 * identically in all of them, and five copies would be five chances for one to
 * drift — most dangerously the honeypot, which is a mitigation rather than a
 * decoration.
 */

/**
 * The honeypot field.
 *
 * Hidden from sight and from assistive technology, and removed from the tab
 * order, so only an automated submission fills it. `aria-hidden` rather than
 * `display:none` alone, so a screen reader does not announce a field a person is
 * not meant to complete.
 */
export function Honeypot({ id }: { id: string }) {
  return (
    <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden">
      <label htmlFor={id}>Company (leave blank)</label>
      <input id={id} name="company" type="text" tabIndex={-1} autoComplete="off" />
    </div>
  );
}

/**
 * The submit button, driven by the form's own submission status.
 *
 * `useFormStatus` rather than local state, so the button cannot get stuck
 * reporting "Sending" after the action has finished.
 */
export function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" loading={pending} className="w-full sm:w-auto">
      {pending ? (pendingLabel ?? 'Sending…') : label}
    </Button>
  );
}

/** A plain textarea with the same labelling and error wiring as `Input`. */
export function TextareaField({
  id,
  name,
  label,
  error,
  hint,
  rows = 5,
  required,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  error?: string | null;
  hint?: string | null;
  rows?: number;
  required?: boolean;
  placeholder?: string;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        required={required}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="border-field-border bg-field text-foreground focus-visible:border-gold-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-700 rounded-sm border px-3 py-2 text-sm"
      />
      {hint && !error ? (
        <p id={hintId} className="text-ink-500 text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-danger-600 text-xs font-medium">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A checkbox with a real label, so the target is the whole row. */
export function CheckboxField({
  id,
  name,
  label,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        value="true"
        className="accent-gold-700 mt-0.5 h-4 w-4"
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint ? <p className="text-ink-500 text-xs">{hint}</p> : null}
      </div>
    </div>
  );
}

/**
 * The error summary shown when an action returns an error.
 *
 * `role="alert"` so a screen reader announces it when it appears, which matters
 * because a server action's result arrives without a page navigation.
 */
export function FormError({ state }: { state: ServiceFormState }) {
  if (state.status !== 'error') return null;

  return (
    <p
      role="alert"
      className="border-danger-600/30 bg-danger-600/5 mb-4 rounded-sm border p-3 text-sm"
    >
      {state.message}
    </p>
  );
}

/**
 * The confirmation panel, which replaces the form on success.
 *
 * Leaving the fields filled in after a successful send invites a duplicate
 * submission, and the reference is the one thing the visitor needs to keep.
 */
export function FormSuccess({
  state,
  heading,
  body,
  footnote,
}: {
  state: ServiceFormState;
  heading: string;
  body: ReactNode;
  footnote?: ReactNode;
}) {
  if (state.status !== 'success') return null;

  return (
    <div role="status" className="border-success-600/30 bg-success-600/5 rounded-sm border p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden="true" className="text-success-600 mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h3 className="text-base font-semibold">{heading}</h3>
          <div className="text-foreground-muted mt-1 text-sm">{body}</div>
          <p className="text-foreground-muted mt-3 text-sm">
            Your reference is{' '}
            <strong className="text-foreground font-semibold">{state.reference}</strong>. Quote it
            if you contact us about this.
          </p>
          {footnote ? <div className="text-foreground-muted mt-3 text-sm">{footnote}</div> : null}
        </div>
      </div>
    </div>
  );
}

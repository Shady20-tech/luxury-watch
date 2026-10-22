'use client';

import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AuthFormState } from '@/lib/auth/validation';

/**
 * Shared pieces for the authentication forms.
 *
 * Each form is a real `<form>` bound to a Server Action through `useActionState`,
 * following the enquiry form. The browser posts it, so the form works with
 * JavaScript disabled, and there is no JSON payload a script can tamper with.
 *
 * -----------------------------------------------------------------------------
 * WHAT THE CLIENT VALIDATION IS AND IS NOT
 * -----------------------------------------------------------------------------
 *
 * The `type`, `autoComplete`, `minLength` and `required` attributes below make
 * the form pleasant to use and help a password manager fill it correctly. They
 * are **not** a security control: a request can omit or forge every one of them.
 * The server re-validates the same rules with Zod and the database re-checks what
 * it can. Nothing here is relied upon.
 *
 * `autoComplete` is set carefully rather than left to the browser's guess. The
 * `new-password` value is what tells a password manager to offer to generate and
 * save a password; without it, managers frequently offer to autofill the
 * *existing* password into a registration field.
 */

/** A form-level message, announced to assistive technology. */
export function FormAlert({ state }: { state: AuthFormState }) {
  if (state.status === 'idle' || !state.message) return null;

  const isSuccess = state.status === 'success';
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;

  return (
    <div
      // `role="alert"` announces the message when it appears. `polite` on
      // success: a confirmation is not urgent, and interrupting mid-sentence for
      // "check your inbox" is worse than waiting a beat.
      role={isSuccess ? 'status' : 'alert'}
      aria-live={isSuccess ? 'polite' : 'assertive'}
      className={cn(
        'flex items-start gap-3 rounded-sm border p-4 text-sm',
        isSuccess
          ? 'border-success-600/30 bg-success-600/5 text-foreground'
          : 'border-danger-600/30 bg-danger-600/5 text-foreground',
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          isSuccess ? 'text-success-600' : 'text-danger-600',
        )}
      />
      <p>{state.message}</p>
    </div>
  );
}

/**
 * The submit button, driven by the form's own status.
 *
 * `useFormStatus` reports the nearest enclosing form's pending state, so the
 * button cannot get stuck saying "Signing in…" after the action has finished —
 * the failure mode of tracking this in local state.
 */
export function SubmitButton({
  label,
  pendingLabel,
  className,
  block = true,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
  /** Full width by default, which suits the auth forms. */
  block?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" loading={pending} block={block} className={className}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

/** A labelled text field wired to the state returned by the action. */
export function AuthField({
  state,
  name,
  label,
  type = 'text',
  autoComplete,
  hint,
  required = true,
  defaultValue,
  minLength,
  maxLength,
}: {
  state: AuthFormState;
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
  minLength?: number;
  maxLength?: number;
}) {
  return (
    <Input
      id={name}
      name={name}
      label={label}
      type={type}
      autoComplete={autoComplete}
      hint={hint}
      required={required}
      defaultValue={defaultValue}
      minLength={minLength}
      maxLength={maxLength}
      error={state.fieldErrors?.[name] ?? null}
    />
  );
}

/** The bordered panel every auth page is built on. */
export function AuthPanel({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="border-line-300 bg-surface-0 rounded-sm border p-6 sm:p-8">
      <h1 className="text-2xl">{title}</h1>
      {description ? <p className="text-foreground-muted mt-3 text-sm">{description}</p> : null}
      <div className="mt-6">{children}</div>
      {footer ? <div className="border-line-300 mt-6 border-t pt-6 text-sm">{footer}</div> : null}
    </div>
  );
}

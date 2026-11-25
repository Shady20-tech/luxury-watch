'use client';

import { createContext, useContext, useActionState } from 'react';

import type { AdminFormState } from '@/lib/admin/validation';
import { IDLE_ADMIN_STATE } from '@/lib/admin/validation';

/**
 * The shared form kit for the content editors.
 *
 * Nine editors, one visual language. A field rendered by `TextField` in the page
 * editor looks and behaves the same as one in the FAQ editor, and a change to the
 * error presentation or the input styling happens once. The alternative — each
 * editor with its own `inputClass` — is how a settings screen ends up with three
 * subtly different text inputs.
 *
 * The components are Client Components because they are rendered inside a form
 * driven by `useActionState`. They hold no state of their own beyond what React
 * needs for the pending flag, and they render no data the server has not already
 * authorised.
 */

export const inputClass =
  'border-line-300 focus-visible:outline-gold-700 w-full rounded-sm border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-1';

export const labelClass = 'text-ink-700 mb-1 block text-xs font-medium';

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-danger-600 mt-1 text-xs" role="alert">
      {message}
    </p>
  );
}

const FieldErrorContext = createContext<Record<string, string>>({});

/** The first error for a field, from the enclosing form's action state. */
function useFieldError(name: string): string | undefined {
  return useContext(FieldErrorContext)[name];
}

export function Field({
  name,
  label,
  hint,
  error,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  /** Overrides the form's error for this field, for a locally-checked value. */
  error?: string;
  children: React.ReactNode;
}) {
  const formError = useFieldError(name);
  const message = error ?? formError;

  return (
    <div>
      <label className={labelClass} htmlFor={name}>
        {label}
      </label>
      {children}
      {hint ? <p className="text-ink-500 mt-1 text-xs">{hint}</p> : null}
      <FieldError message={message} />
    </div>
  );
}

export function TextField({
  name,
  label,
  defaultValue,
  hint,
  error,
  required,
  maxLength,
  type = 'text',
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string | number | null;
  hint?: string;
  error?: string;
  required?: boolean;
  maxLength?: number;
  type?: 'text' | 'email' | 'url' | 'datetime-local' | 'number' | 'date';
  placeholder?: string;
}) {
  // Always call the hook, then choose: `error ?? useFieldError(name)` would call
  // a hook conditionally, which React forbids and the linter rejects.
  const formError = useFieldError(name);
  const message = error ?? formError;
  return (
    <Field name={name} label={label} hint={hint} error={message}>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={message ? true : undefined}
        className={inputClass}
      />
    </Field>
  );
}

export function TextAreaField({
  name,
  label,
  defaultValue,
  hint,
  error,
  rows = 4,
  required,
  maxLength,
  mono,
}: {
  name: string;
  label: string;
  defaultValue?: string | null;
  hint?: string;
  error?: string;
  rows?: number;
  required?: boolean;
  maxLength?: number;
  mono?: boolean;
}) {
  // Always call the hook, then choose: `error ?? useFieldError(name)` would call
  // a hook conditionally, which React forbids and the linter rejects.
  const formError = useFieldError(name);
  const message = error ?? formError;
  return (
    <Field name={name} label={label} hint={hint} error={message}>
      <textarea
        id={name}
        name={name}
        rows={rows}
        defaultValue={defaultValue ?? ''}
        required={required}
        maxLength={maxLength}
        aria-invalid={message ? true : undefined}
        className={`${inputClass} ${mono ? 'font-mono text-xs' : ''}`}
      />
    </Field>
  );
}

export function SelectField({
  name,
  label,
  options,
  defaultValue,
  hint,
  error,
  required,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  // Always call the hook, then choose: `error ?? useFieldError(name)` would call
  // a hook conditionally, which React forbids and the linter rejects.
  const formError = useFieldError(name);
  const message = error ?? formError;
  return (
    <Field name={name} label={label} hint={hint} error={message}>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue ?? ''}
        required={required}
        aria-invalid={message ? true : undefined}
        className={inputClass}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckboxField({
  name,
  label,
  defaultChecked,
  hint,
  error,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  hint?: string;
  error?: string;
}) {
  // Always call the hook, then choose: `error ?? useFieldError(name)` would call
  // a hook conditionally, which React forbids and the linter rejects.
  const formError = useFieldError(name);
  const message = error ?? formError;
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          id={name}
          name={name}
          type="checkbox"
          defaultChecked={defaultChecked}
          aria-invalid={message ? true : undefined}
          className="border-line-300 text-gold-700 focus-visible:outline-gold-700 h-4 w-4 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <label className="text-ink-700 text-sm" htmlFor={name}>
          {label}
        </label>
      </div>
      {hint ? <p className="text-ink-500 mt-1 text-xs">{hint}</p> : null}
      <FieldError message={message} />
    </div>
  );
}

/** The form's submit and status line, shared so every editor reports the same way. */
export function FormStatus({
  state,
  pending,
  submitLabel,
}: {
  state: AdminFormState;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="bg-ink-900 hover:bg-ink-800 rounded-sm px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Saving…' : submitLabel}
      </button>
      {state.status === 'error' && state.message ? (
        <p className="text-danger-600 text-sm" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === 'success' && state.message ? (
        <p className="text-ink-600 text-sm" role="status">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A form whose action is a server action, with the standard submit row.
 *
 * The `action` prop is passed from the server page so the client bundle never
 * imports the action module directly — that keeps the 'use server' boundary
 * explicit and lets a page choose which action a form calls.
 */
export function AdminForm({
  action,
  children,
  submitLabel,
  hidden,
}: {
  action: (state: AdminFormState, formData: FormData) => Promise<AdminFormState>;
  children: React.ReactNode;
  submitLabel: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_ADMIN_STATE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      {hidden
        ? Object.entries(hidden).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))
        : null}
      {/* The action state is created once per form, and each field reads its own
          message from it by name rather than taking one as a prop. */}
      <FieldErrorContext.Provider value={errors}>{children}</FieldErrorContext.Provider>
      <FormStatus state={state} pending={pending} submitLabel={submitLabel} />
    </form>
  );
}

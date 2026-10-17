import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Text input.
 *
 * A bare input is a labelling hazard, so this primitive renders the label and
 * the error message itself and wires `htmlFor`, `aria-describedby` and
 * `aria-invalid`. The `id` is required, which forces the caller to think about
 * it instead of shipping an unlabelled field.
 */
export type InputProps = Omit<ComponentProps<'input'>, 'id'> & {
  id: string;
  label: string;
  /** Message shown when validation fails. Presence implies `aria-invalid`. */
  error?: string | null;
  /** Guidance shown before an error occurs. */
  hint?: string | null;
  /** Hide the label visually but keep it for assistive technology. */
  hideLabel?: boolean;
};

export function Input({ id, label, error, hint, hideLabel, className, ...props }: InputProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={cn('text-sm font-medium', hideLabel && 'sr-only-focusable sr-only')}
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          'border-line-300 bg-surface-0 text-foreground h-11 rounded-sm border px-3 text-sm',
          'placeholder:text-ink-500',
          'focus-visible:border-gold-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold-700',
          'disabled:bg-surface-100 disabled:text-ink-500',
          error && 'border-danger-600',
          className,
        )}
        {...props}
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

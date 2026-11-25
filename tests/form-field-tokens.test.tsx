// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { inputClass } from '@/components/admin/form-kit';
import { Input } from '@/components/ui/input';

/**
 * The two field primitives carry the whole application's form styling: every
 * admin editor uses `inputClass` from `form-kit`, and the storefront forms use
 * `Input`. A field outlined with a decorative hairline is below the 3:1 that
 * WCAG 1.4.11 requires of a control boundary, and it is the reason the forms
 * looked washed out on a bright screen.
 *
 * These render the real components rather than scanning source, because a
 * source scan cannot see the difference between a class applied to an `input`
 * and the same class applied to a panel — and an earlier attempt at exactly that
 * scan passed vacuously against the very regression it was meant to catch.
 */

afterEach(cleanup);

describe('the storefront Input renders as a filled control', () => {
  it('uses the field fill and the accessible field border, not a hairline', () => {
    render(<Input id="email" label="Email" />);
    const field = screen.getByLabelText('Email');

    expect(field.className).toContain('bg-field');
    expect(field.className).toContain('border-field-border');
    expect(field.className).not.toContain('border-line-300');
    expect(field.className).not.toContain('bg-surface-0');
  });

  it('keeps the error border when validation fails', () => {
    render(<Input id="email" label="Email" error="Enter a valid email address." />);
    const field = screen.getByLabelText('Email');

    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.className).toContain('border-danger-600');
  });
});

describe('the admin field class is a filled control', () => {
  it('names the field fill and border rather than the hairline pair', () => {
    expect(inputClass).toContain('bg-field');
    expect(inputClass).toContain('border-field-border');
    expect(inputClass).not.toContain('border-line-300');
  });
});

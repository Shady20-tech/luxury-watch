import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REDIRECT_PATH,
  safeRedirectPath,
  safeRedirectPathFromForm,
} from '@/lib/auth/redirect';

/**
 * Open-redirect guard.
 *
 * An unchecked redirect target is a vulnerability, not a cosmetic bug: the link
 * a victim receives points at the real site, and the hand-off to the attacker's
 * page happens after they have signed in and are therefore trusting what they
 * see. These tests exist so a future refactor cannot quietly loosen the rule.
 *
 * The two properties that matter:
 *
 *  1. Every off-site form is rejected. A regression here is a security defect.
 *  2. The function never returns null or undefined. A caller must not be able to
 *     treat "rejected" as "no redirect", which would leave a visitor stranded on
 *     the callback page.
 */

describe('safeRedirectPath', () => {
  it('accepts a same-site absolute path', () => {
    expect(safeRedirectPath('/account')).toBe('/account');
    expect(safeRedirectPath('/account/orders')).toBe('/account/orders');
    expect(safeRedirectPath('/products/a-watch?ref=email#details')).toBe(
      '/products/a-watch?ref=email#details',
    );
  });

  it('rejects an absolute URL to another origin', () => {
    // The `next` parameter on a sign-in link, which is the usual delivery.
    expect(safeRedirectPath('https://evil.test/verify')).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath('http://evil.test')).toBe(DEFAULT_REDIRECT_PATH);
    // A domain that merely starts with the real one's name.
    expect(safeRedirectPath('https://our-shop.test.evil.test')).toBe(DEFAULT_REDIRECT_PATH);
  });

  it('rejects a protocol-relative URL', () => {
    // `//evil.test` has no scheme, so the browser applies the current one and it
    // navigates off-site. A check for a single leading slash accepts this, which
    // is the classic way this guard is written wrongly.
    expect(safeRedirectPath('//evil.test')).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath('//evil.test/verify')).toBe(DEFAULT_REDIRECT_PATH);
  });

  it('rejects backslash variants that browsers normalise to a slash', () => {
    expect(safeRedirectPath('/\\evil.test')).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath('\\/evil.test')).toBe(DEFAULT_REDIRECT_PATH);
  });

  it('rejects a non-http scheme', () => {
    // These are not redirects at all, but they must not be returned as a path
    // either — `redirect()` would pass them to the browser unchanged.
    expect(safeRedirectPath('javascript:alert(1)')).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath('data:text/html,<script>alert(1)</script>')).toBe(
      DEFAULT_REDIRECT_PATH,
    );
  });

  it('rejects a path that navigates out of the site', () => {
    expect(safeRedirectPath('/../../etc/passwd')).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath('/..')).toBe(DEFAULT_REDIRECT_PATH);
  });

  it('rejects control characters, which could smuggle a header newline', () => {
    expect(safeRedirectPath('/account\nSet-Cookie: a=b')).toBe(DEFAULT_REDIRECT_PATH);
    expect(safeRedirectPath('/account\u0000')).toBe(DEFAULT_REDIRECT_PATH);
  });

  it('falls back rather than returning nothing, for every rejected input', () => {
    // Property 2 above. If this ever returned null, a caller using `??` or an
    // `if` would have a path where no redirect happens at all.
    const rejected = [
      null,
      undefined,
      '',
      'account',
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      '/..',
    ];

    for (const value of rejected) {
      expect(safeRedirectPath(value), `${String(value)} should fall back`).toBe(
        DEFAULT_REDIRECT_PATH,
      );
    }
  });

  it('treats a bare slash as the site root', () => {
    // Not a rejection: `/` is a legitimate same-site destination.
    expect(safeRedirectPath('/')).toBe('/');
  });
});

describe('safeRedirectPathFromForm', () => {
  it('reads a string entry', () => {
    const form = new FormData();
    form.set('next', '/account/orders');
    expect(safeRedirectPathFromForm(form.get('next'))).toBe('/account/orders');
  });

  it('falls back when the field is absent', () => {
    const form = new FormData();
    expect(safeRedirectPathFromForm(form.get('next'))).toBe(DEFAULT_REDIRECT_PATH);
  });

  it('falls back for a File, which a form field may be', () => {
    // `FormDataEntryValue` is `string | File`. Calling `.startsWith` on a File
    // would throw, so the narrowing is load-bearing.
    expect(safeRedirectPathFromForm(new File([''], 'x.txt'))).toBe(DEFAULT_REDIRECT_PATH);
  });

  it('applies the same rejection to a form value', () => {
    const form = new FormData();
    form.set('next', '//evil.test');
    expect(safeRedirectPathFromForm(form.get('next'))).toBe(DEFAULT_REDIRECT_PATH);
  });
});

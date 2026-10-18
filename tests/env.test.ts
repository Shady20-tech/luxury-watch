import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  absoluteUrl,
  collectPublicEnvIssues,
  getEnvReport,
  getPublicEnv,
  getSiteUrl,
  isSupabaseConfigured,
  resetPublicEnvCache,
} from '@/lib/env';

/**
 * These tests exist to prove the safety property the phase requires: missing
 * environment variables must degrade gracefully rather than crash the process.
 * Every assertion runs against a deliberately controlled `process.env`.
 */
const MANAGED_KEYS = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SITE_NAME',
  'NEXT_PUBLIC_DEFAULT_CURRENCY',
  'NEXT_PUBLIC_ENABLE_AGE_GATE',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of MANAGED_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetPublicEnvCache();
});

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetPublicEnvCache();
});

describe('getPublicEnv with nothing configured', () => {
  it('does not throw when every variable is missing', () => {
    expect(() => getPublicEnv()).not.toThrow();
  });

  it('falls back to a deterministic local URL rather than undefined', () => {
    const env = getPublicEnv();
    expect(env.siteUrl).toBe('http://localhost:3000');
    expect(env.siteName).toBe('Carbon Watch Company');
    expect(env.defaultCurrency).toBe('USD');
  });

  it('reports Supabase as unconfigured rather than pretending it is ready', () => {
    expect(isSupabaseConfigured()).toBe(false);
    expect(getPublicEnv().supabaseUrl).toBeUndefined();
    expect(getPublicEnv().supabaseAnonKey).toBeUndefined();
  });

  it('does not raise production issues when production is not required', () => {
    expect(collectPublicEnvIssues({}, { requireProduction: false })).toEqual([]);
  });
});

describe('collectPublicEnvIssues', () => {
  it('reports every missing required variable at once, not just the first', () => {
    const issues = collectPublicEnvIssues(
      {
        NEXT_PUBLIC_SITE_URL: undefined,
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      },
      { requireProduction: true },
    );

    expect(issues.map((issue) => issue.key).sort()).toEqual(
      ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SITE_URL'].sort(),
    );
    expect(issues.every((issue) => issue.kind === 'missing')).toBe(true);
  });

  it('rejects a site URL that is not an absolute http(s) URL', () => {
    const issues = collectPublicEnvIssues({ NEXT_PUBLIC_SITE_URL: 'example.com' });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe('malformed');
  });

  it('accepts a valid absolute https site URL', () => {
    expect(collectPublicEnvIssues({ NEXT_PUBLIC_SITE_URL: 'https://example.com' })).toEqual([]);
  });

  it('rejects a Supabase URL that is not a URL', () => {
    const issues = collectPublicEnvIssues({ NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.key).toBe('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('requires a three-letter uppercase ISO 4217 currency code', () => {
    expect(collectPublicEnvIssues({ NEXT_PUBLIC_DEFAULT_CURRENCY: 'usd' })).toHaveLength(1);
    expect(collectPublicEnvIssues({ NEXT_PUBLIC_DEFAULT_CURRENCY: 'US' })).toHaveLength(1);
    expect(collectPublicEnvIssues({ NEXT_PUBLIC_DEFAULT_CURRENCY: 'GBP' })).toEqual([]);
  });

  it('requires the age gate flag to be exactly true or false', () => {
    expect(collectPublicEnvIssues({ NEXT_PUBLIC_ENABLE_AGE_GATE: 'yes' })).toHaveLength(1);
    expect(collectPublicEnvIssues({ NEXT_PUBLIC_ENABLE_AGE_GATE: 'TRUE' })).toHaveLength(1);
    expect(collectPublicEnvIssues({ NEXT_PUBLIC_ENABLE_AGE_GATE: 'true' })).toEqual([]);
    expect(collectPublicEnvIssues({ NEXT_PUBLIC_ENABLE_AGE_GATE: 'false' })).toEqual([]);
  });
});

describe('value normalisation', () => {
  it('treats a whitespace-only value as absent', () => {
    process.env.NEXT_PUBLIC_SITE_URL = '   ';
    resetPublicEnvCache();
    expect(getPublicEnv().siteUrl).toBe('http://localhost:3000');
  });

  it('strips trailing slashes from the site URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com///';
    resetPublicEnvCache();
    expect(getSiteUrl()).toBe('https://example.com');
  });

  it('ignores an invalid site URL rather than emitting a broken canonical URL', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'javascript:alert(1)';
    resetPublicEnvCache();
    expect(getSiteUrl()).toBe('http://localhost:3000');
  });

  it('defaults the age gate to enabled when the flag is unset', () => {
    expect(getPublicEnv().enableAgeGate).toBe(true);
  });

  it('disables the age gate only when explicitly set to false', () => {
    process.env.NEXT_PUBLIC_ENABLE_AGE_GATE = 'false';
    resetPublicEnvCache();
    expect(getPublicEnv().enableAgeGate).toBe(false);
  });
});

describe('absoluteUrl', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
    resetPublicEnvCache();
  });

  it('joins a rooted path without duplicating the slash', () => {
    expect(absoluteUrl('/products/example')).toBe('https://example.com/products/example');
  });

  it('adds the slash when the path is not rooted', () => {
    expect(absoluteUrl('products/example')).toBe('https://example.com/products/example');
  });

  it('returns the bare origin for the root path', () => {
    expect(absoluteUrl('/')).toBe('https://example.com/');
  });
});

describe('getEnvReport', () => {
  it('exposes presence as booleans and never leaks a value', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'a'.repeat(40);
    resetPublicEnvCache();

    const report = getEnvReport();
    const serialised = JSON.stringify(report);

    expect(report.present.supabaseUrl).toBe(true);
    expect(report.present.supabaseAnonKey).toBe(true);
    // The actual key material must not appear anywhere in the report.
    expect(serialised).not.toContain('a'.repeat(40));
    expect(serialised).not.toContain('project.supabase.co');
  });
});

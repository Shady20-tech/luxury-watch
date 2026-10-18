/**
 * Public environment configuration.
 *
 * Design rules:
 *  1. Validation NEVER throws at module load, so a missing variable cannot
 *     break `next build` or crash the app at import time.
 *  2. Values are read lazily through `getPublicEnv()`, so the cost is paid
 *     once on first use.
 *  3. Missing or malformed values are reported through `getEnvReport()` and
 *     `collectPublicEnvIssues()`, which a runtime surface (the health
 *     endpoint) calls.
 *  4. Only variables prefixed `NEXT_PUBLIC_` belong here. Anything secret
 *     lives in `env.server.ts`, guarded by `server-only`.
 */

const PLACEHOLDER_SITE_URL = 'http://localhost:3000';

export const PUBLIC_ENV_KEYS = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SITE_NAME',
  'NEXT_PUBLIC_DEFAULT_CURRENCY',
  'NEXT_PUBLIC_ENABLE_AGE_GATE',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

export type PublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number];

export type PublicEnv = {
  siteUrl: string;
  siteName: string;
  defaultCurrency: string;
  enableAgeGate: boolean;
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
};

export type EnvIssue = {
  key: string;
  kind: 'missing' | 'malformed';
  detail: string;
};

/** Variables that must be present for the deployed site to work correctly. */
const REQUIRED_IN_PRODUCTION: PublicEnvKey[] = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
];

function raw(key: PublicEnvKey): string | undefined {
  const value = process.env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function isIso4217(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

/**
 * Collect every configuration problem instead of failing on the first one, so
 * a single report shows the operator everything that needs fixing.
 */
export function collectPublicEnvIssues(
  overrides: Partial<Record<PublicEnvKey, string | undefined>> = {},
  options: { requireProduction?: boolean } = {},
): EnvIssue[] {
  const issues: EnvIssue[] = [];
  const read = (key: PublicEnvKey): string | undefined => {
    const value = key in overrides ? overrides[key] : raw(key);
    if (value === undefined) return undefined;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  };

  for (const key of PUBLIC_ENV_KEYS) {
    const value = read(key);

    if (value === undefined) {
      if (options.requireProduction && REQUIRED_IN_PRODUCTION.includes(key)) {
        issues.push({ key, kind: 'missing', detail: 'Required in production but not set.' });
      }
      continue;
    }

    if (key === 'NEXT_PUBLIC_SITE_URL' && !isAbsoluteHttpUrl(value)) {
      issues.push({
        key,
        kind: 'malformed',
        detail: 'Must be an absolute http(s) URL, for example https://example.com',
      });
    }

    if (key === 'NEXT_PUBLIC_SUPABASE_URL' && !isAbsoluteHttpUrl(value)) {
      issues.push({
        key,
        kind: 'malformed',
        detail: 'Must be an absolute http(s) URL copied from the Supabase project settings.',
      });
    }

    if (key === 'NEXT_PUBLIC_DEFAULT_CURRENCY' && !isIso4217(value)) {
      issues.push({
        key,
        kind: 'malformed',
        detail: 'Must be a three-letter ISO 4217 code, for example USD.',
      });
    }

    if (key === 'NEXT_PUBLIC_ENABLE_AGE_GATE' && value !== 'true' && value !== 'false') {
      issues.push({ key, kind: 'malformed', detail: 'Must be exactly "true" or "false".' });
    }
  }

  return issues;
}

let cachedPublicEnv: PublicEnv | undefined;

/**
 * Read the public environment, applying safe defaults where a value is absent.
 * Never throws — callers needing a hard guarantee use `assertProductionEnv()`.
 */
export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) return cachedPublicEnv;

  const siteUrl = raw('NEXT_PUBLIC_SITE_URL');
  const currency = raw('NEXT_PUBLIC_DEFAULT_CURRENCY');
  const ageGate = raw('NEXT_PUBLIC_ENABLE_AGE_GATE');

  cachedPublicEnv = {
    // Falling back keeps rendering deterministic when the variable is absent.
    // Production correctness is enforced by the health check, not by throwing
    // at import time, which would break `next build`.
    siteUrl:
      siteUrl && isAbsoluteHttpUrl(siteUrl) ? siteUrl.replace(/\/+$/, '') : PLACEHOLDER_SITE_URL,
    siteName: raw('NEXT_PUBLIC_SITE_NAME') ?? 'Carbon Watch Company',
    defaultCurrency: currency && isIso4217(currency) ? currency : 'USD',
    enableAgeGate: ageGate === undefined ? true : ageGate === 'true',
    supabaseUrl: raw('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: raw('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  };

  return cachedPublicEnv;
}

/** Absolute site origin, without a trailing slash. */
export function getSiteUrl(): string {
  return getPublicEnv().siteUrl;
}

/** Build an absolute URL from a site-relative path. */
export function absoluteUrl(path = '/'): string {
  const base = getSiteUrl();
  if (!path.startsWith('/')) return `${base}/${path}`;
  return `${base}${path}`;
}

/** Whether a Supabase URL and anon key are both present and well formed. */
export function isSupabaseConfigured(): boolean {
  const env = getPublicEnv();
  return Boolean(env.supabaseUrl && env.supabaseAnonKey && isAbsoluteHttpUrl(env.supabaseUrl));
}

/** Non-fatal configuration report. Contains no secret values. */
export function getEnvReport(options: { requireProduction?: boolean } = {}) {
  const issues = collectPublicEnvIssues({}, options);
  const env = getPublicEnv();

  return {
    issues,
    valid: issues.length === 0,
    present: {
      siteUrl: Boolean(raw('NEXT_PUBLIC_SITE_URL')),
      siteName: Boolean(raw('NEXT_PUBLIC_SITE_NAME')),
      defaultCurrency: Boolean(raw('NEXT_PUBLIC_DEFAULT_CURRENCY')),
      enableAgeGate: Boolean(raw('NEXT_PUBLIC_ENABLE_AGE_GATE')),
      supabaseUrl: Boolean(env.supabaseUrl),
      supabaseAnonKey: Boolean(env.supabaseAnonKey),
    },
  };
}

/** Reset the memoised values. Tests only. */
export function resetPublicEnvCache(): void {
  cachedPublicEnv = undefined;
}

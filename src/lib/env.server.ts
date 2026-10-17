/**
 * Server-only environment configuration.
 *
 * `server-only` makes the build fail if this module is ever imported from a
 * Client Component, which is the mechanism that keeps the Supabase
 * service-role key and the Resend key out of the browser bundle.
 *
 * Like the public module, this never throws at import time: a missing secret
 * must not break `next build`. Callers that need a hard guarantee use the
 * `require*` helpers, which throw only when actually invoked at runtime.
 */
import 'server-only';

export const SERVER_ENV_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'RESEND_ADMIN_EMAIL',
  'REVALIDATION_SECRET',
  'SUPABASE_DB_URL',
  'RATE_LIMIT_DRIVER',
  'RATE_LIMIT_REDIS_URL',
  'RATE_LIMIT_REDIS_TOKEN',
] as const;

export type ServerEnvKey = (typeof SERVER_ENV_KEYS)[number];

export type ServerEnv = {
  supabaseServiceRoleKey: string | undefined;
  resendApiKey: string | undefined;
  resendFromEmail: string | undefined;
  resendAdminEmail: string | undefined;
  revalidationSecret: string | undefined;
  rateLimitDriver: 'postgres' | 'redis';
};

function raw(key: ServerEnvKey): string | undefined {
  const value = process.env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

let cached: ServerEnv | undefined;

/** Read server-only configuration. Never throws. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const driver = raw('RATE_LIMIT_DRIVER');

  cached = {
    supabaseServiceRoleKey: raw('SUPABASE_SERVICE_ROLE_KEY'),
    resendApiKey: raw('RESEND_API_KEY'),
    resendFromEmail: raw('RESEND_FROM_EMAIL'),
    resendAdminEmail: raw('RESEND_ADMIN_EMAIL'),
    revalidationSecret: raw('REVALIDATION_SECRET'),
    rateLimitDriver: driver === 'redis' ? 'redis' : 'postgres',
  };

  return cached;
}

/** Whether privileged Supabase access is available. */
export function hasServiceRoleKey(): boolean {
  return Boolean(getServerEnv().supabaseServiceRoleKey);
}

/** Whether transactional email can actually be sent. */
export function isEmailConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.resendApiKey && env.resendFromEmail);
}

/**
 * Throwing accessors. Use these inside a request that genuinely cannot work
 * without the value, so the failure is a clear 500 at the point of use rather
 * than a confusing `undefined` later on.
 */
export function requireServiceRoleKey(): string {
  const key = getServerEnv().supabaseServiceRoleKey;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it in the Vercel dashboard ' +
        '(Project → Settings → Environment Variables) and in your local .env.local. ' +
        'It is server-only and must never be exposed with a NEXT_PUBLIC_ prefix.',
    );
  }
  return key;
}

export function requireRevalidationSecret(): string {
  const secret = getServerEnv().revalidationSecret;
  if (!secret) {
    throw new Error(
      'REVALIDATION_SECRET is not set. Generate one with `openssl rand -hex 32` and add it ' +
        'to the Vercel dashboard and your local .env.local.',
    );
  }
  return secret;
}

/** Non-fatal server configuration report. Contains no secret values. */
export function getServerEnvReport() {
  const env = getServerEnv();
  return {
    present: {
      supabaseServiceRoleKey: Boolean(env.supabaseServiceRoleKey),
      resendApiKey: Boolean(env.resendApiKey),
      resendFromEmail: Boolean(env.resendFromEmail),
      resendAdminEmail: Boolean(env.resendAdminEmail),
      revalidationSecret: Boolean(env.revalidationSecret),
    },
    emailConfigured: isEmailConfigured(),
    serviceRoleConfigured: hasServiceRoleKey(),
  };
}

/** Reset the memoised values. Tests only. */
export function resetServerEnvCache(): void {
  cached = undefined;
}

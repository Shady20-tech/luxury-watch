/**
 * Structured logging.
 *
 * Emits a single JSON object per line so Vercel's log viewer and any downstream
 * drain can parse it. Secrets must never reach a log: `redact()` is applied to
 * every payload and strips keys that look like credentials.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Key fragments that indicate a value must never be written to a log. Matching
 * is case-insensitive and substring-based, so `supabaseServiceRoleKey` and
 * `RESEND_API_KEY` are both caught.
 */
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'service_role',
  'service-role',
  'servicerole',
  'authorization',
  'cookie',
  'privatekey',
  'private_key',
  'creditcard',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'iban',
];

const REDACTED = '[redacted]';

function isSensitiveKey(key: string): boolean {
  const normalised = key.toLowerCase().replace(/[\s-]/g, '_');
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalised.includes(fragment));
}

/**
 * Recursively replace sensitive values. Depth-limited so a cyclic or very deep
 * object cannot stall a request.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, depth + 1));
  }

  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      output[key] = isSensitiveKey(key) ? REDACTED : redact(nested, depth + 1);
    }
    return output;
  }

  return value;
}

function currentLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (configured && configured in LEVEL_RANK) return configured as LogLevel;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[currentLevel()]) return;

  const record = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? { context: redact(context) as LogContext } : {}),
  };

  const line = JSON.stringify(record);

  // Errors and warnings go to stderr so they are separable from normal output.
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
};

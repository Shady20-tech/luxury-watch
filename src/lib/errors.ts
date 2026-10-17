import { logger } from '@/lib/logger';

/**
 * Application error model and the shared server-side error handler.
 *
 * The contract: a client never sees an internal message, a stack trace, a
 * database error or a secret. `toUserMessage` produces the safe text, and
 * `handleServerError` logs the detail on the server and returns only the safe
 * shape.
 */

export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'CONFIGURATION'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  CONFIGURATION: 500,
  INTERNAL: 500,
};

/**
 * Default, deliberately generic, client-facing messages. They explain what the
 * caller can do without disclosing internals.
 */
const SAFE_MESSAGE_BY_CODE: Record<AppErrorCode, string> = {
  BAD_REQUEST: 'The request could not be processed. Check the submitted details and try again.',
  UNAUTHENTICATED: 'You need to sign in to continue.',
  FORBIDDEN: 'You do not have permission to do that.',
  NOT_FOUND: 'We could not find what you were looking for.',
  CONFLICT: 'That action conflicts with the current state. Reload and try again.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  CONFIGURATION: 'This feature is not available yet because the site is not fully configured.',
  INTERNAL: 'Something went wrong on our side. Please try again.',
};

export type AppErrorOptions = {
  /** Internal detail. Logged, never returned to the client. */
  cause?: unknown;
  /** A safe, more specific message. Only pass text with no internal detail. */
  publicMessage?: string;
  /** Extra non-sensitive context for the log line. */
  context?: Record<string, unknown>;
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly publicMessage: string;
  readonly context: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.publicMessage = options.publicMessage ?? SAFE_MESSAGE_BY_CODE[code];
    this.context = options.context ?? {};
  }

  static badRequest(message: string, options?: AppErrorOptions) {
    return new AppError('BAD_REQUEST', message, options);
  }

  static unauthenticated(message = 'No authenticated user', options?: AppErrorOptions) {
    return new AppError('UNAUTHENTICATED', message, options);
  }

  static forbidden(message = 'Not permitted', options?: AppErrorOptions) {
    return new AppError('FORBIDDEN', message, options);
  }

  static notFound(message = 'Not found', options?: AppErrorOptions) {
    return new AppError('NOT_FOUND', message, options);
  }

  static conflict(message: string, options?: AppErrorOptions) {
    return new AppError('CONFLICT', message, options);
  }

  static rateLimited(message = 'Rate limit exceeded', options?: AppErrorOptions) {
    return new AppError('RATE_LIMITED', message, options);
  }

  static configuration(message: string, options?: AppErrorOptions) {
    return new AppError('CONFIGURATION', message, options);
  }

  static internal(message = 'Unexpected error', options?: AppErrorOptions) {
    return new AppError('INTERNAL', message, options);
  }
}

/** Type guard for anything thrown. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export type ErrorResponseBody = {
  error: {
    code: AppErrorCode;
    message: string;
  };
};

/**
 * Convert any thrown value into a safe response body plus the status to send.
 * The internal message is never included.
 */
export function toErrorResponse(error: unknown): { status: number; body: ErrorResponseBody } {
  if (isAppError(error)) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.publicMessage } },
    };
  }

  return {
    status: STATUS_BY_CODE.INTERNAL,
    body: { error: { code: 'INTERNAL', message: SAFE_MESSAGE_BY_CODE.INTERNAL } },
  };
}

/**
 * Log the real cause and return the safe response. This is the single place a
 * server error crosses the boundary to the client.
 */
export function handleServerError(
  error: unknown,
  context: Record<string, unknown> = {},
): { status: number; body: ErrorResponseBody } {
  const response = toErrorResponse(error);

  if (isAppError(error)) {
    const level = error.status >= 500 ? 'error' : 'warn';
    logger[level](error.message, {
      ...context,
      ...error.context,
      code: error.code,
      status: error.status,
      cause: error.cause,
    });
  } else {
    logger.error('Unhandled server error', {
      ...context,
      error: error instanceof Error ? error : String(error),
    });
  }

  return response;
}

/**
 * Wrap an async server operation so every rejection becomes a handled AppError
 * with a safe response. Keeps route handlers and Server Actions free of
 * repetitive try/catch.
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: Record<string, unknown> = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: ErrorResponseBody }> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    const { status, body } = handleServerError(error, context);
    return { ok: false, status, body };
  }
}

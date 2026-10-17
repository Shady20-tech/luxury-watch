import { describe, expect, it, vi } from 'vitest';

import { AppError, isAppError, toErrorResponse, withErrorHandling } from '@/lib/errors';

describe('AppError', () => {
  it('maps each code to the correct HTTP status', () => {
    expect(AppError.badRequest('x').status).toBe(400);
    expect(AppError.unauthenticated().status).toBe(401);
    expect(AppError.forbidden().status).toBe(403);
    expect(AppError.notFound().status).toBe(404);
    expect(AppError.conflict('x').status).toBe(409);
    expect(AppError.rateLimited().status).toBe(429);
    expect(AppError.configuration('x').status).toBe(500);
    expect(AppError.internal().status).toBe(500);
  });

  it('is detectable with the type guard', () => {
    expect(isAppError(AppError.notFound())).toBe(true);
    expect(isAppError(new Error('plain'))).toBe(false);
    expect(isAppError('a string')).toBe(false);
  });
});

describe('toErrorResponse', () => {
  it('never returns the internal message to the caller', () => {
    const error = AppError.internal('relation "products" does not exist');
    const { body } = toErrorResponse(error);

    expect(body.error.message).not.toContain('relation');
    expect(body.error.message).not.toContain('products');
    expect(body.error.code).toBe('INTERNAL');
  });

  it('never returns an internal cause', () => {
    const error = AppError.internal('wrapper', {
      cause: new Error('connection string postgres://user:pw@host/db'),
    });
    const serialised = JSON.stringify(toErrorResponse(error));
    expect(serialised).not.toContain('postgres://');
  });

  it('uses the safe, more specific message when one is supplied', () => {
    const error = AppError.badRequest('email failed zod refinement', {
      publicMessage: 'Enter a valid email address.',
    });
    expect(toErrorResponse(error).body.error.message).toBe('Enter a valid email address.');
  });

  it('converts an unknown thrown value into a generic 500', () => {
    const { status, body } = toErrorResponse('something odd was thrown');
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
  });

  it('does not leak a raw Error message for a non-AppError', () => {
    const { body } = toErrorResponse(new Error('ECONNREFUSED 10.0.0.5:5432'));
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
  });
});

describe('withErrorHandling', () => {
  it('returns the resolved value on success', async () => {
    const result = await withErrorHandling(async () => 42);
    expect(result).toEqual({ ok: true, data: 42 });
  });

  it('converts a thrown AppError into a safe failure result', async () => {
    const result = await withErrorHandling(async () => {
      throw AppError.notFound('product missing');
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('converts an unexpected throw into a generic failure without leaking detail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await withErrorHandling(async () => {
      throw new Error('internal detail that must not escape');
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
      expect(JSON.stringify(result.body)).not.toContain('internal detail');
    }

    errorSpy.mockRestore();
  });

  it('logs the real error server-side so it is diagnosable', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await withErrorHandling(async () => {
      throw new Error('diagnosable cause');
    });

    expect(errorSpy).toHaveBeenCalled();
    const logged = String(errorSpy.mock.calls[0]?.[0] ?? '');
    expect(logged).toContain('diagnosable cause');

    errorSpy.mockRestore();
  });
});

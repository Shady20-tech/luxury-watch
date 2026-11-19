import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as envModule from '@/lib/env';

/**
 * The suggestion endpoint's contract, tested at the boundary rather than through
 * the database.
 *
 * Two properties are worth pinning, and neither is visible in a rendered page:
 *
 *  1. **Nothing short or oversized reaches the query.** The endpoint is hit on
 *     every keystroke, so the length bound and the limit are the only thing
 *     standing between a stray request and an `ILIKE` over the whole catalogue.
 *  2. **A failure never breaks the search form.** The box sits inside a `GET`
 *     form that must keep working; a `500` from the typeahead would leave the
 *     visitor with a spinner and no way to search. Both a database error and an
 *     unconfigured Supabase answer `200` with an empty list.
 */

const fetchSuggestions = vi.fn();

vi.mock('@/server/repositories/catalogue-repository', () => ({
  fetchSuggestions: (...args: unknown[]) => fetchSuggestions(...args),
}));

const isSupabaseConfigured = vi.fn();

vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof envModule>();
  return {
    ...actual,
    isSupabaseConfigured: () => isSupabaseConfigured(),
  };
});

const { GET } = await import('@/app/api/catalogue/suggest/route');

function call(query: string) {
  return GET(new NextRequest(`http://localhost/api/catalogue/suggest${query}`));
}

beforeEach(() => {
  fetchSuggestions.mockReset();
  isSupabaseConfigured.mockReset().mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/catalogue/suggest', () => {
  it('rejects a query shorter than two characters without touching the database', async () => {
    const response = await call('?q=a');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ suggestions: [] });
    expect(fetchSuggestions).not.toHaveBeenCalled();
  });

  it('rejects a missing query', async () => {
    expect((await call('')).status).toBe(400);
    expect(fetchSuggestions).not.toHaveBeenCalled();
  });

  it('rejects a query longer than the documented bound', async () => {
    const response = await call(`?q=${'x'.repeat(81)}`);

    expect(response.status).toBe(400);
    expect(fetchSuggestions).not.toHaveBeenCalled();
  });

  it('trims before measuring, so padded input is judged on its content', async () => {
    await call(`?q=${encodeURIComponent('  rolex  ')}`);

    expect(fetchSuggestions).toHaveBeenCalledWith('rolex', 8);
  });

  it('clamps the limit to the documented range instead of passing it through', async () => {
    expect((await call('?q=rolex&limit=500')).status).toBe(400);
    expect((await call('?q=rolex&limit=0')).status).toBe(400);

    await call('?q=rolex&limit=5');
    expect(fetchSuggestions).toHaveBeenLastCalledWith('rolex', 5);
  });

  it('defaults the limit when it is absent or not a number', async () => {
    await call('?q=rolex');
    expect(fetchSuggestions).toHaveBeenLastCalledWith('rolex', 8);

    expect((await call('?q=rolex&limit=abc')).status).toBe(400);
  });

  it('returns the suggestions from the repository', async () => {
    const rows = [{ kind: 'brand', label: 'Rolex', detail: '4 watches', href: '/brands/rolex' }];
    fetchSuggestions.mockResolvedValue(rows);

    const response = await call('?q=rolex');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ suggestions: rows });
  });

  it('answers an empty list, not an error, when Supabase is unconfigured', async () => {
    isSupabaseConfigured.mockReturnValue(false);

    const response = await call('?q=rolex');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ suggestions: [] });
    expect(fetchSuggestions).not.toHaveBeenCalled();
  });

  it('answers an empty list, not a 500, when the query fails', async () => {
    fetchSuggestions.mockRejectedValue(new Error('connection refused'));

    const response = await call('?q=rolex');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ suggestions: [] });
  });
});

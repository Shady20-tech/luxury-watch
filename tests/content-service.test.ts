import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The CMS content service.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS TESTED DIRECTLY
 * -----------------------------------------------------------------------------
 *
 * The repository throws on a failed query and the pages used to inherit that
 * throw, so every route under `/pages/*` returned a 500 whenever the database
 * was unreachable. `next build` did not catch it — the routes are dynamic, so
 * they are never rendered at build time — and it only appeared under
 * `next start`, which is exactly the "production 500" trap this repository has
 * hit before. These tests pin the three-way answer that fixes it:
 *
 *   - `ok`          the row was read.
 *   - `missing`     the database answered and the row is not published.
 *   - `unavailable` the database did not answer, or is not configured.
 *
 * The distinction that matters most is `missing` versus `unavailable`. Collapsing
 * them would either 404 a page that exists or show a "not written yet" note
 * during an outage — in both cases telling the visitor something untrue about a
 * footer-linked page. `unavailable` must also never be logged at `error`: an
 * unconfigured database is the normal state of local development, not a fault.
 *
 * The repository is substituted because it is the network; the service's own
 * decision-making is the real code under test.
 */
vi.mock('server-only', () => ({}));

const env = { configured: true };
vi.mock('@/lib/env', () => ({
  isSupabaseConfigured: () => env.configured,
}));

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('@/lib/logger', () => ({ logger }));

const repository = {
  fetchPageBySlug: vi.fn(),
  fetchFaqs: vi.fn(),
  fetchPublishedPageSlugs: vi.fn(),
};
vi.mock('@/server/repositories/content-repository', () => repository);

const { getPageBySlug, getFaqs } = await import('@/server/services/content-service');

const page = {
  id: '00000000-0000-4000-8000-000000000001',
  slug: 'about',
  title: 'About Us',
  excerpt: null,
  heroImageUrl: null,
  blocks: [],
  seoTitle: null,
  seoDescription: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  env.configured = true;
  repository.fetchPageBySlug.mockResolvedValue(page);
  repository.fetchFaqs.mockResolvedValue([]);
});

describe('getPageBySlug', () => {
  it('returns the page when the database answers with a row', async () => {
    const result = await getPageBySlug('about');

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.page.slug).toBe('about');
  });

  it('reports a missing row as missing, not as a failure', async () => {
    repository.fetchPageBySlug.mockResolvedValue(null);

    const result = await getPageBySlug('never-written');

    expect(result.status).toBe('missing');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('degrades to unavailable when the query throws, instead of throwing', async () => {
    // The regression: this used to propagate, and the page 500ed.
    repository.fetchPageBySlug.mockRejectedValue(new Error('fetch failed'));

    const result = await getPageBySlug('about');

    expect(result.status).toBe('unavailable');
  });

  it('logs a failed query at warn with the message only, never the row', async () => {
    repository.fetchPageBySlug.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:3002'));

    await getPageBySlug('about');

    expect(logger.warn).toHaveBeenCalledWith(
      'content.page_load_failed',
      expect.objectContaining({ message: 'connect ECONNREFUSED 127.0.0.1:3002', slug: 'about' }),
    );
    // A Supabase error can carry the query and row data, so the error object
    // itself must not be handed to the logger.
    expect(logger.warn.mock.calls[0]?.[1]).not.toHaveProperty('error');
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('reports unavailable without querying when Supabase is not configured', async () => {
    env.configured = false;

    const result = await getPageBySlug('about');

    expect(result.status).toBe('unavailable');
    expect(repository.fetchPageBySlug).not.toHaveBeenCalled();
  });

  it('keeps missing and unavailable distinguishable', async () => {
    repository.fetchPageBySlug.mockResolvedValue(null);
    const missing = await getPageBySlug('a');

    repository.fetchPageBySlug.mockRejectedValue(new Error('down'));
    const unavailable = await getPageBySlug('b');

    expect(missing.status).not.toBe(unavailable.status);
  });
});

describe('getFaqs', () => {
  it('returns the questions when the database answers', async () => {
    repository.fetchFaqs.mockResolvedValue([
      { id: '1', question: 'Q?', answer: 'A.', category: 'Buying' },
    ]);

    const result = await getFaqs();

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.faqs).toHaveLength(1);
  });

  it('degrades to unavailable when the query throws', async () => {
    repository.fetchFaqs.mockRejectedValue(new Error('fetch failed'));

    const result = await getFaqs();

    expect(result.status).toBe('unavailable');
    expect(logger.warn).toHaveBeenCalledWith(
      'content.faq_load_failed',
      expect.objectContaining({ message: 'fetch failed' }),
    );
  });

  it('reports unavailable without querying when Supabase is not configured', async () => {
    env.configured = false;

    const result = await getFaqs();

    expect(result.status).toBe('unavailable');
    expect(repository.fetchFaqs).not.toHaveBeenCalled();
  });
});

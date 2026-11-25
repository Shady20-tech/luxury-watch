import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveImageUrl } from '@/lib/media';

/**
 * `resolveImageUrl` decides whether a stored reference becomes a URL at all, and
 * that decision is a security boundary, not a formatting helper.
 *
 * Two things must be true at once:
 *
 *   1. A root-relative path is accepted, because the openly-licensed seed
 *      photography lives in `public/seed-images` and is served from our own
 *      origin. Without this the seed images resolve to `null` and every card
 *      renders the placeholder.
 *   2. A third-party URL is still refused. Widening the resolver to accept
 *      same-origin paths must not become a hole through which an arbitrary host
 *      is hotlinked — that is both a licensing problem and a render-time throw,
 *      since `next.config.ts` allowlists only the Supabase host.
 *
 * The tests are written as the pairs of accept/refuse that could be confused
 * with each other (`/path` versus `//host`, our host versus another host),
 * because a single happy-path assertion proves neither half.
 */

const SUPABASE = 'https://project.supabase.co';

function withEnv(url: string | undefined) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url ?? '');
  return import('@/lib/media');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('resolveImageUrl — root-relative seed assets', () => {
  it('accepts a root-relative path even with no Supabase project configured', async () => {
    const { resolveImageUrl: resolve } = await withEnv(undefined);
    expect(resolve(null, '/seed-images/rolex-milgauss-gv-black-dial.webp')).toBe(
      '/seed-images/rolex-milgauss-gv-black-dial.webp',
    );
  });

  it('accepts a root-relative path and ignores an unset project URL', async () => {
    const { resolveImageUrl: resolve } = await withEnv(SUPABASE);
    expect(resolve(null, '/seed-images/x.webp')).toBe('/seed-images/x.webp');
  });

  it('refuses a protocol-relative path, which is a different origin', async () => {
    const { resolveImageUrl: resolve } = await withEnv(SUPABASE);
    // `//evil.example/x.jpg` starts with a slash but the browser reads it as
    // host `evil.example` over https. A naive `startsWith('/')` check accepts it.
    expect(resolve(null, '//evil.example/x.jpg')).toBeNull();
  });

  it('prefers storage_path over external_url when both are present', async () => {
    const { resolveImageUrl: resolve } = await withEnv(SUPABASE);
    expect(resolve('catalogue/a.webp', '/seed-images/b.webp')).toBe(
      `${SUPABASE}/storage/v1/object/public/media/catalogue/a.webp`,
    );
  });
});

describe('resolveImageUrl — third parties stay refused', () => {
  it('refuses an absolute URL on another host', async () => {
    const { resolveImageUrl: resolve } = await withEnv(SUPABASE);
    expect(resolve(null, 'https://cdn.thewatchpages.com/app/uploads/x.jpg')).toBeNull();
  });

  it('refuses a plain-text reference that is neither a path nor a URL', async () => {
    const { resolveImageUrl: resolve } = await withEnv(SUPABASE);
    expect(resolve(null, 'not a url')).toBeNull();
    expect(resolve(null, 'seed-images/x.webp')).toBeNull();
  });

  it('refuses a non-http scheme even on the project host', async () => {
    const { resolveImageUrl: resolve } = await withEnv(SUPABASE);
    expect(resolve(null, 'javascript:alert(1)')).toBeNull();
    expect(resolve(null, 'data:image/png;base64,AAAA')).toBeNull();
  });

  it('accepts an https URL on the project host', async () => {
    const { resolveImageUrl: resolve } = await withEnv(SUPABASE);
    const url = `${SUPABASE}/storage/v1/object/public/media/x.webp`;
    expect(resolve(null, url)).toBe(url);
  });

  it('returns null for an empty reference rather than an empty string', async () => {
    const { resolveImageUrl: resolve } = await withEnv(SUPABASE);
    expect(resolve(null, null)).toBeNull();
    expect(resolve(undefined, undefined)).toBeNull();
    expect(resolve('', '')).toBeNull();
  });

  it('does not resolve a storage path without a project URL', async () => {
    const { resolveImageUrl: resolve } = await withEnv(undefined);
    expect(resolve('catalogue/a.webp', null)).toBeNull();
  });
});

describe('resolveImageUrl — module identity', () => {
  it('is the same function the seed depends on', () => {
    // A guard against the file being re-exported under a second name, which is
    // how one of the two call sites eventually gets a different behaviour.
    expect(typeof resolveImageUrl).toBe('function');
  });
});

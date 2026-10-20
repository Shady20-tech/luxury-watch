import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import robots from '@/app/robots';
import { PRIVATE_DISALLOW_PATHS } from '@/lib/seo/private-routes';
import { resetPublicEnvCache } from '@/lib/env';

/**
 * `robots.txt` is a boundary, and a boundary with no test drifts silently.
 *
 * The list is a set of literal path strings, so a route rename does not fail
 * anywhere: the old string keeps disallowing a page that no longer exists while
 * the new one is left crawlable. That is exactly what happened when Phase 7's
 * second pass moved the order request from `/order-request` to `/checkout`.
 *
 * These tests pin the property that matters — every private surface that exists
 * on disk is disallowed — rather than the current spelling of the list, so a
 * future rename fails here instead of leaking a customer page into the index.
 */

const ROOT = join(__dirname, '..', 'src', 'app', '(site)');

/**
 * Route segments that must never be indexed, with the reason. The key is the
 * directory under `src/app/(site)`; the value is why it is private.
 */
const PRIVATE_ROUTES: Record<string, string> = {
  admin: 'staff-only administration',
  account: 'the signed-in customer area',
  cart: 'per-visitor basket',
  wishlist: 'per-visitor saved pieces',
  checkout: 'the order-request form',
  login: 'authentication',
  register: 'authentication',
  'forgot-password': 'authentication',
  'reset-password': 'authentication',
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com';
  resetPublicEnvCache();
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  resetPublicEnvCache();
});

function rules() {
  const { rules } = robots();
  return Array.isArray(rules) ? rules : [rules];
}

function disallowFor(userAgent: string): string[] {
  const rule = rules().find((entry) => entry.userAgent === userAgent);
  if (!rule) throw new Error(`no robots rule for ${userAgent}`);
  const { disallow } = rule;
  return Array.isArray(disallow) ? disallow : disallow ? [disallow] : [];
}

describe('robots.txt', () => {
  it('disallows every private route that actually exists on disk', () => {
    const disallow = disallowFor('*');

    for (const [segment, reason] of Object.entries(PRIVATE_ROUTES)) {
      // Only assert for routes that exist, so the test does not demand a rule
      // for a page that has not been built yet.
      if (!existsSync(join(ROOT, segment))) continue;
      expect(disallow, `${segment} (${reason}) must be disallowed`).toContain(`/${segment}`);
    }
  });

  it('disallows the order-confirmation path, which carries a guest access token', () => {
    expect(disallowFor('*')).toContain('/order/');
  });

  it('does not disallow a path that no longer exists', () => {
    // The renamed route. Left behind, it disallows nothing while looking
    // reassuring; the real route must be the one named.
    expect(disallowFor('*')).not.toContain('/order-request');
  });

  it('keeps the catalogue crawlable rather than disallowing everything', () => {
    const wildcard = rules().find((entry) => entry.userAgent === '*');
    expect(wildcard?.allow).toBe('/');
  });

  it('stops the query-string crawl traps', () => {
    const disallow = disallowFor('*');
    expect(disallow).toEqual(expect.arrayContaining(['/*?*sort=', '/*?*filter=', '/*?*page=']));
  });

  it('repeats the private paths for AdsBot, which ignores the wildcard rule', () => {
    const adsBot = disallowFor('AdsBot-Google');
    for (const path of ['/admin', '/account', '/cart', '/wishlist', '/checkout', '/order/']) {
      expect(adsBot, `AdsBot must be told about ${path}`).toContain(path);
    }
    expect(adsBot).not.toContain('/order-request');
  });

  it('agrees with the noindex/no-store header rule in next.config', () => {
    // Two lists say the same thing — keep these private surfaces out of an
    // index. If they disagree, one of them is wrong and neither fails on its
    // own, so the agreement is asserted here.
    const disallow = disallowFor('*');
    // Derived from the same shared list `next.config.ts` builds its header rule
    // from, so a route added to one is missing from the other and fails here.
    for (const path of PRIVATE_DISALLOW_PATHS) {
      expect(disallow, `robots.txt must disallow ${path}`).toContain(path);
    }
  });

  it('points crawlers at the sitemap and the canonical host', () => {
    const result = robots();
    expect(result.sitemap).toBe('https://example.com/sitemap.xml');
    expect(result.host).toBe('https://example.com');
  });
});

/**
 * The surfaces that must never be indexed or cached by a shared cache.
 *
 * One list, read by both places that need it: `src/app/robots.ts` turns each
 * entry into a `Disallow` rule, and `next.config.ts` turns the same entries into
 * an `X-Robots-Tag: noindex, nofollow` / `Cache-Control: no-store` header rule.
 * They were two hand-maintained literal lists, and they drifted: Phase 7's
 * second pass renamed `/order-request` to `/checkout` and the stale string sat
 * in both, naming a route that no longer existed. The pages carry their own
 * `noindex` metadata, so nothing was exposed, but the header rule silently
 * stopped covering the new routes.
 *
 * `tests/robots.test.ts` asserts that every entry here is disallowed and that
 * every private route that exists on disk has an entry, so the next rename fails
 * a test instead of leaving the boundary quietly out of date.
 *
 * The values are route segments, not paths, because `next.config.ts` needs them
 * for a path pattern while `robots.ts` needs them with a leading slash.
 */
export const PRIVATE_ROUTE_SEGMENTS = [
  'account',
  'admin',
  'cart',
  'wishlist',
  'checkout',
  'order',
  'api',
] as const;

export type PrivateRouteSegment = (typeof PRIVATE_ROUTE_SEGMENTS)[number];

/**
 * `robots.txt` disallow patterns. `/order` and `/api` end in a slash so the
 * rule covers their child routes (`/order/LW-26-100001`, `/api/health`) without
 * matching a hypothetical sibling that merely shares the prefix.
 */
export const PRIVATE_DISALLOW_PATHS: readonly string[] = PRIVATE_ROUTE_SEGMENTS.map((segment) =>
  segment === 'order' || segment === 'api' ? `/${segment}/` : `/${segment}`,
);

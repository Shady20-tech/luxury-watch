import type { NextConfig } from 'next';

/**
 * Security headers applied to every response.
 *
 * Content-Security-Policy is deliberately NOT in this list. See
 * `docs/SECURITY_HEADERS.md` for the reason and for how to switch it on:
 * shipping a restrictive CSP before auditing real sources breaks the app, so
 * the policy is prepared, tunable and documented instead of guessed at.
 */
const securityHeaders = [
  // Stop browsers from MIME-sniffing a response away from the declared type.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Send the origin only on cross-origin requests; full URL same-origin.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Deny powerful features nothing in this app needs.
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), interest-cohort=()',
  },
  // Clickjacking protection for browsers predating CSP frame-ancestors.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Isolate the browsing context and block cross-origin window references.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  // Force HTTPS for two years once the site is known-good over TLS.
  // `preload` is intentionally omitted until the owner confirms every
  // subdomain is HTTPS-only, because preload is hard to reverse.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Fail the production build on type errors rather than shipping broken types.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  images: {
    // Supabase Storage is the only remote image source. The concrete host is
    // added here once the Supabase project URL is known; until then no remote
    // pattern is allowed, which keeps the surface closed by default.
    remotePatterns: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? [
          {
            protocol: 'https',
            hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
            pathname: '/storage/v1/object/public/**',
          },
        ]
      : [],
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [
      {
        // Apply to every route, including API handlers and static assets.
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Private and transactional surfaces must never be indexed or cached
        // by shared caches.
        source: '/:path(account|admin|cart|order-request|api)/:rest*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
        ],
      },
    ];
  },
};

export default nextConfig;

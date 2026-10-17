# Security headers

All headers are defined in `next.config.ts` and applied to every response.

## Active headers

| Header                         | Value                                                                                                 | Purpose                                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `X-Content-Type-Options`       | `nosniff`                                                                                             | Stops MIME-sniffing a response into a different type.                                                     |
| `Referrer-Policy`              | `strict-origin-when-cross-origin`                                                                     | Sends the full URL same-origin, the origin only cross-origin.                                             |
| `Permissions-Policy`           | camera, microphone, geolocation, payment, usb, magnetometer, gyroscope and interest-cohort all denied | The app needs none of these. Denying `payment` is deliberate and matches the no-payment-gateway decision. |
| `X-Frame-Options`              | `SAMEORIGIN`                                                                                          | Clickjacking protection for browsers that predate CSP `frame-ancestors`.                                  |
| `Cross-Origin-Opener-Policy`   | `same-origin`                                                                                         | Isolates the browsing context from cross-origin window references.                                        |
| `Cross-Origin-Resource-Policy` | `same-origin`                                                                                         | Prevents other origins embedding our resources.                                                           |
| `Strict-Transport-Security`    | `max-age=63072000; includeSubDomains`                                                                 | Forces HTTPS for two years.                                                                               |

`X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store` are added to
`/account`, `/admin`, `/cart`, `/order-request` and `/api/*`.

## Why `preload` is omitted from HSTS

`preload` is a one-way commitment: browsers ship a hardcoded list and removal
takes months. It is added only once the owner confirms every subdomain is
HTTPS-only.

## Why there is no Content-Security-Policy yet

Shipping a restrictive CSP before auditing the real resource graph breaks the
application, and a CSP that gets loosened under pressure until it allows
everything provides no protection while creating false confidence.

The policy is therefore prepared and tunable rather than guessed:

1. Phase 10 (design system) and Phase 5 (catalogue) settle the real asset
   origins: Supabase Storage for product images and `next/font` for fonts, which
   is self-hosted and needs no external origin.
2. The policy is then introduced in **report-only** mode
   (`Content-Security-Policy-Report-Only`) and observed in production.
3. Only once reports are clean is it switched to enforcing, with a nonce for
   Next.js inline scripts.

The intended starting policy, to be added in a later phase:

```
default-src 'self';
img-src 'self' https://<project-ref>.supabase.co data: blob:;
font-src 'self';
style-src 'self' 'unsafe-inline';
script-src 'self';
connect-src 'self' https://<project-ref>.supabase.co;
frame-ancestors 'self';
form-action 'self';
base-uri 'self';
object-src 'none';
```

`style-src` needs `'unsafe-inline'` only if a runtime style-injection path is
introduced; Tailwind v4 compiles to a static stylesheet, so this can likely be
tightened to `'self'` alone. That is confirmed during the audit rather than
assumed now.

This is recorded in `KNOWN_ISSUES.md` as an open item with an owner and a
phase, not left implicit.

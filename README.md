# Luxury Watch

A production-oriented luxury-watch storefront and administration platform.

**Reference for structure and information architecture:**
<https://carbonwatchcompany.com/> — layout, hierarchy, navigation and interaction
patterns only. No source code, proprietary assets or long passages of text are
copied. This project claims no manufacturer endorsement or authorised-dealer
status.

## Key project decisions

| Area         | Decision                                                                             |
| ------------ | ------------------------------------------------------------------------------------ |
| Framework    | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4                       |
| Rendering    | Server Components by default; Client Components only where interaction requires them |
| Data         | Supabase PostgreSQL, Supabase Auth, Supabase Storage, Row Level Security             |
| Validation   | Zod                                                                                  |
| Email        | Resend, transactional only                                                           |
| Hosting      | Vercel                                                                               |
| **Payments** | **None. No gateway, no online processing, no card handling.**                        |

### Payment is deliberately absent

A customer chooses one of the payment methods the administrator has enabled —
for example bank transfer, manual transfer or cash on pickup — chooses delivery
or pickup, supplies the required details, and submits an **order request**. An
administrator reviews and settles it offline.

There is no payment gateway, no payment SDK, no card field, no payment webhook
and no payment-provider abstraction anywhere in this codebase. `npm run
check:no-payment` enforces this in CI and fails the build if a payment
integration is ever introduced.

The application never shows a success message claiming a payment was made.

## Requirements

- Node.js **>= 20.9.0** (CI uses 22; development has been verified on 24)
- npm (the lockfile is committed; CI uses `npm ci`)

## Local setup

```bash
# 1. Install exact locked dependencies
npm ci

# 2. Create your local environment file
cp .env.example .env.local
#    then fill in the values — see the comments in that file

# 3. Start the development server
npm run dev
#    http://localhost:3000
```

The app runs without any environment variables set. Missing configuration
degrades gracefully and is reported at `/api/health` rather than crashing the
build. Set the variables to enable each integration.

## Scripts

| Script                     | Purpose                                         |
| -------------------------- | ----------------------------------------------- |
| `npm run dev`              | Development server                              |
| `npm run build`            | Production build (fails on type or lint errors) |
| `npm run start`            | Serve the production build                      |
| `npm run lint`             | ESLint, including accessibility rules           |
| `npm run lint:fix`         | ESLint with autofix                             |
| `npm run format`           | Prettier write                                  |
| `npm run format:check`     | Prettier check (used in CI)                     |
| `npm run typecheck`        | `tsc --noEmit`                                  |
| `npm test`                 | Vitest, single run                              |
| `npm run test:watch`       | Vitest in watch mode                            |
| `npm run test:coverage`    | Vitest with V8 coverage                         |
| `npm run check:no-payment` | Fails if a payment integration is present       |
| `npm run verify`           | Everything above, in the CI order               |

## Environment variables

Every variable is documented with setup notes in `.env.example`. Nothing in that
file is a secret.

Anything prefixed `NEXT_PUBLIC_` is embedded in the browser bundle and is
**public**. Secrets never use that prefix.

`SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` are server-only. The modules
that read them (`src/lib/env.server.ts`, `src/lib/supabase/admin.ts`) import
`server-only`, so the build fails if either is ever pulled into a client bundle.

## Deploying to Vercel

1. Import the GitHub repository as a Vercel project.
2. Add the environment variables under **Settings → Environment Variables**, per
   environment. Use the names from `.env.example`.
3. Deploy. Vercel builds with `npm run build`.

`NEXT_PUBLIC_SITE_URL` must be the real production origin, without a trailing
slash. It is used for canonical URLs, the sitemap, `robots.txt` and email links.

## Architecture

See:

- `ARCHITECTURE.md` — stack, data flow, security boundaries, order-request flow
- `REFERENCE_ANALYSIS.md` — the reference-site audit and improvement opportunities
- `IMPLEMENTATION_PLAN.md` — the phase-by-phase plan and project-wide invariants
- `KNOWN_ISSUES.md` — the honest register of what is unresolved
- `CHANGELOG.md` — what changed, per phase
- `docs/SEO.md` — the SEO approach and Google's official AI-search guidance
- `docs/SECURITY_HEADERS.md` — active headers and the CSP plan

## Project layout

```
src/
  app/                     Routes, layouts, error boundaries, robots, sitemap
  components/
    seo/                   JSON-LD renderer
  lib/
    env.ts                 Public environment (safe, never throws)
    env.server.ts          Server-only environment (guarded)
    errors.ts              AppError and the server error boundary
    logger.ts              Structured logging with secret redaction
    seo/                   Metadata, schema.org, sitemap builders
    supabase/              browser / server / admin clients
  middleware.ts            Supabase session refresh
tests/                     Vitest suites
scripts/                   CI guards
```

## Accessibility and SEO commitments

- Pinch-zoom is never blocked (`maximumScale: 5`), unlike the reference site.
- Focus is always visible; outlines are never removed.
- `prefers-reduced-motion` is respected.
- Colour contrast is verified by tests, not assumed.
- Sitemap `<lastmod>` values reflect real timestamps and are never faked.
- Structured data never claims a price that does not exist.

## Licence and content

Branding, imagery and copy must be supplied or licensed by the owner. Until
then, any seed content is clearly labelled as demo data and is never presented as
a real transaction.

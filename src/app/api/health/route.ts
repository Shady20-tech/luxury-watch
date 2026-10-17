import { NextResponse } from 'next/server';

import { getEnvReport } from '@/lib/env';
import { getServerEnvReport } from '@/lib/env.server';
import { handleServerError, withErrorHandling } from '@/lib/errors';

/**
 * Health and configuration endpoint.
 *
 * This is where missing environment variables are reported loudly, instead of
 * throwing at import time and breaking `next build`. It exposes only booleans —
 * whether a value is present and well formed — never the values themselves, so
 * it is safe to leave unauthenticated. It is excluded from the sitemap and
 * disallowed in `robots.txt`.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await withErrorHandling(async () => {
    const publicReport = getEnvReport();
    const serverReport = getServerEnvReport();

    const ready = publicReport.valid && serverReport.serviceRoleConfigured;

    return {
      status: ready ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
      configuration: {
        public: publicReport.present,
        server: serverReport.present,
        issues: publicReport.issues.map((issue) => ({
          key: issue.key,
          kind: issue.kind,
          detail: issue.detail,
        })),
        emailConfigured: serverReport.emailConfigured,
        serviceRoleConfigured: serverReport.serviceRoleConfigured,
      },
    };
  });

  if (!result.ok) {
    return NextResponse.json(result.body, { status: result.status });
  }

  // `degraded` is a warning state, not a failure: the app serves pages, but some
  // features are unavailable until configuration is completed.
  return NextResponse.json(result.data, {
    status: 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function POST() {
  const { status, body } = handleServerError(
    new Error('Method not allowed on the health endpoint'),
    {
      route: '/api/health',
      method: 'POST',
    },
  );
  return NextResponse.json(body, { status });
}

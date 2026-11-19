import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { fetchSuggestions } from '@/server/repositories/catalogue-repository';

/**
 * Typeahead suggestions for the catalogue search box.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS AN ENDPOINT RATHER THAN A SERVER ACTION
 * -----------------------------------------------------------------------------
 *
 * It answers a keystroke. A server action is a POST that revalidates and can
 * re-render a route; this needs neither, and a GET is cacheable, cancellable by
 * the browser when the visitor types another letter, and honest about what it
 * is: a read. The response is `no-store`, because a suggestion list is a
 * function of the query and there is no version of it worth serving stale.
 *
 * -----------------------------------------------------------------------------
 * VALIDATION AND DEGRADATION
 * -----------------------------------------------------------------------------
 *
 * The query is validated here, not trusted. `catalogue_suggest` escapes LIKE
 * metacharacters itself, but the length bound and the limit are enforced at this
 * boundary so an oversized request never reaches the database. An invalid
 * request is a `400` with an empty list, never a `500`.
 *
 * When Supabase is unconfigured (the documented A1 state) the endpoint returns
 * an empty list with `200`, not an error: the search box then simply offers no
 * suggestions, which is the honest behaviour and what the rest of the app does
 * in that state. A database error is logged and also answered with an empty
 * list — a typeahead that throws would break the form around it.
 */
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, 'A search needs at least two characters')
    // Longer than any real reference number or model name, and short enough
    // that the ILIKE fallback stays cheap.
    .max(80, 'A search term is limited to 80 characters'),
  limit: z.coerce.number().int().min(1).max(12).default(8),
});

export type SuggestResponse = {
  suggestions: { kind: string; label: string; detail: string | null; href: string }[];
};

export async function GET(request: NextRequest): Promise<NextResponse<SuggestResponse>> {
  const parsed = querySchema.safeParse({
    q: request.nextUrl.searchParams.get('q') ?? '',
    limit: request.nextUrl.searchParams.get('limit') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ suggestions: [] }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }

  try {
    const suggestions = await fetchSuggestions(parsed.data.q, parsed.data.limit);
    return NextResponse.json({ suggestions }, { status: 200 });
  } catch (error) {
    // The message only: a Supabase error can carry the query text, which is the
    // visitor's own input and has no place in a shared log.
    logger.warn('catalogue.suggest_failed', {
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
}

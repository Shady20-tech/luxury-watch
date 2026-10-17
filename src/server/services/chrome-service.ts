import 'server-only';

import { cache } from 'react';

import { getPublicEnv, isSupabaseConfigured } from '@/lib/env';
import { logger } from '@/lib/logger';
import { assembleChrome } from '@/lib/navigation/assemble';
import { fallbackChrome } from '@/lib/navigation/fallback';
import type { ChromeData } from '@/lib/navigation/types';
import {
  fetchActiveAnnouncements,
  fetchBrands,
  fetchFooterNavigation,
  fetchHeaderNavigation,
  fetchModels,
  fetchSiteSettings,
} from '@/server/repositories/navigation-repository';

/**
 * Build the site chrome, degrading honestly.
 *
 * Three states are possible and each is treated differently:
 *
 *  1. **Supabase configured and reachable** → data comes from the database and
 *     `source` is `'database'`. This is the intended production state.
 *  2. **Supabase not configured** (the current state, issue A1) → the fixture
 *     is used and `source` is `'fallback'`. This is expected, not an error, so
 *     it is not logged as one; the health endpoint is where missing
 *     configuration is reported.
 *  3. **Supabase configured but the query fails** → the fixture is used, the
 *     error is logged at `warn` with the failing query, and the request still
 *     renders. A navigation outage must not take down every page on the site.
 *
 * The chrome is wrapped in `cache()` so the header, footer and mobile drawer in
 * one render share a single set of queries rather than issuing six round trips.
 */
async function loadChrome(): Promise<ChromeData> {
  if (!isSupabaseConfigured()) {
    return fallbackChrome;
  }

  try {
    const [headerRows, footerRows, brands, models, announcements, settings] = await Promise.all([
      fetchHeaderNavigation(),
      fetchFooterNavigation(),
      fetchBrands(),
      fetchModels(),
      fetchActiveAnnouncements(),
      fetchSiteSettings(),
    ]);

    return assembleChrome({
      headerRows,
      footerRows,
      brands,
      models,
      announcements,
      settings,
      // Only consulted when there is no settings row. Once the row exists, the
      // database decides whether the gate is shown, so the operator can switch
      // it off without a deployment.
      ageGateFallback: getPublicEnv().enableAgeGate,
      source: 'database',
    });
  } catch (error) {
    logger.warn('chrome.load_failed', {
      // The message only; a Supabase error can carry the query and row data.
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return fallbackChrome;
  }
}

export const getChrome = cache(loadChrome);

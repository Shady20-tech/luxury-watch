import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Minimal catalogue lookups.
 *
 * Phase 4 renders a homepage whose cards link to `/products/<slug>` and
 * `/brands/<slug>`. Those routes do not exist yet — the catalogue phase builds
 * them — but a card that links to a 404 is a broken storefront. These two
 * lookups exist so the placeholder routes can tell a real slug from an invented
 * one and answer `notFound()` for the latter, instead of returning a 200 for
 * any string.
 *
 * They select the minimum needed to name the record, nothing more. The
 * catalogue phase replaces them with the real queries.
 */

/** A published product's identity, or `null` when the slug is not published. */
export async function fetchPublishedProductSummary(
  slug: string,
): Promise<{ title: string; brandName: string | null } | null> {
  const supabase = await createSupabaseServerClient();

  // RLS already restricts this to published rows, so a draft slug returns no
  // row and the caller 404s — which is the correct public answer.
  const { data, error } = await supabase
    .from('products')
    .select('title, brands ( name )')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    title: data.title,
    brandName: (data.brands as { name: string } | null)?.name ?? null,
  };
}

/** An active brand's identity, or `null` when the slug is not active. */
export async function fetchActiveBrandSummary(slug: string): Promise<{ name: string } | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('brands')
    .select('name')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/** An active collection's identity, or `null` when the slug is not active. */
export async function fetchActiveCollectionSummary(
  slug: string,
): Promise<{ title: string } | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('collections')
    .select('title')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

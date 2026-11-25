import { getPublicEnv } from '@/lib/env';

/**
 * Turn a stored image reference into a URL `next/image` can actually load.
 *
 * Two columns can hold an image: `storage_path` (an object in Supabase Storage)
 * and `external_url` (a URL hosted elsewhere). They are not treated as
 * equivalent.
 *
 *  - `storage_path` is the supported route. It is resolved against the project
 *    URL and returned.
 *  - `external_url` is accepted in two cases only:
 *      1. an absolute URL on our own Supabase host, or
 *      2. a **root-relative path** (`/seed-images/...`), which is same-origin by
 *         construction and cannot point at a third party.
 *    Anything else returns `null`, which renders the honest placeholder. The
 *    reasons are three: `next.config.ts` allowlists only the Supabase host for
 *    remote images, so a third-party URL would throw at render time; hotlinking
 *    another business's photography is a licensing problem; and a dead link is
 *    a broken image on a page that must never show one.
 *
 * The root-relative form exists for the openly-licensed seed photography that
 * ships in `public/seed-images`. Those files are in this repository, so they are
 * served from our own origin and carry no hotlinking question — but they are not
 * Supabase Storage objects either, so `storage_path` is the wrong column for
 * them. Accepting a root-relative `external_url` keeps one resolver for both
 * without widening it to the open internet.
 *
 * Returning `null` is always safe — every consumer falls back to a labelled
 * placeholder rather than a broken image.
 */
export function resolveImageUrl(
  storagePath: string | null | undefined,
  externalUrl: string | null | undefined,
): string | null {
  const { supabaseUrl } = getPublicEnv();

  if (storagePath) {
    if (!supabaseUrl) {
      // Without a project URL a storage path cannot be resolved, so showing a
      // placeholder is more honest than emitting a relative path that 404s.
      return null;
    }
    return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/media/${storagePath.replace(/^\//, '')}`;
  }

  if (!externalUrl) return null;

  // A root-relative path is same-origin and cannot address a third party.
  // `//host` is protocol-relative and is *not* same-origin, so it is excluded
  // here rather than left to the URL parser to normalise.
  if (externalUrl.startsWith('/') && !externalUrl.startsWith('//')) {
    return externalUrl;
  }

  if (supabaseUrl) {
    try {
      const external = new URL(externalUrl);
      const project = new URL(supabaseUrl);
      if (external.protocol === 'https:' && external.hostname === project.hostname) {
        return external.toString();
      }
    } catch {
      return null;
    }
  }

  return null;
}

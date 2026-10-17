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
 *  - `external_url` is only accepted when it already points at our own Supabase
 *    host. Anything else returns `null`, which renders the honest placeholder.
 *    The reason is twofold: `next.config.ts` allowlists only the Supabase host
 *    for remote images, so a third-party URL would throw at render time; and
 *    hotlinking another business's photography is a licensing problem, which is
 *    why the catalogue seed deliberately carries no image URLs at all.
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

  if (externalUrl && supabaseUrl) {
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

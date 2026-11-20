import { getPublicEnv } from '@/lib/env';

/**
 * Where a customer's avatar lives, and how to address it.
 *
 * -----------------------------------------------------------------------------
 * WHY THE PATH IS BUILT HERE AND NOT IN THE BROWSER
 * -----------------------------------------------------------------------------
 *
 * The first folder segment is the user id, and the `avatars` storage policies
 * (0023) compare it to `auth.uid()`. That makes the folder the authorisation
 * boundary, so it must come from the session and never from the request. A
 * caller that could choose its own path could write into another customer's
 * folder, and the policy would refuse — but only because the policy exists; the
 * application should not be relying on it to catch a mistake it can avoid.
 *
 * -----------------------------------------------------------------------------
 * WHY THE NAME CARRIES A HASH
 * -----------------------------------------------------------------------------
 *
 * Replacing an avatar writes a new object rather than overwriting the old one.
 * An overwrite would change the bytes behind a URL that a browser, a CDN or
 * another page has already cached, so a customer would see their old picture
 * until the cache expired — or, worse, a page that had cached the URL would
 * serve one image while the profile claimed another. A new name makes the change
 * immediate and the old object safe to delete.
 */

export const AVATAR_BUCKET = 'avatars';

/** The largest avatar accepted, in bytes. Matches the bucket limit in 0023. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** The types an avatar may be. GIF is deliberately absent; see 0023. */
export const ALLOWED_AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

/**
 * A storage path for one avatar.
 *
 * `contentHash` should be a hex digest of the bytes. It is not validated here —
 * the caller has the bytes and produces it — but the character class is narrowed
 * so a hash that somehow contains a slash cannot escape the user's folder.
 */
export function avatarPath(userId: string, contentHash: string, extension: string): string {
  const safeHash = contentHash.replace(/[^a-z0-9]/gi, '').slice(0, 32) || 'avatar';
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
  return `${userId}/${safeHash}.${safeExtension}`;
}

/** The public URL for a stored avatar path. `null` when Supabase is unconfigured. */
export function avatarPublicUrl(path: string): string | null {
  const { supabaseUrl } = getPublicEnv();
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${AVATAR_BUCKET}/${path.replace(/^\//, '')}`;
}

/**
 * The object path inside `avatar_url`, when that URL is one of ours.
 *
 * Needed to delete the previous avatar after a replacement. It returns `null`
 * for anything that is not an object in our own `avatars` bucket — a profile
 * whose `avatar_url` was set by hand or by an import must not become a
 * delete-a-URL primitive.
 */
export function avatarPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  const { supabaseUrl } = getPublicEnv();
  if (!supabaseUrl) return null;

  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;

  // Only our own project's host counts. A URL pointing at another host that
  // happens to contain the marker is not ours to delete.
  try {
    const parsed = new URL(url);
    const project = new URL(supabaseUrl);
    if (parsed.hostname !== project.hostname) return null;
  } catch {
    return null;
  }

  const path = url.slice(index + marker.length);
  return path === '' ? null : path;
}

/** The file extension for a MIME type the avatar bucket accepts. */
export function avatarExtension(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/avif':
      return 'avif';
    default:
      return 'jpg';
  }
}

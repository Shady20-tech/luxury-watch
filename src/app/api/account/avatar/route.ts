import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

import { checkImageSignature } from '@/lib/images/signature';
import { logger } from '@/lib/logger';
import {
  ALLOWED_AVATAR_MIME,
  MAX_AVATAR_BYTES,
  avatarExtension,
  avatarPath,
  avatarPathFromUrl,
  avatarPublicUrl,
} from '@/lib/profile/avatar';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fetchProfile, getAuthUser, updateAvatarUrl } from '@/server/repositories/auth-repository';

/**
 * Upload or replace the signed-in customer's profile photograph.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS A ROUTE HANDLER AND NOT A SERVER ACTION
 * -----------------------------------------------------------------------------
 *
 * Same reason as the admin media uploader: a `file` input is awkward through a
 * Server Action, because the whole body is sent before the action runs and one
 * failure loses the response. A Route Handler returns a plain JSON result the
 * uploader can show inline.
 *
 * -----------------------------------------------------------------------------
 * WHY THE SESSION CLIENT AND NOT THE SERVICE-ROLE CLIENT
 * -----------------------------------------------------------------------------
 *
 * The service-role client authenticates the call but not the caller, so it would
 * bypass the very storage policies that make a customer's folder their own. This
 * uses the request-scoped cookie client throughout: the upload is refused by RLS
 * if the path is not the caller's, and the profile write is refused by
 * `profiles_update_own` if the row is not theirs. Neither check is trusted to the
 * application alone.
 *
 * -----------------------------------------------------------------------------
 * ORDER OF OPERATIONS
 * -----------------------------------------------------------------------------
 *
 *   1. Upload the new object.
 *   2. Point `profiles.avatar_url` at it.
 *   3. Delete the old object.
 *
 * If step 2 fails the new object is removed, so a failed update leaves nothing
 * behind. If step 3 fails the old object is orphaned but the profile is correct —
 * an invisible orphan is much better than a broken avatar, which is the same
 * trade the media uploader makes and for the same reason.
 */

export const runtime = 'nodejs';

/** The handler reads the caller's session, so its response can never be shared. */
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in to change your photo.' },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: 'No file was sent.' }, { status: 400 });
  }

  if (!(ALLOWED_AVATAR_MIME as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      {
        ok: false,
        message:
          file.type === 'image/gif'
            ? 'Animated images are not supported. Upload a JPEG, PNG, WebP or AVIF photograph.'
            : 'Upload a JPEG, PNG, WebP or AVIF photograph.',
      },
      { status: 400 },
    );
  }

  if (file.size <= 0) {
    return NextResponse.json({ ok: false, message: 'That file is empty.' }, { status: 400 });
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        message: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB; resize it first.`,
      },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // The declared type is on the allow-list; this is the statement about the
  // bytes. A file that is really something else is refused before storage.
  const signature = checkImageSignature(bytes, file.type);
  if (!signature.ok) {
    logger.warn('account.avatar_signature_rejected', {
      declared: file.type,
      detected: signature.detected ?? 'none',
    });
    return NextResponse.json({ ok: false, message: signature.message }, { status: 400 });
  }

  const checksum = createHash('sha256').update(bytes).digest('hex');
  const path = avatarPath(user.id, checksum, avatarExtension(file.type));
  const publicUrl = avatarPublicUrl(path);

  if (!publicUrl) {
    return NextResponse.json(
      { ok: false, message: 'Photo storage is not configured.' },
      { status: 503 },
    );
  }

  const supabase = await createSupabaseServerClient();

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    // The object name is the content hash, so an upload that collides with an
    // existing object is the same image already stored in the caller's own
    // folder. Re-uploading an unchanged photo is a normal thing for a person to
    // do, and failing it would be a confusing error for a no-op. Confirm the
    // object is really there, then carry on and point the profile at it.
    const { data: existing } = await supabase.storage.from('avatars').list(user.id, {
      search: path.slice(user.id.length + 1),
      limit: 1,
    });

    if (!existing || existing.length === 0) {
      logger.error('account.avatar_upload_failed', { message: uploadError.message });
      return NextResponse.json(
        { ok: false, message: 'The photo could not be stored. Try again.' },
        { status: 500 },
      );
    }
  }

  const previousUrl = (await fetchProfile(user.id))?.avatarUrl ?? null;

  try {
    await updateAvatarUrl(user.id, publicUrl);
  } catch (error) {
    await supabase.storage.from('avatars').remove([path]);
    logger.error('account.avatar_profile_write_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { ok: false, message: 'The photo could not be saved to your profile. Try again.' },
      { status: 500 },
    );
  }

  // Best effort: the profile is already correct, so a failure here must not turn
  // a successful change into an error. It only leaves an unreferenced object.
  const previousPath = avatarPathFromUrl(previousUrl);
  if (previousPath && previousPath !== path) {
    const { error: removeError } = await supabase.storage.from('avatars').remove([previousPath]);
    if (removeError) {
      logger.warn('account.avatar_old_object_not_removed', { message: removeError.message });
    }
  }

  return NextResponse.json({ ok: true, url: publicUrl }, { status: 201 });
}

/**
 * Remove the signed-in customer's photograph.
 *
 * The profile is cleared first and the object deleted second, because a profile
 * pointing at a missing object renders a broken image while an orphaned object
 * renders nothing at all.
 */
export async function DELETE(): Promise<NextResponse> {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, message: 'Sign in to change your photo.' },
      { status: 401 },
    );
  }

  const previousUrl = (await fetchProfile(user.id))?.avatarUrl ?? null;

  try {
    await updateAvatarUrl(user.id, null);
  } catch (error) {
    logger.error('account.avatar_clear_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { ok: false, message: 'The photo could not be removed. Try again.' },
      { status: 500 },
    );
  }

  const previousPath = avatarPathFromUrl(previousUrl);
  if (previousPath) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.storage.from('avatars').remove([previousPath]);
    if (error) logger.warn('account.avatar_old_object_not_removed', { message: error.message });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

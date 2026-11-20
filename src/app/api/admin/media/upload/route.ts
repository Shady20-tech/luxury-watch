import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

import {
  MEDIA_CATEGORIES,
  safeObjectName,
  validateMediaUpload,
  type MediaCategory,
} from '@/lib/admin/content-validation';
import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AdminPermissionError, requirePermission } from '@/server/services/admin-authorization';

/**
 * Upload an image into the public media library.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS A ROUTE HANDLER AND NOT A SERVER ACTION
 * -----------------------------------------------------------------------------
 *
 * A Server Action receives `FormData` and is the natural home for a form. A file
 * input is the case where that is awkward: the browser sends the whole body
 * before the action runs, and a failure for one file loses the others. A Route
 * Handler returns a plain `Response`, which the uploader can call per file and
 * report success or failure individually.
 *
 * -----------------------------------------------------------------------------
 * WHY THE TABLE INSERT USES THE SERVICE-ROLE CLIENT
 * -----------------------------------------------------------------------------
 *
 * `storage.objects` carries an insert policy gated on `content.write`, so the
 * session client performs the upload. The table insert goes through the
 * privileged client for one reason: it must record the exact `storage_path` the
 * bucket stored, and doing the row write separately means it cannot silently pick
 * a different path. `requirePermission` above is what makes the privileged client
 * safe — the same rule as every other admin path.
 *
 * -----------------------------------------------------------------------------
 * WHY THE OBJECT IS REMOVED WHEN THE ROW INSERT FAILS
 * -----------------------------------------------------------------------------
 *
 * The two writes are not transactional. If the upload succeeds and the insert
 * fails, the object is orphaned: it exists in the bucket and nothing points at
 * it, so nothing can ever find it again to delete it. Removing it restores the
 * state the caller expects — nothing was added. The reverse order would leave a
 * row pointing at an object that does not exist, which is visible as a broken
 * thumbnail and is worse than an invisible orphan.
 */

export const runtime = 'nodejs';

/** The handler reads the caller's session, so its response can never be shared. */
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) {
      return NextResponse.json(
        { ok: false, message: 'You do not have permission to upload images.' },
        { status: 403 },
      );
    }
    throw error;
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: 'No file was sent.' }, { status: 400 });
  }

  const validation = validateMediaUpload({ type: file.type, size: file.size, name: file.name });
  if (!validation.ok) {
    return NextResponse.json({ ok: false, message: validation.message }, { status: 400 });
  }

  const requestedCategory = String(formData.get('category') ?? 'editorial');
  const category: MediaCategory = (MEDIA_CATEGORIES as readonly string[]).includes(
    requestedCategory,
  )
    ? (requestedCategory as MediaCategory)
    : 'editorial';

  const altText = String(formData.get('altText') ?? '').trim();

  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash('sha256').update(bytes).digest('hex');

  const supabase = await createSupabaseServerClient();

  // Identical bytes already stored: reuse that row rather than storing a second
  // copy. An editor re-uploading the same hero shot for another page is common,
  // and two copies would drift when only one is replaced.
  const { data: existing } = await supabase
    .from('media')
    .select('id, storage_path')
    .eq('checksum_sha256', checksum)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      ok: true,
      reused: true,
      id: existing.id,
      path: existing.storage_path,
    });
  }

  const storagePath = `${categoryFolder(category)}/${safeObjectName(file.name, file.type)}`;

  const { error: uploadError } = await supabase.storage
    .from('media')
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });

  if (uploadError) {
    logger.error('admin.media_upload_failed', { message: uploadError.message });
    return NextResponse.json(
      { ok: false, message: 'The image could not be stored. Try again.' },
      { status: 500 },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: row, error: rowError } = await admin
    .from('media')
    .insert({
      storage_bucket: 'media',
      storage_path: storagePath,
      file_name: file.name.slice(0, 200),
      mime_type: file.type,
      size_bytes: file.size,
      alt_text: altText === '' ? null : altText.slice(0, 300),
      category,
      checksum_sha256: checksum,
    })
    .select('id')
    .single();

  if (rowError || !row) {
    await supabase.storage.from('media').remove([storagePath]);
    logger.error('admin.media_row_insert_failed', { message: rowError?.message ?? 'no row' });
    return NextResponse.json(
      { ok: false, message: 'The image record could not be saved.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: row.id, path: storagePath }, { status: 201 });
}

function categoryFolder(category: MediaCategory): string {
  if (category === 'product') return 'products';
  if (category === 'brand') return 'brands';
  return 'editorial';
}

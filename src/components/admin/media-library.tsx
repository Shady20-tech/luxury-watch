'use client';

import { useActionState, useRef, useState } from 'react';

import {
  MAX_MEDIA_BYTES,
  MEDIA_CATEGORIES,
  type MediaCategory,
} from '@/lib/admin/content-validation';
import type { AdminFormState } from '@/lib/admin/validation';
import { IDLE_ADMIN_STATE } from '@/lib/admin/validation';
import { resolveImageUrl } from '@/lib/media';
import type { AdminMediaRow } from '@/server/repositories/admin-content-repository';

import { inputClass, labelClass } from './form-kit';

/**
 * The media library.
 *
 * -----------------------------------------------------------------------------
 * WHY THE UPLOAD IS NOT A SERVER ACTION
 * -----------------------------------------------------------------------------
 *
 * It posts to `/api/admin/media/upload` with `fetch` rather than through
 * `useActionState`, for one reason: a Server Action cannot report per-file
 * progress, and a gallery upload is a batch. Each file is sent on its own so one
 * rejection (too large, wrong type) does not lose the others, and each result is
 * reported beside the file it belongs to.
 *
 * -----------------------------------------------------------------------------
 * WHY THE FILE IS CHECKED HERE AND AGAIN ON THE SERVER
 * -----------------------------------------------------------------------------
 *
 * `accept` and `maxLength` on an input are hints a determined caller ignores. The
 * client check exists to give a fast, specific message before spending a request;
 * the route repeats it because that is where it counts. Neither is a substitute
 * for the other.
 */

const CATEGORY_LABELS: Record<MediaCategory, string> = {
  product: 'Product photograph',
  editorial: 'Editorial image',
  brand: 'Brand logo',
};

type UploadResult = { file: string; ok: boolean; message: string };

export function MediaLibrary({
  media,
  deleteAction,
}: {
  media: AdminMediaRow[];
  deleteAction: (state: AdminFormState, formData: FormData) => Promise<AdminFormState>;
}) {
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const categorySelect = useRef<HTMLSelectElement>(null);
  const altInput = useRef<HTMLInputElement>(null);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = fileInput.current;
    if (!input?.files || input.files.length === 0) return;

    setUploading(true);
    setUploadResults([]);
    const results: UploadResult[] = [];

    for (const file of Array.from(input.files)) {
      if (file.size > MAX_MEDIA_BYTES) {
        results.push({
          file: file.name,
          ok: false,
          message: `Too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The limit is 8 MB.`,
        });
        continue;
      }

      const body = new FormData();
      body.set('file', file);
      body.set('category', categorySelect.current?.value ?? 'editorial');
      body.set('altText', altInput.current?.value ?? '');

      try {
        const response = await fetch('/api/admin/media/upload', { method: 'POST', body });
        const payload = (await response.json()) as {
          ok: boolean;
          message?: string;
          reused?: boolean;
        };
        results.push({
          file: file.name,
          ok: payload.ok,
          message: payload.ok
            ? payload.reused
              ? 'Already in the library — reused.'
              : 'Uploaded.'
            : (payload.message ?? 'The upload failed.'),
        });
      } catch {
        results.push({ file: file.name, ok: false, message: 'The upload failed.' });
      }
    }

    setUploadResults(results);
    setUploading(false);
    if (input) input.value = '';
    // The list is server-rendered; reloading is the honest way to show the new
    // rows without duplicating the query in the client.
    if (results.some((result) => result.ok)) window.location.reload();
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="upload-heading" className="border-line-300 rounded-md border p-6">
        <h2 id="upload-heading" className="mb-4 text-lg">
          Upload images
        </h2>
        <form onSubmit={handleUpload} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="media-file">
              Images
            </label>
            <input
              ref={fileInput}
              id="media-file"
              name="file"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
              className={inputClass}
            />
            <p className="text-ink-500 mt-1 text-xs">
              JPEG, PNG, WebP, AVIF or GIF, up to 8 MB each. SVG is not accepted.
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor="media-category">
              Category
            </label>
            <select
              ref={categorySelect}
              id="media-category"
              name="category"
              defaultValue="editorial"
              className={inputClass}
            >
              {MEDIA_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="media-alt">
              Alt text
            </label>
            <input
              ref={altInput}
              id="media-alt"
              name="altText"
              type="text"
              maxLength={300}
              className={inputClass}
            />
            <p className="text-ink-500 mt-1 text-xs">
              Describe the image for someone who cannot see it.
            </p>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={uploading}
              className="bg-ink-900 hover:bg-ink-800 rounded-sm px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>

        {uploadResults.length > 0 ? (
          <ul className="mt-4 space-y-1" aria-live="polite">
            {uploadResults.map((result) => (
              <li
                key={result.file}
                className={result.ok ? 'text-ink-600 text-sm' : 'text-danger-600 text-sm'}
              >
                {result.file}: {result.message}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="library-heading">
        <h2 id="library-heading" className="mb-4 text-lg">
          Library ({media.length})
        </h2>

        {media.length === 0 ? (
          <p className="text-ink-500 text-sm">
            No images yet. Upload one above and it will appear here.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {media.map((asset) => (
              <MediaCard key={asset.id} asset={asset} deleteAction={deleteAction} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MediaCard({
  asset,
  deleteAction,
}: {
  asset: AdminMediaRow;
  deleteAction: (state: AdminFormState, formData: FormData) => Promise<AdminFormState>;
}) {
  const [state, formAction, pending] = useActionState(deleteAction, IDLE_ADMIN_STATE);
  const url = resolveImageUrl(asset.storagePath, null);

  return (
    <li className="border-line-300 overflow-hidden rounded-md border">
      <div className="bg-surface-200 relative aspect-[4/3]">
        {url ? (
          // The library is admin-only and the images are small; `next/image`
          // would need a remote pattern for a host that is not always set.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={asset.altText ?? ''} className="h-full w-full object-cover" />
        ) : (
          <p className="text-ink-500 flex h-full items-center justify-center px-4 text-center text-xs">
            Preview unavailable — Supabase Storage is not configured.
          </p>
        )}
      </div>

      <div className="space-y-2 p-3">
        <p className="text-ink-900 truncate text-sm" title={asset.fileName}>
          {asset.title ?? asset.fileName}
        </p>
        <p className="text-ink-500 text-xs">
          {CATEGORY_LABELS[asset.category]}
          {asset.sizeBytes ? ` · ${Math.round(asset.sizeBytes / 1024)} KB` : ''}
        </p>
        <p className="text-ink-500 break-all font-mono text-[0.75rem]">{asset.storagePath}</p>

        <form action={formAction}>
          <input type="hidden" name="id" value={asset.id} />
          <button
            type="submit"
            disabled={pending}
            className="text-danger-600 text-xs underline disabled:opacity-60"
          >
            {pending ? 'Removing…' : 'Delete'}
          </button>
        </form>
        {state.status === 'error' && state.message ? (
          <p className="text-danger-600 text-xs" role="alert">
            {state.message}
          </p>
        ) : null}
      </div>
    </li>
  );
}

'use client';

import { AlertCircle, Camera, CheckCircle2, Trash2 } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { MAX_AVATAR_BYTES, ALLOWED_AVATAR_MIME } from '@/lib/profile/avatar';
import { cn } from '@/lib/utils';

/**
 * Profile photograph uploader.
 *
 * -----------------------------------------------------------------------------
 * WHY A CLIENT COMPONENT WITH ITS OWN FETCH
 * -----------------------------------------------------------------------------
 *
 * The upload posts `multipart/form-data` to a Route Handler and reads a JSON
 * answer, so it needs to run in the browser. It is deliberately not optimistic:
 * the preview shown after a successful upload is the URL the server returned, not
 * a local object URL, so what the customer sees is what was actually stored. An
 * optimistic preview that silently failed to save is the worst version of this
 * control, because the customer believes their photo changed.
 *
 * -----------------------------------------------------------------------------
 * WHY THE FILE INPUT IS NOT STYLED AWAY
 * -----------------------------------------------------------------------------
 *
 * A hidden input behind a styled label is the usual pattern and it breaks
 * keyboard and screen-reader users in ways that are hard to notice: the input is
 * removed from the tab order, or the label does not announce the current
 * selection. Here the input is a real, visible, focusable `<input type="file">`
 * with a proper `<label>`, and the visual affordance is a button beside it that
 * clicks it. Both routes work, and neither is a div pretending to be a control.
 */
export function AvatarUploader({
  initialUrl,
  name,
}: {
  initialUrl: string | null;
  name: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const working = busy || pending;

  const initials = (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  async function upload(file: File) {
    setMessage(null);

    // A cheap client-side check so an obviously wrong file does not travel. The
    // server repeats every one of these; this is courtesy, not enforcement.
    if (!(ALLOWED_AVATAR_MIME as readonly string[]).includes(file.type)) {
      setMessage({ kind: 'error', text: 'Choose a JPEG, PNG, WebP or AVIF photograph.' });
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setMessage({
        kind: 'error',
        text: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`,
      });
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);

      const response = await fetch('/api/account/avatar', { method: 'POST', body });
      const result = (await response.json().catch(() => null)) as
        | { ok: true; url: string }
        | { ok: false; message?: string }
        | null;

      if (!response.ok || !result || !result.ok) {
        setMessage({
          kind: 'error',
          text:
            (result && 'message' in result && result.message) ||
            'The photo could not be uploaded. Try again.',
        });
        return;
      }

      setUrl(result.url);
      setMessage({ kind: 'success', text: 'Your photo has been updated.' });
      // The admin and account shells both render this picture from the server,
      // so the cached render is now stale.
      startTransition(() => router.refresh());
    } catch {
      setMessage({
        kind: 'error',
        text: 'The photo could not be uploaded. Check your connection.',
      });
    } finally {
      setBusy(false);
      // Reset so choosing the same file again still fires `change`.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function remove() {
    setMessage(null);
    setBusy(true);
    try {
      const response = await fetch('/api/account/avatar', { method: 'DELETE' });
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { message?: string } | null;
        setMessage({
          kind: 'error',
          text: result?.message ?? 'The photo could not be removed. Try again.',
        });
        return;
      }
      setUrl(null);
      setMessage({ kind: 'success', text: 'Your photo has been removed.' });
      startTransition(() => router.refresh());
    } catch {
      setMessage({ kind: 'error', text: 'The photo could not be removed. Check your connection.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="photo-heading" className="flex flex-col gap-4">
      <div>
        <h3 id="photo-heading" className="text-base font-semibold">
          Profile photo
        </h3>
        <p className="text-foreground-muted mt-1 max-w-prose text-sm">
          Shown beside your name. A JPEG, PNG, WebP or AVIF image up to 2 MB.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-5">
        <div
          className={cn(
            'border-line-300 bg-surface-100 relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border',
          )}
        >
          {url ? (
            // A plain <img> rather than next/image: the URL is on the Supabase
            // host and changes on every upload, so optimising it would add a
            // proxy round trip for a 80px avatar and cache a stale variant.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden="true" className="text-ink-500 text-xl font-medium">
              {initials || '—'}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="avatar-file" className="text-sm font-medium">
            {url ? 'Replace your photo' : 'Add a photo'}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              id="avatar-file"
              name="file"
              type="file"
              accept={ALLOWED_AVATAR_MIME.join(',')}
              disabled={working}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
              className="text-ink-700 file:border-line-300 file:bg-surface-0 hover:file:bg-surface-100 file:text-ink-900 text-sm file:mr-3 file:cursor-pointer file:rounded-sm file:border file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={working}
            >
              <Camera aria-hidden="true" className="h-4 w-4" />
              {url ? 'Choose another' : 'Choose a photo'}
            </Button>

            {url ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void remove()}
                disabled={working}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                Remove
              </Button>
            ) : null}
          </div>
          {working ? (
            <p role="status" aria-live="polite" className="text-foreground-muted text-xs">
              Uploading…
            </p>
          ) : null}
        </div>
      </div>

      {message ? (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          aria-live={message.kind === 'error' ? 'assertive' : 'polite'}
          className={cn(
            'flex items-start gap-2 text-sm',
            message.kind === 'error' ? 'text-danger-600' : 'text-success-600',
          )}
        >
          {message.kind === 'error' ? (
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

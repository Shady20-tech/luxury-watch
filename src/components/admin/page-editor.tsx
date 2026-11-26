'use client';

import { useActionState } from 'react';

import type { AdminFormState } from '@/lib/admin/validation';
import { IDLE_ADMIN_STATE } from '@/lib/admin/validation';
import type { AdminPageRow } from '@/server/repositories/admin-content-repository';
import { deletePageAction } from '@/server/actions/content-actions';

import { inputClass } from './form-kit';

/**
 * The page list, with a delete that explains itself.
 *
 * The delete is refused for a system page (one that backs a fixed route such as
 * `/pages/privacy`). The refusal is shown inline because "nothing happened" is
 * the worst possible response to a delete: the editor cannot tell whether the
 * click registered.
 */
export function PageList({ pages }: { pages: AdminPageRow[] }) {
  if (pages.length === 0) {
    return (
      <p className="text-ink-500 text-sm">
        No pages yet. Create one to add editorial content at /pages/&lt;slug&gt;.
      </p>
    );
  }

  return (
    <ul className="divide-line-200 border-line-200 divide-y rounded-2xl border">
      {pages.map((page) => (
        <li key={page.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {page.title}
              {page.isSystem ? (
                <span className="text-ink-500 ml-2 text-xs font-normal">system page</span>
              ) : null}
            </p>
            <p className="text-ink-500 mt-1 font-mono text-xs">/pages/{page.slug}</p>
            <p className="text-ink-500 mt-1 text-xs">
              {page.status === 'published'
                ? `Published${page.publishedAt ? ` ${page.publishedAt.slice(0, 10)}` : ''}`
                : page.status === 'draft'
                  ? 'Draft — not visible'
                  : 'Archived — not visible'}
            </p>
          </div>
          <div className="flex items-start gap-3">
            <a href={`/admin/settings/pages/${page.id}`} className="text-ink-700 text-xs underline">
              Edit<span className="sr-only"> {page.title}</span>
            </a>
            <DeletePageForm page={page} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeletePageForm({ page }: { page: AdminPageRow }) {
  const [state, formAction, pending] = useActionState(deletePageAction, IDLE_ADMIN_STATE);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={page.id} />
      <button
        type="submit"
        disabled={pending}
        className="text-danger-600 text-xs underline disabled:opacity-60"
      >
        {pending ? 'Removing…' : 'Delete'}
        <span className="sr-only"> {page.title}</span>
      </button>
      {state.status === 'error' && state.message ? (
        <p className="text-danger-600 mt-1 max-w-xs text-xs" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/**
 * The page editor.
 *
 * The body is JSON because `pages.content` is a `jsonb` array of typed blocks and
 * the renderer understands six block types. The textarea is a deliberate choice
 * for this phase: a block builder is a larger piece of work, and a half-built one
 * that can produce a block the renderer drops would be worse than an honest JSON
 * editor with a documented shape. The shape is shown above the textarea and
 * validated on save against the renderer's own parser.
 */
export function PageForm({
  action,
  page,
  bodyExample,
}: {
  action: (state: AdminFormState, formData: FormData) => Promise<AdminFormState>;
  page?: AdminPageRow;
  bodyExample: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_ADMIN_STATE);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      {page ? <input type="hidden" name="id" value={page.id} /> : null}

      {state.status === 'error' && state.message ? (
        <p className="text-danger-600 text-sm" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === 'success' && state.message ? (
        <p className="text-ink-600 text-sm" role="status">
          {state.message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-ink-700 mb-1 block text-xs font-medium" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            maxLength={200}
            defaultValue={page?.title ?? ''}
            className={inputClass}
          />
          {errors.title ? <p className="text-danger-600 mt-1 text-xs">{errors.title}</p> : null}
        </div>
        <div>
          <label className="text-ink-700 mb-1 block text-xs font-medium" htmlFor="slug">
            Address
          </label>
          <div className="flex items-center gap-1">
            <span className="text-ink-500 text-xs">/pages/</span>
            <input
              id="slug"
              name="slug"
              required
              maxLength={120}
              defaultValue={page?.slug ?? ''}
              className={inputClass}
            />
          </div>
          {errors.slug ? <p className="text-danger-600 mt-1 text-xs">{errors.slug}</p> : null}
        </div>
      </div>

      <div>
        <label className="text-ink-700 mb-1 block text-xs font-medium" htmlFor="excerpt">
          Summary
        </label>
        <input
          id="excerpt"
          name="excerpt"
          maxLength={500}
          defaultValue={page?.excerpt ?? ''}
          className={inputClass}
        />
        {errors.excerpt ? <p className="text-danger-600 mt-1 text-xs">{errors.excerpt}</p> : null}
      </div>

      <div>
        <label className="text-ink-700 mb-1 block text-xs font-medium" htmlFor="heroImageUrl">
          Hero image URL
        </label>
        <input
          id="heroImageUrl"
          name="heroImageUrl"
          defaultValue={page?.heroImageUrl ?? ''}
          className={inputClass}
        />
        {errors.heroImageUrl ? (
          <p className="text-danger-600 mt-1 text-xs">{errors.heroImageUrl}</p>
        ) : null}
      </div>

      <div>
        <label className="text-ink-700 mb-1 block text-xs font-medium" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={page?.status ?? 'draft'}
          className={inputClass}
        >
          <option value="draft">Draft — not visible</option>
          <option value="published">Published</option>
          <option value="archived">Archived — not visible</option>
        </select>
        {errors.status ? <p className="text-danger-600 mt-1 text-xs">{errors.status}</p> : null}
      </div>

      <div>
        <label className="text-ink-700 mb-1 block text-xs font-medium" htmlFor="body">
          Body
        </label>
        <p className="text-ink-500 mb-1 text-xs">
          A JSON array of blocks. Recognised types: <code className="font-mono">heading</code>,{' '}
          <code className="font-mono">paragraph</code>, <code className="font-mono">list</code>,{' '}
          <code className="font-mono">callout</code>, <code className="font-mono">faq</code>,{' '}
          <code className="font-mono">figure</code>. An unrecognised block is rejected rather than
          saved and dropped. A <code className="font-mono">figure</code> names a path from{' '}
          <code className="font-mono">src/lib/images/site-photography.ts</code>, not a URL: the alt
          text, credit and licence come from that registry, so a path it does not know renders
          nothing.
        </p>
        <textarea
          id="body"
          name="body"
          rows={16}
          defaultValue={page?.bodyText ?? bodyExample}
          className={`${inputClass} font-mono text-xs`}
        />
        {errors.body ? <p className="text-danger-600 mt-1 text-xs">{errors.body}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-ink-700 mb-1 block text-xs font-medium" htmlFor="seoTitle">
            Search title
          </label>
          <input
            id="seoTitle"
            name="seoTitle"
            maxLength={70}
            defaultValue={page?.seoTitle ?? ''}
            className={inputClass}
          />
          {errors.seoTitle ? (
            <p className="text-danger-600 mt-1 text-xs">{errors.seoTitle}</p>
          ) : null}
        </div>
        <div>
          <label className="text-ink-700 mb-1 block text-xs font-medium" htmlFor="seoDescription">
            Search description
          </label>
          <input
            id="seoDescription"
            name="seoDescription"
            maxLength={200}
            defaultValue={page?.seoDescription ?? ''}
            className={inputClass}
          />
          {errors.seoDescription ? (
            <p className="text-danger-600 mt-1 text-xs">{errors.seoDescription}</p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-ink-900 hover:bg-ink-800 rounded-sm px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save page'}
        </button>
      </div>
    </form>
  );
}

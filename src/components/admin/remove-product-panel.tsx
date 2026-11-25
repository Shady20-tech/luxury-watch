'use client';

import { Trash2 } from 'lucide-react';
import { useActionState } from 'react';

import { IDLE_ADMIN_STATE } from '@/lib/admin/validation';
import { removeProductAction } from '@/server/actions/admin-actions';

/**
 * Remove a product from sale.
 *
 * A destructive action, so it is separated from the editor and asks for a second
 * confirmation step inline rather than firing on the first click. The action it
 * calls archives the row rather than deleting it — the order history refers to
 * the product and must keep the line intact — but the wording still says
 * "remove", because that is what it does from the shopkeeper's point of view.
 *
 * The button is a real `<button>` inside its own form and never disabled by
 * anything but `pending`: an archived product shows the removed state instead of
 * the control, so there is nothing to double-submit.
 */
export function RemoveProductPanel({
  productId,
  productTitle,
  status,
}: {
  productId: string;
  productTitle: string;
  status: string;
}) {
  const [state, formAction, pending] = useActionState(removeProductAction, IDLE_ADMIN_STATE);

  if (status === 'archived') {
    return (
      <section
        aria-labelledby="remove-heading"
        className="border-line-200 bg-surface-0 rounded-2xl border p-4"
      >
        <h2 id="remove-heading" className="text-ink-900 text-sm font-semibold">
          Removed from sale
        </h2>
        <p className="text-foreground-muted mt-1 text-sm">
          This product is archived. It is hidden from the shop, collections, search and the sitemap,
          but its order history is intact. Re-publish it from the status field above to return it to
          sale.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="remove-heading"
      className="border-danger-600/30 bg-danger-600/5 rounded-md border p-4"
    >
      <h2 id="remove-heading" className="text-ink-900 text-sm font-semibold">
        Remove from sale
      </h2>
      <p className="text-ink-700 mt-1 text-sm">
        Removes “{productTitle}” from the shop, collections, search and the sitemap. The product is
        archived, not deleted, so past order requests keep their history. You can return it to sale
        later by publishing it again.
      </p>

      <form
        action={formAction}
        className="mt-3"
        onSubmit={(event) => {
          if (!window.confirm(`Remove “${productTitle}” from sale?`)) event.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={productId} />
        <button
          type="submit"
          disabled={pending}
          className="border-danger-600/40 text-danger-600 hover:bg-danger-600/10 focus-visible:outline-danger-600 inline-flex items-center gap-1.5 rounded-sm border px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4" />
          {pending ? 'Removing…' : 'Remove product'}
        </button>
      </form>

      {state.status === 'error' && state.message ? (
        <p className="text-danger-600 mt-2 text-sm" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === 'success' && state.message ? (
        <p className="text-ink-600 mt-2 text-sm" role="status">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

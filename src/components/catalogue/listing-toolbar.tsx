import { PAGE_SIZES, SORT_OPTIONS, catalogueHiddenInputs } from '@/lib/catalogue/params';
import type { CatalogueListing } from '@/lib/catalogue/types';

/**
 * The sort and page-size controls.
 *
 * A plain `GET` form, not a JavaScript select. Three reasons:
 *
 *  - It works with JavaScript disabled, which is also what a crawler sees.
 *  - The result is a real URL, so the sorted view is shareable and the back
 *    button undoes it.
 *  - There is no client state that can drift from the URL. A client-side select
 *    that pushes a route is the usual source of "the dropdown says one thing
 *    and the grid shows another".
 *
 * The current filters travel as hidden inputs, because a form submission
 * replaces the whole query string and would otherwise silently drop them.
 */
export function ListingToolbar({ listing }: { listing: CatalogueListing }) {
  const { params, total, page, pageSize, source } = listing;

  // A page-size or sort change is a different result set, so the page number is
  // reset rather than carried over.
  const hidden = catalogueHiddenInputs(params, ['sort', 'pageSize', 'page']);

  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="text-foreground-muted text-sm" aria-live="polite">
        {source === 'unavailable' ? (
          'Availability of the catalogue could not be confirmed.'
        ) : total === 0 ? (
          'No watches match these filters.'
        ) : (
          <>
            Showing <span className="text-foreground font-medium tabular-nums">{first}</span>
            {'–'}
            <span className="text-foreground font-medium tabular-nums">{last}</span> of{' '}
            <span className="text-foreground font-medium tabular-nums">{total}</span>
          </>
        )}
      </p>

      <form method="get" className="flex flex-wrap items-center gap-2">
        {hidden.map((input) => (
          <input key={input.name} type="hidden" name={input.name} value={input.value} />
        ))}

        <label htmlFor="listing-sort" className="text-foreground-muted text-sm">
          Sort
        </label>
        <select
          id="listing-sort"
          name="sort"
          defaultValue={params.sort}
          className="border-line-300 bg-surface-0 h-10 rounded-sm border px-2 text-sm"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label htmlFor="listing-page-size" className="text-foreground-muted text-sm">
          Per page
        </label>
        <select
          id="listing-page-size"
          name="pageSize"
          defaultValue={String(pageSize)}
          className="border-line-300 bg-surface-0 h-10 rounded-sm border px-2 text-sm"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="border-line-300 bg-surface-0 hover:border-ink-900 h-10 rounded-sm border px-3 text-sm font-medium"
        >
          Apply
        </button>
      </form>
    </div>
  );
}

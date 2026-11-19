import { SearchCombobox, SearchSubmitButton } from '@/components/catalogue/search-combobox';
import { catalogueHiddenInputs, type CatalogueParams } from '@/lib/catalogue/params';

/**
 * The search form.
 *
 * A plain `GET` form, for the same reasons as the sort control: it works without
 * JavaScript, it produces a real shareable URL, and there is no client state to
 * drift from the query string.
 *
 * The active filters travel as hidden inputs so that searching from a filtered
 * listing narrows the results rather than silently discarding the filters the
 * visitor had already set. `q` and `page` are excluded because the form supplies
 * them itself.
 *
 * -----------------------------------------------------------------------------
 * THE TYPEAHEAD, AND WHY IT LIVES ON THIS PAGE AND NOT IN THE HEADER
 * -----------------------------------------------------------------------------
 *
 * The box itself is a Client Component so it can offer suggestions as the
 * visitor types, but the form around it stays server-rendered: the hidden
 * filter inputs are computed here, from the validated params, and the submit
 * path is unchanged. With JavaScript off the field is still a working search
 * input, which is the property worth protecting.
 *
 * The header keeps its plain form. The header sits inside a layout that is
 * cached for five minutes and shared by every route; a suggestion list there
 * would fire a request from every page, including ones with nothing to search
 * for, and would need the dark-ground styling duplicated for the popup. The
 * search page is where a visitor has already committed to searching.
 */
export function SearchForm({
  params,
  defaultQuery,
}: {
  params?: CatalogueParams;
  defaultQuery: string;
}) {
  const hidden = params ? catalogueHiddenInputs(params, ['q', 'page']) : [];

  return (
    <form method="get" action="/search" role="search" className="flex max-w-xl gap-2">
      {hidden.map((input) => (
        <input key={input.name} type="hidden" name={input.name} value={input.value} />
      ))}

      <SearchCombobox defaultQuery={defaultQuery} />
      <SearchSubmitButton />
    </form>
  );
}

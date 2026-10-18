import Link from 'next/link';
import { X } from 'lucide-react';

import {
  AVAILABILITY_LABELS,
  CONDITION_LABELS,
  PRICE_MODE_LABELS,
  buildCatalogueHref,
  catalogueBasePath,
  catalogueHiddenInputs,
  hasActiveFilters,
  type AvailabilityMode,
  type CatalogueParams,
  type FacetKey,
  type PriceMode,
} from '@/lib/catalogue/params';
import type { FacetOption, FacetSet } from '@/lib/catalogue/types';
import { cn } from '@/lib/utils';

/**
 * Catalogue filters.
 *
 * -----------------------------------------------------------------------------
 * WHY THE FILTERS ARE LINKS AND GET FORMS
 * -----------------------------------------------------------------------------
 *
 * Every filter here is a real navigation, not a piece of client state:
 *
 *  - A facet value is a link to the URL that includes it, so it is
 *    middle-clickable, shareable and crawlable, and it works with JavaScript
 *    disabled. It also means the back button undoes a filter, which is what a
 *    visitor expects.
 *  - The range filters are plain `GET` forms, which the browser submits to the
 *    same page. No client component is needed and no state can desynchronise
 *    from the URL.
 *
 * That is why this file is a Server Component. A filter sidebar built on client
 * state is the usual source of "the count says 12 but the grid shows 3".
 *
 * -----------------------------------------------------------------------------
 * WHY A COUNT IS SHOWN NEXT TO EACH VALUE
 * -----------------------------------------------------------------------------
 *
 * The counts come from `catalogue_facets`, computed against the *other* active
 * filters, so a value that would yield nothing is visible as "0" rather than
 * leading the visitor to an empty page. A value with no products is rendered
 * disabled instead of hidden, because hiding it would make the list jump
 * around as filters change.
 */

/** The URL parameter name for a facet, from the shared table. */
function facetParams(key: FacetKey, values: string[]): Partial<Record<FacetKey, string[]>> {
  return { [key]: values } as Partial<Record<FacetKey, string[]>>;
}

/**
 * One facet group.
 *
 * Rendered as a `fieldset`/`legend` so the group has a real accessible name, and
 * the list is a plain `ul` of links rather than a checkbox group: each link is
 * an independent navigation, and a checkbox that is actually a link misleads
 * assistive technology about what activation does.
 */
function FacetGroup({
  title,
  options,
  selected,
  params,
  facetKey,
  id,
}: {
  title: string;
  options: FacetOption[];
  selected: string[];
  params: CatalogueParams;
  facetKey: FacetKey;
  id: string;
}) {
  if (options.length === 0) return null;

  return (
    <fieldset className="border-line-200 border-t py-5 first:border-t-0 first:pt-0">
      <legend className="text-foreground mb-3 text-sm font-semibold">{title}</legend>
      <ul id={id} className="flex flex-col gap-1">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          const nextValues = isSelected
            ? selected.filter((value) => value !== option.value)
            : [...selected, option.value];

          return (
            <li key={option.value}>
              <FilterRow
                href={buildCatalogueHref(params, {
                  facets: facetParams(facetKey, nextValues),
                  // Any filter change invalidates the page number: page 4 of the
                  // unfiltered list is not page 4 of the filtered list.
                  page: 1,
                })}
                label={option.label}
                count={option.count}
                selected={isSelected}
                // A value that would yield nothing stays visible but is not
                // clickable, so the list does not jump as filters change.
                disabled={option.count === 0 && !isSelected}
              />
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/**
 * A numeric range filter, submitted as a `GET` form.
 *
 * The bounds are the real bounds of the current result set, read from the
 * database. They are shown as placeholders rather than as `min`/`max`
 * attributes, so a visitor can type a value outside the range without the
 * browser silently clamping it and without the control implying the catalogue
 * contains something it does not.
 */
function RangeFilter({
  title,
  id,
  params,
  fieldMin,
  fieldMax,
  range,
  unit = '',
  exclude,
  hint,
}: {
  title: string;
  id: string;
  params: CatalogueParams;
  fieldMin: string;
  fieldMax: string;
  range: { min: number | null; max: number | null };
  unit?: string;
  exclude: string[];
  hint?: string;
}) {
  const hidden = catalogueHiddenInputs(params, [...exclude, fieldMin, fieldMax, 'page']);
  const currentMin =
    fieldMin === 'priceMin'
      ? params.priceMin
      : fieldMin === 'yearMin'
        ? params.yearMin
        : params.caseMin;
  const currentMax =
    fieldMax === 'priceMax'
      ? params.priceMax
      : fieldMax === 'yearMax'
        ? params.yearMax
        : params.caseMax;

  // Prices are stored in minor units and typed in whole units.
  const toDisplay = (value: number | null) => {
    if (value === null) return '';
    return fieldMin === 'priceMin' || fieldMax === 'priceMax' ? String(value / 100) : String(value);
  };

  return (
    <form
      method="get"
      // Submitting to the listing's own base path keeps a brand-scoped listing
      // on its brand page. An empty action would post to the current URL, which
      // also works, but naming it makes the destination explicit.
      action={catalogueBasePath(params)}
      className="border-line-200 border-t py-5"
    >
      {hidden.map((input) => (
        <input key={input.name} type="hidden" name={input.name} value={input.value} />
      ))}
      <fieldset>
        <legend className="text-foreground mb-3 text-sm font-semibold">{title}</legend>
        {hint ? <p className="text-ink-500 mb-3 text-xs">{hint}</p> : null}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor={`${id}-min`} className="text-ink-500 mb-1 block text-xs">
              Min{unit ? ` (${unit})` : ''}
            </label>
            <input
              id={`${id}-min`}
              name={fieldMin}
              type="number"
              inputMode="numeric"
              defaultValue={toDisplay(currentMin)}
              placeholder={range.min === null ? '—' : String(range.min)}
              className="border-line-300 bg-surface-0 h-10 w-full rounded-sm border px-2 text-sm tabular-nums"
            />
          </div>
          <div className="flex-1">
            <label htmlFor={`${id}-max`} className="text-ink-500 mb-1 block text-xs">
              Max{unit ? ` (${unit})` : ''}
            </label>
            <input
              id={`${id}-max`}
              name={fieldMax}
              type="number"
              inputMode="numeric"
              defaultValue={toDisplay(currentMax)}
              placeholder={range.max === null ? '—' : String(range.max)}
              className="border-line-300 bg-surface-0 h-10 w-full rounded-sm border px-2 text-sm tabular-nums"
            />
          </div>
          <button
            type="submit"
            className="border-line-300 bg-surface-0 hover:border-ink-900 h-10 shrink-0 rounded-sm border px-3 text-sm font-medium"
          >
            Apply
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/**
 * One selectable row in a filter list.
 *
 * Shared by every link-based filter so the checkbox mark, the hit target, the
 * pressed state and the count can only be defined once. `aria-pressed` is used
 * rather than a real checkbox because activating the row navigates: a checkbox
 * would tell assistive technology that the value is a form control whose state
 * changes in place, which is not what happens.
 */
function FilterRow({
  href,
  label,
  count,
  selected,
  disabled = false,
  shape = 'square',
}: {
  href: string;
  label: string;
  count: number;
  selected: boolean;
  disabled?: boolean;
  /** `circle` marks a single-choice group; `square` a multi-choice one. */
  shape?: 'square' | 'circle';
}) {
  return (
    <Link
      href={href}
      aria-pressed={selected}
      scroll={false}
      className={cn(
        'group flex items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-sm',
        'focus-visible:outline-gold-700 focus-visible:outline-2 focus-visible:outline-offset-1',
        selected
          ? 'bg-surface-100 text-foreground font-medium'
          : 'text-foreground-muted hover:bg-surface-50 hover:text-foreground',
        // A value that would yield nothing stays visible but is not clickable,
        // so the list does not jump around as filters change.
        disabled && 'text-ink-500 pointer-events-none opacity-60',
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            'border-line-300 flex h-4 w-4 shrink-0 items-center justify-center border',
            shape === 'circle' ? 'rounded-full' : 'rounded-xs',
            selected &&
              (shape === 'circle'
                ? 'border-ink-900 border-[5px]'
                : 'border-ink-900 bg-ink-900 text-surface-0'),
          )}
        >
          {selected && shape === 'square' ? (
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
              <path
                d="M2.5 6.2 4.7 8.4 9.5 3.6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="text-ink-500 shrink-0 text-xs tabular-nums">{count}</span>
    </Link>
  );
}

/**
 * A single-choice group, for filters whose options are mutually exclusive.
 *
 * Availability is the example: a watch is either available or reserved, never
 * both, so offering both as checkboxes would let a visitor select an impossible
 * pair and get an empty grid with no explanation.
 */
function ChoiceFilter<T extends string>({
  title,
  params,
  options,
  current,
  onSelect,
  id,
}: {
  title: string;
  params: CatalogueParams;
  options: { value: T; label: string; count: number }[];
  current: T;
  /** The state change for a chosen value, or `null` to clear the filter. */
  onSelect: (value: T) => Record<string, unknown>;
  id: string;
}) {
  if (options.length === 0) return null;

  return (
    <fieldset className="border-line-200 border-t py-5">
      <legend className="text-foreground mb-3 text-sm font-semibold">{title}</legend>
      <ul id={id} className="flex flex-col gap-1">
        {options.map((option) => {
          const isSelected = option.value === current;
          return (
            <li key={option.value}>
              <FilterRow
                shape="circle"
                href={buildCatalogueHref(params, {
                  ...onSelect(option.value),
                  page: 1,
                })}
                label={option.label}
                count={option.count}
                selected={isSelected}
              />
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/** The availability filter: any, available, or reserved. */
function AvailabilityFilter({ params, facets }: { params: CatalogueParams; facets: FacetSet }) {
  const byValue = new Map(facets.availability.map((option) => [option.value, option.count]));

  return (
    <ChoiceFilter<AvailabilityMode>
      id="filter-availability"
      title="Availability"
      params={params}
      current={params.availability}
      options={(['any', 'available', 'reserved'] as const).map((mode) => ({
        value: mode,
        label: AVAILABILITY_LABELS[mode],
        // "Any availability" is the unfiltered state, so its count is the whole
        // filtered set. The other two come from the facet.
        count: mode === 'any' ? facets.total : (byValue.get(mode) ?? 0),
      }))}
      // Choosing the already-selected option clears the filter, which is what a
      // visitor expects from a radio group they can deselect.
      onSelect={(mode) => ({ availability: mode === params.availability ? 'any' : mode })}
    />
  );
}

/**
 * The box-and-papers filter.
 *
 * Tri-state, so a single `boxAndPapers` value cannot express "either". Each
 * option is therefore its own link with the value it sets, and the "either"
 * option clears the parameter.
 */
function BoxAndPapersFilter({ params, facets }: { params: CatalogueParams; facets: FacetSet }) {
  const byValue = new Map(facets.boxAndPapers.map((option) => [option.value, option.count]));

  return (
    <ChoiceFilter<'any' | 'true' | 'false'>
      id="filter-box"
      title="Box &amp; papers"
      params={params}
      current={params.boxAndPapers === null ? 'any' : params.boxAndPapers ? 'true' : 'false'}
      options={[
        { value: 'any', label: 'Either', count: facets.total },
        { value: 'true', label: 'Box & papers', count: byValue.get('true') ?? 0 },
        { value: 'false', label: 'No box & papers', count: byValue.get('false') ?? 0 },
      ]}
      onSelect={(value) => ({
        boxAndPapers: value === 'any' ? null : value === 'true',
      })}
    />
  );
}

/** The price-mode filter: any, priced, or price on request. */
function PriceModeFilter({ params, facets }: { params: CatalogueParams; facets: FacetSet }) {
  // Only offer the mode filter when the catalogue actually contains both kinds.
  // Showing "Price on request" on a catalogue where nothing is priced on
  // request would be a filter that can only ever empty the grid.
  if (facets.priceRange.pricedCount === 0) return null;

  const pricedCount = facets.priceRange.pricedCount;
  const onRequestCount = Math.max(facets.total - pricedCount, 0);

  return (
    <ChoiceFilter<PriceMode>
      id="filter-price-mode"
      title="Pricing"
      params={params}
      current={params.priceMode}
      options={[
        { value: 'any', label: PRICE_MODE_LABELS.any, count: facets.total },
        { value: 'priced', label: PRICE_MODE_LABELS.priced, count: pricedCount },
        { value: 'on_request', label: PRICE_MODE_LABELS.on_request, count: onRequestCount },
      ]}
      // Switching to "price on request" makes a numeric bound meaningless, so it
      // is cleared rather than silently applied to a null price.
      onSelect={(mode) =>
        mode === 'on_request'
          ? { priceMode: mode, priceMin: null, priceMax: null }
          : { priceMode: mode }
      }
    />
  );
}

/** The condition filter, labelled from the shared table. */
function ConditionFilter({ params, facets }: { params: CatalogueParams; facets: FacetSet }) {
  const options = facets.values.condition.map((option) => ({
    ...option,
    label: CONDITION_LABELS[option.value as keyof typeof CONDITION_LABELS] ?? option.label,
  }));

  return (
    <FacetGroup
      id="filter-condition"
      title="Condition"
      options={options}
      selected={params.facets.condition}
      params={params}
      facetKey="condition"
    />
  );
}

/**
 * The full filter panel.
 *
 * `variant` chooses between the always-visible desktop sidebar and the contents
 * of the mobile drawer. The markup is shared so the two cannot diverge.
 */
export function CatalogueFilters({
  params,
  facets,
  className,
}: {
  params: CatalogueParams;
  facets: FacetSet;
  className?: string;
}) {
  const active = hasActiveFilters(params);

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center justify-between gap-3 pb-4">
        <h2 className="font-display text-lg">Filter</h2>
        {active ? (
          <Link
            href={buildCatalogueHref(params, {
              facets: Object.fromEntries(
                Object.keys(params.facets).map((key) => [key, []]),
              ) as Partial<Record<FacetKey, string[]>>,
              query: '',
              priceMode: 'any',
              priceMin: null,
              priceMax: null,
              yearMin: null,
              yearMax: null,
              caseMin: null,
              caseMax: null,
              boxAndPapers: null,
              availability: 'any',
              page: 1,
            })}
            className="text-accent-text inline-flex items-center gap-1 text-xs font-medium hover:underline"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
            Clear all
          </Link>
        ) : null}
      </div>

      <FacetGroup
        id="filter-brand"
        title="Brand"
        options={facets.values.brand}
        selected={params.facets.brand}
        params={params}
        facetKey="brand"
      />

      <FacetGroup
        id="filter-collection"
        title="Collection"
        options={facets.values.collection}
        selected={params.facets.collection}
        params={params}
        facetKey="collection"
      />

      <FacetGroup
        id="filter-model"
        title="Model"
        options={facets.values.model}
        selected={params.facets.model}
        params={params}
        facetKey="model"
      />

      <ConditionFilter params={params} facets={facets} />

      <PriceModeFilter params={params} facets={facets} />

      <RangeFilter
        id="filter-price"
        title="Price"
        params={params}
        fieldMin="priceMin"
        fieldMax="priceMax"
        range={{
          min: facets.priceRange.min === null ? null : facets.priceRange.min / 100,
          max: facets.priceRange.max === null ? null : facets.priceRange.max / 100,
        }}
        exclude={['priceMin', 'priceMax', 'page']}
        hint="Prices are shown in the catalogue's own currency. Leave a box empty to ignore that bound."
      />

      <RangeFilter
        id="filter-year"
        title="Year"
        params={params}
        fieldMin="yearMin"
        fieldMax="yearMax"
        range={facets.yearRange}
        exclude={['yearMin', 'yearMax', 'page']}
      />

      <RangeFilter
        id="filter-case"
        title="Case size"
        params={params}
        fieldMin="caseMin"
        fieldMax="caseMax"
        range={facets.caseSizeRange}
        unit="mm"
        exclude={['caseMin', 'caseMax', 'page']}
      />

      <FacetGroup
        id="filter-material"
        title="Case material"
        options={facets.values.caseMaterial}
        selected={params.facets.caseMaterial}
        params={params}
        facetKey="caseMaterial"
      />

      <FacetGroup
        id="filter-dial"
        title="Dial colour"
        options={facets.values.dialColor}
        selected={params.facets.dialColor}
        params={params}
        facetKey="dialColor"
      />

      <FacetGroup
        id="filter-movement"
        title="Movement"
        options={facets.values.movement}
        selected={params.facets.movement}
        params={params}
        facetKey="movement"
      />

      <FacetGroup
        id="filter-bracelet"
        title="Bracelet / strap"
        options={facets.values.bracelet}
        selected={params.facets.bracelet}
        params={params}
        facetKey="bracelet"
      />

      <FacetGroup
        id="filter-gender"
        title="Gender"
        options={facets.values.gender}
        selected={params.facets.gender}
        params={params}
        facetKey="gender"
      />

      <BoxAndPapersFilter params={params} facets={facets} />

      <AvailabilityFilter params={params} facets={facets} />
    </div>
  );
}

/** The active-filter chips shown above the grid. */
export function ActiveFilterChips({
  params,
  facets,
}: {
  params: CatalogueParams;
  facets: FacetSet;
}) {
  const chips: { key: string; label: string; href: string }[] = [];

  if (params.query !== '') {
    chips.push({
      key: 'q',
      label: `Search: “${params.query}”`,
      href: buildCatalogueHref(params, { query: '', page: 1 }),
    });
  }

  for (const facet of FACET_GROUPS) {
    const selected = params.facets[facet.key];
    for (const value of selected) {
      const option = facets.values[facet.key].find((entry) => entry.value === value);
      chips.push({
        key: `${facet.key}:${value}`,
        label: `${facet.label}: ${option?.label ?? value}`,
        href: buildCatalogueHref(params, {
          facets: facetParams(
            facet.key,
            selected.filter((entry) => entry !== value),
          ),
          page: 1,
        }),
      });
    }
  }

  if (params.priceMode !== 'any') {
    chips.push({
      key: 'priceMode',
      label: PRICE_MODE_LABELS[params.priceMode],
      href: buildCatalogueHref(params, { priceMode: 'any', page: 1 }),
    });
  }

  if (params.priceMin !== null || params.priceMax !== null) {
    chips.push({
      key: 'price',
      label: `Price: ${formatBound(params.priceMin)} – ${formatBound(params.priceMax)}`,
      href: buildCatalogueHref(params, { priceMin: null, priceMax: null, page: 1 }),
    });
  }

  if (params.yearMin !== null || params.yearMax !== null) {
    chips.push({
      key: 'year',
      label: `Year: ${formatBound(params.yearMin)} – ${formatBound(params.yearMax)}`,
      href: buildCatalogueHref(params, { yearMin: null, yearMax: null, page: 1 }),
    });
  }

  if (params.caseMin !== null || params.caseMax !== null) {
    chips.push({
      key: 'case',
      label: `Case: ${formatBound(params.caseMin)} – ${formatBound(params.caseMax)} mm`,
      href: buildCatalogueHref(params, { caseMin: null, caseMax: null, page: 1 }),
    });
  }

  if (params.boxAndPapers !== null) {
    chips.push({
      key: 'boxAndPapers',
      label: params.boxAndPapers ? 'Box & papers' : 'No box & papers',
      href: buildCatalogueHref(params, { boxAndPapers: null, page: 1 }),
    });
  }

  if (params.availability !== 'any') {
    chips.push({
      key: 'availability',
      label: AVAILABILITY_LABELS[params.availability],
      href: buildCatalogueHref(params, { availability: 'any', page: 1 }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="sr-only">Active filters</h2>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          scroll={false}
          className="border-line-300 bg-surface-0 hover:border-ink-900 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
        >
          <span>{chip.label}</span>
          <X aria-hidden="true" className="h-3 w-3" />
          <span className="sr-only">Remove filter</span>
        </Link>
      ))}
    </div>
  );
}

/** The facet groups a chip can represent, with their display labels. */
const FACET_GROUPS: { key: FacetKey; label: string }[] = [
  { key: 'brand', label: 'Brand' },
  { key: 'collection', label: 'Collection' },
  { key: 'model', label: 'Model' },
  { key: 'condition', label: 'Condition' },
  { key: 'caseMaterial', label: 'Case material' },
  { key: 'dialColor', label: 'Dial colour' },
  { key: 'movement', label: 'Movement' },
  { key: 'bracelet', label: 'Bracelet' },
  { key: 'gender', label: 'Gender' },
];

function formatBound(value: number | null): string {
  return value === null ? 'Any' : String(value);
}

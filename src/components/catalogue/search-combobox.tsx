'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

type Suggestion = {
  kind: string;
  label: string;
  detail: string | null;
  href: string;
};

/** How a suggestion's kind is described to a screen reader. */
const KIND_LABELS: Record<string, string> = {
  brand: 'Brand',
  collection: 'Collection',
  model: 'Model',
  product: 'Watch',
};

/**
 * The search box with typeahead.
 *
 * -----------------------------------------------------------------------------
 * WHY IT IS A COMBOBOX AND NOT A LIST UNDER AN INPUT
 * -----------------------------------------------------------------------------
 *
 * The ARIA combobox pattern is the one a screen-reader user expects from a
 * search box with suggestions, and it is the only pattern that keeps focus in
 * the text field while the arrow keys move through the list. The alternative —
 * real links in a popup that take focus — makes the visitor lose their place in
 * the query every time they arrow down.
 *
 * So the input keeps focus, `aria-activedescendant` names the highlighted
 * option, and the list is a `listbox` of `option`s. Selecting one is a real
 * navigation, done with the router so it behaves like a link click.
 *
 * -----------------------------------------------------------------------------
 * PROGRESSIVE ENHANCEMENT
 * -----------------------------------------------------------------------------
 *
 * The form still submits normally. With JavaScript off, or before the first
 * suggestion arrives, this is a plain GET form and `Enter` searches. The
 * typeahead only ever adds an alternative way to reach a page that already
 * exists in the catalogue; it never blocks the search itself.
 *
 * A stale response is the classic bug here: type "sub", then "submariner", and
 * if the slower "sub" response lands last the list shows the wrong results. Each
 * request aborts the previous one, and a response is also discarded when its
 * query no longer matches the current text.
 */
export function SearchCombobox({ defaultQuery }: { defaultQuery: string }) {
  const router = useRouter();
  const listboxId = useId();
  const inputId = useId();
  const [query, setQuery] = useState(defaultQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();

    // Fewer than two characters is below the endpoint's own floor, and an empty
    // box should not suggest anything at all.
    if (trimmed.length < 2) {
      abortRef.current?.abort();
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`/api/catalogue/suggest?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        if (!response.ok) return;

        const data = (await response.json()) as { suggestions?: Suggestion[] };
        // Discard a response whose query is no longer what the visitor typed.
        if (controller.signal.aborted) return;

        const next = data.suggestions ?? [];
        setSuggestions(next);
        setOpen(next.length > 0);
        setActiveIndex(-1);
      } catch {
        // An aborted request is the normal case when typing continues, and a
        // failed one should leave the form usable rather than show an error.
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Close on a click outside, so the list does not linger over the results.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function go(href: string) {
    setOpen(false);
    setActiveIndex(-1);
    router.push(href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      // Only intercept Enter when an option is highlighted; otherwise the form
      // submits and searches, which is what the visitor expects.
      const chosen = suggestions[activeIndex];
      if (chosen) {
        event.preventDefault();
        go(chosen.href);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const active = activeIndex >= 0 ? suggestions[activeIndex] : null;

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <label htmlFor={inputId} className="sr-only">
        Search the catalogue
      </label>
      <input
        id={inputId}
        type="search"
        name="q"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder="Reference number, brand, model…"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={active ? `${listboxId}-${activeIndex}` : undefined}
        className="border-line-300 bg-surface-0 focus-visible:border-ink-900 h-11 w-full min-w-0 rounded-sm border px-3 text-sm"
      />

      {/* The list is rendered only when open, and marked as a popup so it is
          announced as part of the combobox rather than as new page content. */}
      <ul
        id={listboxId}
        role="listbox"
        aria-label="Search suggestions"
        hidden={!open}
        className="border-line-200 bg-surface-0 absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-auto rounded-sm border py-1 shadow-lg"
      >
        {suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion.kind}-${suggestion.href}`}
            id={`${listboxId}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            // `onMouseDown` rather than `onClick`: the input's blur would close
            // the list before a click lands.
            onMouseDown={(event) => {
              event.preventDefault();
              go(suggestion.href);
            }}
            onMouseEnter={() => setActiveIndex(index)}
            className={cn(
              'flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm',
              index === activeIndex ? 'bg-surface-100' : '',
            )}
          >
            <span className="min-w-0">
              <span className="text-ink-500 mr-2 text-xs tracking-wide uppercase">
                {KIND_LABELS[suggestion.kind] ?? suggestion.kind}
              </span>
              <span className="text-foreground">{suggestion.label}</span>
            </span>
            {suggestion.detail ? (
              <span className="text-foreground-muted shrink-0 text-xs">{suggestion.detail}</span>
            ) : null}
          </li>
        ))}
      </ul>

      {/* An empty list is announced, so a visitor knows the box did something
          rather than silently finding nothing. */}
      <p aria-live="polite" className="sr-only">
        {open
          ? `${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'} available. Use the arrow keys to browse.`
          : ''}
      </p>
    </div>
  );
}

/** The search button, kept next to the box so the two cannot drift apart. */
export function SearchSubmitButton() {
  return (
    <button
      type="submit"
      className="bg-gold-700 text-surface-0 hover:bg-ink-900 inline-flex h-11 items-center gap-2 rounded-sm px-5 text-sm font-medium"
    >
      <Search aria-hidden="true" className="h-4 w-4" />
      Search
    </button>
  );
}

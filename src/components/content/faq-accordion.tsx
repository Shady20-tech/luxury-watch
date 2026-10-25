'use client';

import { ChevronDown } from 'lucide-react';
import { useId } from 'react';

import type { Faq } from '@/server/repositories/content-repository';

/**
 * The FAQ accordion.
 *
 * -----------------------------------------------------------------------------
 * WHY `<details>` RATHER THAN A BUTTON AND A DIV
 * -----------------------------------------------------------------------------
 *
 * `<details>`/`<summary>` is a disclosure widget the browser already implements:
 * it is keyboard-operable, announced as expandable, and works with JavaScript
 * disabled. Reimplementing it with `aria-expanded` on a button is more code and
 * more ways to get the announcement wrong.
 *
 * The marker is hidden and a chevron drawn instead, so the control matches the
 * design without removing the element that provides the semantics.
 *
 * -----------------------------------------------------------------------------
 * THE ANSWER IS ALWAYS IN THE DOM
 * -----------------------------------------------------------------------------
 *
 * The answer text is present whether or not the row is open, so a page search
 * finds it and a screen reader can read the whole answer once expanded. Nothing
 * here is fetched on open.
 */
export function FaqAccordion({ faqs }: { faqs: Faq[] }) {
  const baseId = useId();

  if (faqs.length === 0) return null;

  return (
    <div className="divide-line-200 border-line-200 divide-y rounded-sm border">
      {faqs.map((faq, index) => (
        <details key={faq.id} className="group">
          <summary
            id={`${baseId}-summary-${index}`}
            className="focus-visible:outline-gold-700 flex cursor-pointer list-none items-center justify-between gap-4 p-4 text-left text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden"
          >
            <span>{faq.question}</span>
            <ChevronDown
              aria-hidden="true"
              className="text-ink-500 h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
            />
          </summary>
          <div
            aria-labelledby={`${baseId}-summary-${index}`}
            className="text-foreground-muted px-4 pb-4 text-sm whitespace-pre-line"
          >
            {faq.answer}
          </div>
        </details>
      ))}
    </div>
  );
}

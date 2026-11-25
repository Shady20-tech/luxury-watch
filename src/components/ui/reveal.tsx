'use client';

import { useEffect } from 'react';

/**
 * Reveals `[data-reveal]` elements as they scroll into view.
 *
 * -----------------------------------------------------------------------------
 * WHY A SINGLE OBSERVER ON `document`, NOT A WRAPPER COMPONENT
 * -----------------------------------------------------------------------------
 *
 * The obvious shape is `<Reveal>{children}</Reveal>`, and it is the wrong one
 * here. A wrapper is a client component, so every section that used it would
 * pull its children into the client bundle — including the server-rendered
 * product rails and CMS copy that exist precisely to avoid that. It also adds a
 * DOM node around every revealed element, which breaks grid and flex layouts
 * that expect their children to be the cards themselves.
 *
 * Instead this mounts once in the root layout and watches for an attribute. Any
 * Server Component can opt an element in with `data-reveal`, and nothing about
 * that element becomes client-side.
 *
 * -----------------------------------------------------------------------------
 * WHY IT MUST NOT HIDE CONTENT WHEN IT FAILS
 * -----------------------------------------------------------------------------
 *
 * The CSS gives `[data-reveal]` `opacity: 0`. That is safe only because this
 * script is guaranteed to run and to add `.is-revealed`; if it did not, the
 * content would be permanently invisible. So the failure paths are explicit:
 *
 *   - No `IntersectionObserver` → reveal everything immediately and stop.
 *   - Reduced motion → reveal everything immediately and stop. The CSS already
 *     neutralises the transition, and skipping the observer avoids doing work
 *     for an effect the visitor asked not to see.
 *   - An element already in the viewport at mount → revealed on the first
 *     observer callback, which fires synchronously-ish after `observe()`.
 *
 * A `MutationObserver` picks up elements added later (a "load more" appending
 * cards, a filter re-rendering the grid) so they are revealed too rather than
 * sitting invisible below the fold.
 */
export function RevealOnScroll() {
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const REVEAL_SELECTOR = '[data-reveal]';
    const PENDING_SELECTOR = `${REVEAL_SELECTOR}:not(.is-revealed)`;

    const revealAll = () => {
      for (const el of document.querySelectorAll(REVEAL_SELECTOR)) {
        el.classList.add('is-revealed');
      }
    };

    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      revealAll();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-revealed');
          // One-shot: an element that has appeared must not fade out again when
          // it leaves the viewport. Re-animating on every pass is the effect
          // that makes a long page feel seasick.
          observer.unobserve(entry.target);
        }
      },
      // A negative bottom margin means the reveal fires once the element is a
      // little way into the viewport rather than the instant its first pixel
      // appears, which is what makes it feel deliberate instead of twitchy.
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    const observeWithin = (root: ParentNode) => {
      for (const el of root.querySelectorAll(PENDING_SELECTOR)) {
        observer.observe(el);
      }
    };

    observeWithin(document);

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as Element;
          if (el.matches(PENDING_SELECTOR)) observer.observe(el);
          observeWithin(el);
        }
      }
    });

    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return null;
}

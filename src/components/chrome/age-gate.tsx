'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { AgeGate } from '@/lib/navigation/types';

/**
 * Age gate.
 *
 * A modal that blocks the storefront until the visitor confirms they meet the
 * minimum age. It is a legal affordance for alcohol-adjacent or age-restricted
 * retail, not a security control: it is trivially bypassable by anyone who
 * clears storage, and it is written that way deliberately rather than pretending
 * otherwise. It must never be used to gate anything that matters.
 *
 * Radix Dialog is used rather than a hand-rolled overlay because the failure
 * modes of a modal are well known and easy to get wrong: focus must move in and
 * be trapped, background content must be inert to assistive technology, and the
 * page scroll must lock. Radix handles all three.
 *
 * Three details are deliberate:
 *
 *  - **It cannot be dismissed by accident.** Escape and outside-click are
 *    suppressed, and there is no close button, because a gate that can be
 *    dismissed without an answer is not a gate.
 *  - **It does not flash.** The decision is read from storage in an effect, and
 *    nothing renders until that read completes, so a returning visitor never
 *    sees the gate for a frame.
 *  - **It renders on the server as absent, then appears.** Because the answer
 *    lives in `localStorage`, the server cannot know it. Rendering the gate in
 *    the initial HTML would show it to every returning visitor; rendering
 *    nothing is the honest default, and the gate appears only once a visitor is
 *    known to have not answered. This is a deliberate trade-off: no gate flash,
 *    at the cost of the gate not being in the first paint.
 */

const STORAGE_KEY = 'lw:age-verified';

export function AgeGateDialog({ ageGate }: { ageGate: AgeGate }) {
  // `null` means "not yet known" — neither verified nor unverified. Nothing is
  // rendered in that state, which is what prevents the flash described above.
  const [decision, setDecision] = useState<'unknown' | 'unanswered' | 'confirmed' | 'declined'>(
    'unknown',
  );
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    if (!ageGate.enabled) return;

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'yes') setDecision('confirmed');
      else if (stored === 'no') setDecision('declined');
      else setDecision('unanswered');
    } catch {
      // Storage can throw when cookies are blocked or in a partitioned context.
      // Falling back to showing the gate is the safe direction: the visitor is
      // asked rather than silently waved through.
      setDecision('unanswered');
    }
  }, [ageGate.enabled]);

  if (!ageGate.enabled || decision === 'unknown' || decision === 'confirmed') {
    return null;
  }

  const accept = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'yes');
    } catch {
      // If storage is unavailable the choice lasts for this page view only.
    }
    setDecision('confirmed');
  };

  const decline = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'no');
    } catch {
      // See above.
    }
    setDecision('declined');
  };

  return (
    <DialogPrimitive.Root open>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="bg-scrim fixed inset-0 z-[100] backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          // There is no close control, so there is no need for a close label.
          aria-describedby={undefined}
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="glass-panel-strong border-line-200 fixed top-1/2 left-1/2 z-[100] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-sm border p-6 shadow-lg sm:p-8"
        >
          <DialogPrimitive.Title className="font-display text-ink-950 text-2xl">
            {decision === 'declined' ? 'Sorry, we cannot let you in' : 'Are you of legal age?'}
          </DialogPrimitive.Title>

          {decision === 'declined' ? (
            <>
              <p className="text-foreground-muted mt-4 text-sm">
                This storefront is intended for people aged {ageGate.minimumAge} and over. You have
                told us you are below that age, so we cannot show you the catalogue.
              </p>
              <p className="text-foreground-muted mt-3 text-sm">
                If you answered by mistake, you can change your answer.
              </p>
              <div className="mt-6">
                <Button variant="secondary" onClick={() => setDecision('unanswered')}>
                  Change my answer
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-foreground-muted mt-4 text-sm">
                You must be at least {ageGate.minimumAge} years old to browse this storefront.
                Please confirm your age to continue.
              </p>
              {/* `aria-live` so a screen-reader user hears the result of the
                  answer without the dialog having to re-announce itself. */}
              <p aria-live="polite" className="sr-only">
                {answered ? 'Answer recorded.' : ''}
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  className="sm:flex-1"
                  onClick={() => {
                    setAnswered(true);
                    accept();
                  }}
                >
                  Yes, I am {ageGate.minimumAge} or over
                </Button>
                <Button
                  variant="secondary"
                  className="sm:flex-1"
                  onClick={() => {
                    setAnswered(true);
                    decline();
                  }}
                >
                  No, I am under {ageGate.minimumAge}
                </Button>
              </div>
              <p className="text-ink-500 mt-5 text-xs">
                Your answer is stored only in this browser. We do not record your date of birth.
              </p>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

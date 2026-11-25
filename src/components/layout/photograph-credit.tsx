import type { SitePhotograph } from '@/lib/images/site-photography';
import { cn } from '@/lib/utils';

/**
 * The attribution line for editorial photographs.
 *
 * CC BY and CC BY-SA oblige the author to be named wherever the work is shown,
 * and BY-SA also obliges the licence to be named. Every surface that renders one
 * of these plates therefore renders this line beside it — the homepage bands had
 * been showing eight licensed photographs with nobody credited.
 *
 * It takes a list because a grid of plates is one statement. Nine tiles each
 * with their own "Photograph: …" line is nine interruptions in a masthead row;
 * one line naming every author and licence is the same promise, made once, in
 * the place a visitor looks for small print. A single-photo band passes a
 * one-element array and reads exactly as it did.
 *
 * Two presentation rules:
 *
 *  - It is plain text, never a link. A photograph is decoration on these bands,
 *    so a link would add a tab stop that leads somewhere other than the content
 *    the visitor came for. The source URL stays in the registry for provenance.
 *  - It sits on a solid surface, never directly on a photograph. Contrast over
 *    an arbitrary image cannot be asserted, and the browser audit can only
 *    measure the pixels in front of it.
 */
export function PhotographCredit({
  photographs,
  tone = 'light',
  className,
}: {
  photographs: SitePhotograph[];
  tone?: 'light' | 'night';
  className?: string;
}) {
  const unique = [...new Map(photographs.map((p) => [p.credit, p])).values()];
  if (unique.length === 0) return null;

  const toneClass = {
    light: 'text-ink-500',
    night: 'text-on-night-muted',
  }[tone];

  return (
    <p className={cn('text-[0.75rem] leading-relaxed', toneClass, className)}>
      {unique.length === 1 ? 'Photograph: ' : 'Photographs: '}
      {unique.map((photograph, index) => (
        <span key={photograph.credit}>
          {index > 0 ? '; ' : ''}
          {photograph.credit} ({photograph.licence})
        </span>
      ))}
    </p>
  );
}

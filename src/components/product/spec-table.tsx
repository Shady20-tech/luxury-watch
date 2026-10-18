import { cn } from '@/lib/utils';
import type { SpecRow } from '@/lib/product/types';

/**
 * Specification table.
 *
 * A `<dl>` rather than a `<table>`, because this is a list of label/value pairs
 * for one object, not a grid of data with two axes. Screen readers announce a
 * description list as pairs, which is what this is; a two-column table would
 * announce row and column counts that mean nothing here.
 *
 * Rows with no value were already dropped during assembly, so the table never
 * renders a dash. A dash would read as "we checked and it is unknown"; omitting
 * the row says only that the catalogue does not record it.
 */
export function SpecTable({ specs, className }: { specs: SpecRow[]; className?: string }) {
  if (specs.length === 0) {
    return (
      <p className={cn('text-foreground-muted text-sm', className)}>
        No specification has been recorded for this piece yet. Ask us and we will confirm the
        details.
      </p>
    );
  }

  return (
    <dl className={cn('divide-line-200 border-line-200 divide-y border-t', className)}>
      {specs.map((spec, index) => (
        <div
          // A label could in principle repeat if two source columns normalise
          // differently but read the same; the index keeps the key stable.
          key={`${spec.label}-${index}`}
          className="grid grid-cols-[minmax(9rem,14rem)_1fr] gap-4 py-3"
        >
          <dt className="text-foreground-muted text-sm font-medium">{spec.label}</dt>
          <dd className="text-sm">{spec.value}</dd>
        </div>
      ))}
    </dl>
  );
}

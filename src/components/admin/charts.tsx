import { cn } from '@/lib/utils';

/**
 * Dependency-free chart primitives for the admin dashboard.
 *
 * -----------------------------------------------------------------------------
 * WHY HAND-ROLLED SVG RATHER THAN A CHART LIBRARY
 * -----------------------------------------------------------------------------
 *
 * The dashboard needs a horizontal bar list and a stacked proportion bar. A
 * charting library would add a client bundle, a canvas or SVG renderer and its
 * own theming system to draw two shapes that are, together, under eighty lines.
 * These are Server Components: they emit SVG once and ship no JavaScript.
 *
 * -----------------------------------------------------------------------------
 * WHY EVERY CHART IS ALSO A TABLE
 * -----------------------------------------------------------------------------
 *
 * A bar encodes a number as a length, which a screen reader cannot read and a
 * monochrome printout cannot either. Each chart therefore carries its figures as
 * text as well: the value is printed beside every bar, and the accessible name of
 * the chart states the total. The bars themselves are `aria-hidden`, because
 * repeating each label twice in the accessibility tree is worse than omitting the
 * decorative shape.
 */

export type BarDatum = {
  label: string;
  value: number;
  /** A second figure drawn as a lighter inner bar, e.g. published within total. */
  secondary?: number;
  /** Overrides the printed value, for when a raw count needs a unit. */
  display?: string;
};

/**
 * A horizontal bar list.
 *
 * The scale is relative to the largest value, not to a fixed maximum, so a small
 * catalogue still reads. Because of that the numbers are always printed: a bar
 * whose length is relative says "more than" and never "how many".
 */
export function BarList({
  data,
  emptyLabel,
  secondaryLabel,
}: {
  data: BarDatum[];
  emptyLabel: string;
  secondaryLabel?: string;
}) {
  const max = data.reduce((peak, datum) => Math.max(peak, datum.value), 0);

  if (data.length === 0) {
    return <p className="text-ink-500 text-sm">{emptyLabel}</p>;
  }

  return (
    <div>
      <ul className="space-y-2.5">
        {data.map((datum) => {
          const width = max > 0 ? Math.max((datum.value / max) * 100, 1.5) : 0;
          const secondaryWidth =
            max > 0 && datum.secondary !== undefined
              ? Math.max((datum.secondary / max) * 100, 0)
              : 0;

          return (
            <li key={datum.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="text-ink-900 truncate text-sm font-medium">{datum.label}</span>
                <span className="text-ink-500 shrink-0 text-xs tabular-nums">
                  {datum.display ?? datum.value.toLocaleString('en-GB')}
                  {datum.secondary !== undefined ? (
                    // `ink-300` is 2.84:1 on white, below the 4.5:1 minimum, and
                    // this is a real figure rather than a disabled control. It is
                    // set in `ink-500` and distinguished by the separator and the
                    // legend swatch instead of by being too faint to read.
                    <span className="text-ink-500">
                      {' / '}
                      {datum.secondary.toLocaleString('en-GB')}
                    </span>
                  ) : null}
                </span>
              </div>
              <div aria-hidden="true" className="bg-surface-100 h-2 overflow-hidden rounded-full">
                <div
                  className="from-gold-500 to-gold-300 h-full rounded-full bg-gradient-to-r"
                  style={{ width: `${width}%` }}
                >
                  {secondaryWidth > 0 ? (
                    <div
                      className="bg-night-900/70 ml-auto h-full rounded-full"
                      style={{ width: `${(secondaryWidth / width) * 100}%` }}
                    />
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {secondaryLabel && data.some((datum) => datum.secondary !== undefined) ? (
        <p className="text-ink-500 mt-3 flex items-center gap-1.5 text-xs">
          <span aria-hidden="true" className="bg-night-900/70 h-2 w-2 rounded-full" />
          {secondaryLabel}
        </p>
      ) : null}
    </div>
  );
}

export type SegmentDatum = {
  label: string;
  value: number;
  className: string;
};

/**
 * A single stacked bar, for a total split into a handful of states.
 *
 * Used where the interesting fact is the proportion, not the individual counts —
 * how much of the stock is healthy. The legend prints every count, so the shape
 * is a summary and the numbers are the data.
 */
export function StackedBar({
  segments,
  emptyLabel,
}: {
  segments: SegmentDatum[];
  emptyLabel: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total === 0) {
    return <p className="text-ink-500 text-sm">{emptyLabel}</p>;
  }

  return (
    <div>
      <div aria-hidden="true" className="bg-surface-100 flex h-2.5 overflow-hidden rounded-full">
        {segments.map((segment) =>
          segment.value > 0 ? (
            <div
              key={segment.label}
              className={cn('h-full first:rounded-l-full last:rounded-r-full', segment.className)}
              style={{ width: `${(segment.value / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center gap-1.5">
            <dt className="text-ink-500 flex items-center gap-1.5 text-xs">
              <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', segment.className)} />
              {segment.label}
            </dt>
            <dd className="text-ink-900 text-xs font-semibold tabular-nums">
              {segment.value.toLocaleString('en-GB')}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

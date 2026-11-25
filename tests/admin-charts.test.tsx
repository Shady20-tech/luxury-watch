// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BarList, StackedBar } from '@/components/admin/charts';

/**
 * Chart component tests.
 *
 * The thing worth testing about a chart is not its pixels — it is that the data
 * survives as text. A bar encodes a value as a length, which a screen reader
 * cannot read and a monochrome printout cannot either, so every figure has to be
 * present in the DOM as a number as well as a width.
 *
 * These tests therefore assert the numbers and the widths, not the colours. The
 * widths matter because a bar chart whose every bar is 100% is a chart that has
 * silently lost its scale, which is a real failure mode when the maximum is
 * computed from an empty list.
 */

afterEach(cleanup);

describe('BarList', () => {
  const data = [
    { label: 'Rolex', value: 100, secondary: 6 },
    { label: 'Omega', value: 25, secondary: 25 },
  ];

  it('prints every value, so the figure is readable without the bar', () => {
    render(<BarList data={data} emptyLabel="Nothing here" secondaryLabel="Published" />);

    expect(screen.getByText('Rolex')).toBeDefined();
    expect(screen.getByText('100')).toBeDefined();
    expect(screen.getByText('25', { selector: 'span' })).toBeDefined();
    expect(screen.getByText('Published')).toBeDefined();
  });

  it('scales the widest bar to the full track and the others in proportion', () => {
    const { container } = render(
      <BarList data={data} emptyLabel="Nothing here" secondaryLabel="Published" />,
    );

    // Each row draws two widths: the outer bar against the chart maximum, and the
    // inner bar against its own outer bar. Rolex is 100 of 100 with 6 published;
    // Omega is 25 of 100 and fully published.
    const widths = [...container.querySelectorAll('div[style]')].map(
      (node) => (node as HTMLElement).style.width,
    );

    expect(widths).toEqual(['100%', '6%', '25%', '100%']);
  });

  it('reports the empty state rather than drawing a zero-width chart', () => {
    render(<BarList data={[]} emptyLabel="No products are attached to a brand yet." />);

    expect(screen.getByText('No products are attached to a brand yet.')).toBeDefined();
  });

  it('hides the bars from the accessibility tree, because the numbers are already text', () => {
    const { container } = render(
      <BarList data={data} emptyLabel="Nothing here" secondaryLabel="Published" />,
    );

    const bars = container.querySelectorAll('[aria-hidden="true"]');
    expect(bars.length).toBeGreaterThan(0);
  });

  it('keeps a non-zero bar visible even when it rounds to nothing against the maximum', () => {
    // One published piece against a 2,497-row brand is a real value that would
    // render as an invisible sliver at its true proportion. The minimum width is
    // what keeps "1" from looking like "0".
    const { container } = render(
      <BarList
        data={[
          { label: 'Rolex', value: 2497 },
          { label: 'Breitling', value: 1 },
        ]}
        emptyLabel="Nothing here"
      />,
    );

    const widths = [...container.querySelectorAll('div[style]')].map(
      (node) => (node as HTMLElement).style.width,
    );

    expect(widths[0]).toBe('100%');
    expect(parseFloat(widths[1]!)).toBeGreaterThanOrEqual(1.5);
  });
});

describe('StackedBar', () => {
  const segments = [
    { label: 'Healthy', value: 3, className: 'bg-gold-500' },
    { label: 'Low', value: 1, className: 'bg-gold-300' },
    { label: 'Out of stock', value: 0, className: 'bg-ink-300' },
  ];

  it('prints a count for every state, including the empty one', () => {
    render(<StackedBar segments={segments} emptyLabel="No stock recorded" />);

    expect(screen.getByText('Healthy')).toBeDefined();
    expect(screen.getByText('Low')).toBeDefined();
    // The empty bucket is still named: "out of stock: 0" is an answer, and a
    // missing row would read as "not measured".
    expect(screen.getByText('Out of stock')).toBeDefined();
    expect(screen.getByText('0')).toBeDefined();
  });

  it('proportions each segment against the total', () => {
    const { container } = render(<StackedBar segments={segments} emptyLabel="No stock recorded" />);

    const widths = [...container.querySelectorAll('div[style]')].map(
      (node) => (node as HTMLElement).style.width,
    );

    expect(widths).toEqual(['75%', '25%']);
  });

  it('does not draw a segment with no members', () => {
    const { container } = render(<StackedBar segments={segments} emptyLabel="No stock recorded" />);

    // Three states, but only two have a non-zero count, so only two bars.
    const bars = container.querySelectorAll('.h-full');
    expect(bars.length).toBe(2);
  });

  it('reports the empty state when the total is zero', () => {
    render(
      <StackedBar
        segments={segments.map((segment) => ({ ...segment, value: 0 }))}
        emptyLabel="No stock has been recorded yet."
      />,
    );

    expect(screen.getByText('No stock has been recorded yet.')).toBeDefined();
  });
});

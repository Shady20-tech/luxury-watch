// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HeroCarousel } from '@/components/homepage/hero-carousel';
import { ProductCard } from '@/components/homepage/product-card';
import type { HeroSlide, ProductCard as ProductCardModel } from '@/lib/homepage/types';

/**
 * Homepage component tests.
 *
 * The carousel is the highest-risk component in this phase: it is interactive,
 * it moves, and it is the first thing on the page. These tests cover the
 * behaviour a screenshot cannot show — that the first slide is present before
 * hydration, that the controls are operable and correctly labelled, that the end
 * of the list is a real stop rather than a wrap, and that reduced motion
 * disables autoplay.
 *
 * jsdom does not lay out the document, so axe skips the geometry-dependent rules
 * (colour contrast, target size). Those are covered by the design-token contrast
 * assertions and by the browser audit; this suite covers the structural half,
 * which is where most ARIA mistakes live.
 *
 * The project does not install the jest-dom matchers, so assertions use the
 * built-in ones (`toBeNull`, `toBeDefined`, `toEqual`) to match the rest of the
 * suite.
 */

afterEach(cleanup);

const slides: HeroSlide[] = [
  {
    id: 's1',
    eyebrow: 'First eyebrow',
    title: 'First slide',
    body: 'First body',
    cta: { label: 'First action', href: '/first' },
    imageUrl: null,
    imageAlt: '',
  },
  {
    id: 's2',
    eyebrow: 'Second eyebrow',
    title: 'Second slide',
    body: 'Second body',
    cta: null,
    imageUrl: null,
    imageAlt: '',
  },
  {
    id: 's3',
    eyebrow: null,
    title: 'Third slide',
    body: null,
    cta: null,
    imageUrl: null,
    imageAlt: '',
  },
];

const card: ProductCardModel = {
  id: 'p1',
  slug: 'a-watch',
  href: '/products/a-watch',
  title: 'A watch',
  brandName: 'Rolex',
  summary: 'Ref. 116400 · 40 mm',
  imageUrl: null,
  imageAlt: 'A watch',
  dialColor: null,
  caseMaterial: null,
  price: null,
  condition: 'new',
  available: true,
  isNew: false,
};

/** Run axe and return only the critical and serious findings, as `{id, nodes}`. */
async function severeViolations() {
  const results = await axe.run(document.body);
  return results.violations
    .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    .map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
    }));
}

/** A `matchMedia` that reports the given reduced-motion preference. */
function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })),
  );
}

describe('HeroCarousel', () => {
  it('renders nothing when there are no slides', () => {
    const { container } = render(<HeroCarousel slides={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the first slide immediately, with the page h1', () => {
    render(<HeroCarousel slides={slides} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('First slide');
    expect(screen.getByText('First body')).toBeDefined();
  });

  it('uses an h1 on the first slide only, so the page never has two', () => {
    render(<HeroCarousel slides={slides} />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('names the carousel region with the visible slide', () => {
    render(<HeroCarousel slides={slides} />);
    const region = screen.getByRole('region');
    expect(region.getAttribute('aria-roledescription')).toBe('carousel');

    const labelledBy = region.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)?.textContent).toContain('First slide');
  });

  it('advances with the next control and announces the new position', async () => {
    const user = userEvent.setup();
    render(<HeroCarousel slides={slides} />);

    await user.click(screen.getByRole('button', { name: 'Next slide' }));

    expect(screen.getByText('Second slide')).toBeDefined();
    expect(screen.getByText('Slide 2 of 3')).toBeDefined();
  });

  it('disables previous on the first slide and next on the last', async () => {
    const user = userEvent.setup();
    render(<HeroCarousel slides={slides} />);

    expect(screen.getByRole('button', { name: 'Previous slide' }).hasAttribute('disabled')).toBe(
      true,
    );

    await user.click(screen.getByRole('button', { name: 'Next slide' }));
    await user.click(screen.getByRole('button', { name: 'Next slide' }));

    // The end is a real stop: the next control does not wrap around.
    expect(screen.getByRole('button', { name: 'Next slide' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Third slide')).toBeDefined();
  });

  it('moves between slides with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<HeroCarousel slides={slides} />);

    await user.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(screen.getByText('Second slide')).toBeDefined();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('First slide')).toBeDefined();
  });

  it('offers one labelled control per slide', () => {
    render(<HeroCarousel slides={slides} />);
    expect(screen.getByRole('button', { name: 'Slide 1 of 3: First slide' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Slide 3 of 3: Third slide' })).toBeDefined();
  });

  it('marks the current slide control as current', async () => {
    const user = userEvent.setup();
    render(<HeroCarousel slides={slides} />);

    expect(
      screen
        .getByRole('button', { name: 'Slide 1 of 3: First slide' })
        .getAttribute('aria-current'),
    ).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Slide 2 of 3: Second slide' }));
    expect(
      screen
        .getByRole('button', { name: 'Slide 2 of 3: Second slide' })
        .getAttribute('aria-current'),
    ).toBe('true');
  });

  it('hides the controls entirely when there is one slide', () => {
    render(<HeroCarousel slides={[slides[0]!]} />);
    expect(screen.queryByRole('button', { name: 'Next slide' })).toBeNull();
  });

  it('renders no pause control when autoplay is off', () => {
    render(<HeroCarousel slides={slides} />);
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  it('renders a pause control when autoplay is on, as WCAG 2.2.2 requires', () => {
    render(<HeroCarousel slides={slides} autoPlaySeconds={3} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDefined();
  });

  it('does not autoplay when the visitor prefers reduced motion', async () => {
    stubReducedMotion(true);
    render(<HeroCarousel slides={slides} autoPlaySeconds={1} />);

    // With reduced motion the pause control is not rendered, which is the
    // visible consequence of autoplay being inactive.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    });

    vi.unstubAllGlobals();
  });

  it('advances automatically when autoplay is enabled', async () => {
    vi.useFakeTimers();
    stubReducedMotion(false);

    render(<HeroCarousel slides={slides} autoPlaySeconds={2} />);
    expect(screen.getByText('First slide')).toBeDefined();

    await vi.advanceTimersByTimeAsync(2100);
    expect(screen.getByText('Second slide')).toBeDefined();

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pauses autoplay when the visitor presses pause', async () => {
    vi.useFakeTimers();
    stubReducedMotion(false);

    render(<HeroCarousel slides={slides} autoPlaySeconds={2} />);

    await vi.advanceTimersByTimeAsync(2100);
    expect(screen.getByText('Second slide')).toBeDefined();

    // Pressing pause flips the control to "Play" and stops the timer.
    screen.getByRole('button', { name: 'Pause' }).click();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(5000);
    expect(screen.getByText('Second slide')).toBeDefined();

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('has no critical or serious axe violations', async () => {
    render(<HeroCarousel slides={slides} autoPlaySeconds={5} />);
    expect(await severeViolations()).toEqual([]);
  });
});

describe('ProductCard', () => {
  it('asks for pricing rather than showing a number when priced on request', () => {
    render(<ProductCard product={card} />);
    expect(screen.getByText('Request pricing & availability')).toBeDefined();
  });

  it('shows a price when one genuinely exists', () => {
    render(<ProductCard product={{ ...card, price: '£12,500' }} />);
    expect(screen.getByText('£12,500')).toBeDefined();
    expect(screen.queryByText('Request pricing & availability')).toBeNull();
  });

  it('marks a reserved piece without claiming it is sold', () => {
    render(<ProductCard product={{ ...card, available: false }} />);
    expect(screen.getByText('Reserved')).toBeDefined();
    expect(screen.queryByText(/sold/i)).toBeNull();
  });

  it('states availability in text for screen readers', () => {
    render(<ProductCard product={{ ...card, available: false }} />);
    expect(screen.getByText(/currently reserved/i)).toBeDefined();
  });

  it('links the card to the product page', () => {
    render(<ProductCard product={card} />);
    expect(screen.getByRole('link', { name: 'A watch' }).getAttribute('href')).toBe(
      '/products/a-watch',
    );
  });

  it('has no critical or serious axe violations', async () => {
    render(<ProductCard product={{ ...card, available: false, isNew: true }} />);
    expect(await severeViolations()).toEqual([]);
  });
});

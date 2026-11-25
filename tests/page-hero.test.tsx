// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PageHero } from '@/components/layout/page-hero';
import { SITE_PHOTOGRAPHY } from '@/lib/images/site-photography';

/**
 * The interior page-opening band.
 *
 * Two things matter here and neither is visible in a screenshot diff:
 *
 *  - the title is the page's *only* `h1`, because every page that uses this
 *    band relies on it for the top of the outline;
 *  - the band is on the dark ground with the light text tokens. If the ground
 *    and the text token drift apart — a dark band with a dark token, say — the
 *    page title becomes unreadable while still looking plausible in markup.
 *
 * jsdom does not lay out the document, so this suite says nothing about the
 * actual contrast ratio. The token contrast is asserted in
 * `tests/design-tokens.test.ts` and the geometry in the browser audit.
 */

afterEach(cleanup);

describe('PageHero', () => {
  it('renders the title as the page h1', () => {
    render(<PageHero title="Contact" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Contact' })).toBeDefined();
  });

  it('renders the eyebrow and intro when given', () => {
    render(<PageHero eyebrow="The Boutique" title="Contact" intro="Say hello." />);

    expect(screen.getByText('The Boutique')).toBeDefined();
    expect(screen.getByText('Say hello.')).toBeDefined();
  });

  it('omits the eyebrow and intro cleanly when they are absent', () => {
    const { container } = render(<PageHero title="Contact" />);

    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('puts the band on the dark ground with the light title token', () => {
    const { container } = render(<PageHero title="Contact" />);

    expect(container.querySelector('section')?.className).toContain('bg-night-900');
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('text-on-night');
  });

  it('uses the light eyebrow token on the dark ground, not the accent', () => {
    render(<PageHero eyebrow="The Boutique" title="Contact" />);

    // `text-accent` is gold-500, which is 3.7:1 on white and unsafe for small
    // text. On the dark ground the eyebrow must use the light gold.
    expect(screen.getByText('The Boutique').className).toContain('text-gold-300');
  });

  it('renders actions alongside the title', () => {
    render(<PageHero title="Cart" actions={<button type="button">Checkout</button>} />);

    expect(screen.getByRole('button', { name: 'Checkout' })).toBeDefined();
  });

  it('renders breadcrumbs outside the dark band', () => {
    const { container } = render(
      <PageHero title="A watch" breadcrumbs={<nav aria-label="Breadcrumb">Trail</nav>} />,
    );

    // The trail must not be inside the dark section: its link colours are tuned
    // for the light ground.
    expect(container.querySelector('section nav')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeDefined();
  });

  it('renders a decorative photograph that adds no accessible name', () => {
    const { container } = render(
      <PageHero title="Contact" photograph={SITE_PHOTOGRAPHY.rolexGmtBatgirl} />,
    );

    const img = container.querySelector('section img');

    expect(img).not.toBeNull();
    // Decorative: an empty alt and an `aria-hidden` wrapper, because the `h1`
    // already names the page. A described image would make a screen reader
    // announce "a watch" before every heading on the site.
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('never preloads the photograph, which is hidden below lg', () => {
    // The regression this guards: `priority` emits `<link rel="preload">`, and a
    // preload is fetched even when CSS hides the element. At 320px the hero is
    // `hidden`, so a preload downloaded an image that was never painted and
    // competed with the real LCP element. Measured at 14.7 KB per pageview.
    const { container } = render(
      <PageHero title="Contact" photograph={SITE_PHOTOGRAPHY.rolexGmtBatgirl} />,
    );

    const img = container.querySelector('section img');

    expect(img?.getAttribute('loading')).toBe('lazy');
    // `fetchpriority="high"` is the other half of what `priority` sets.
    expect(img?.getAttribute('fetchpriority')).not.toBe('high');
  });

  it('renders no image at all when no photograph is given', () => {
    const { container } = render(<PageHero title="Contact" />);

    expect(container.querySelector('section img')).toBeNull();
  });

  it('shows the photograph at every viewport, not only on desktop', () => {
    // The band used to hide its photograph below `lg`, so a phone visitor saw a
    // plain black strip on every interior page. The image is now the band's
    // wallpaper and must not carry a responsive hide. This asserts the wrapper
    // has no `hidden`/`lg:block` pair rather than trusting the class string.
    const { container } = render(
      <PageHero title="Contact" photograph={SITE_PHOTOGRAPHY.rolexGmtBatgirl} />,
    );

    const wrapper = container.querySelector('section img')?.closest('[aria-hidden="true"]');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).not.toMatch(/\bhidden\b/);
    expect(wrapper?.className).not.toMatch(/\blg:block\b/);
  });

  it('carries the section accent on the eyebrow, not on the page ground', () => {
    // Each section opens in its own colour. The accent must sit on the eyebrow
    // and the glow, never on the section's background: a `-500`/`-700` fill
    // under a heading fails contrast, and the browser audit cannot see a colour
    // that was never applied. jsdom can see the class.
    for (const tone of ['gold', 'emerald', 'burgundy', 'sapphire'] as const) {
      const { container, unmount } = render(
        <PageHero eyebrow="Section" title="Title" eyebrowTone={tone} />,
      );

      const eyebrow = container.querySelector('.eyebrow');
      expect(eyebrow?.className, tone).toContain(`text-${tone}-300`);

      unmount();
    }
  });

  it('keeps the band on a night ground whatever the accent', () => {
    const { container } = render(
      <PageHero eyebrow="Section" title="Title" eyebrowTone="burgundy" />,
    );

    const section = container.querySelector('section');
    expect(section?.className).toContain('bg-night-900');
    expect(section?.className).not.toContain('bg-burgundy');
  });

  it('has no critical or serious axe violations', async () => {
    const { container } = render(
      <PageHero
        eyebrow="Shop"
        title="The Collection"
        intro="Every piece is sourced and inspected by us."
        actions={<button type="button">Filter</button>}
      />,
    );

    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PageHero } from '@/components/layout/page-hero';

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

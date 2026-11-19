// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TrustPanel } from '@/components/product/trust-panel';

/**
 * The buying-assurance panel.
 *
 * jsdom cannot check contrast or layout, so those are the browser audit's job.
 * What is assertable here is the honesty rule the phase turns on: the panel says
 * what the owner's policy pages say, links to them, and invents nothing.
 */

afterEach(cleanup);

const policies = [
  { slug: 'about', title: 'About Us', excerpt: 'Who we are.' },
  { slug: 'warranty', title: 'Returns & Warranty', excerpt: 'Our returns window.' },
];

describe('TrustPanel', () => {
  it('links each policy to its own page', () => {
    render(<TrustPanel policies={policies} />);

    expect(screen.getByRole('link', { name: 'About Us' }).getAttribute('href')).toBe(
      '/pages/about',
    );
    expect(screen.getByRole('link', { name: 'Returns & Warranty' }).getAttribute('href')).toBe(
      '/pages/warranty',
    );
  });

  it('renders the excerpt the owner wrote', () => {
    render(<TrustPanel policies={policies} />);

    expect(screen.getByText('Our returns window.')).toBeTruthy();
  });

  it('renders no sentence when a policy has no excerpt', () => {
    render(<TrustPanel policies={[{ slug: 'terms', title: 'Terms of Use', excerpt: null }]} />);

    expect(screen.getByRole('link', { name: 'Terms of Use' })).toBeTruthy();
    expect(screen.queryByText(/warranty/i)).toBeNull();
  });

  it('renders nothing at all when no policy is published', () => {
    const { container } = render(<TrustPanel policies={[]} />);

    expect(container.childElementCount).toBe(0);
  });

  it('is a labelled region, so it can be navigated to by name', () => {
    render(<TrustPanel policies={policies} />);

    expect(screen.getByRole('region', { name: 'Buying with confidence' })).toBeTruthy();
  });
});

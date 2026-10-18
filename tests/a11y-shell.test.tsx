// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SiteFooter } from '@/components/chrome/site-footer';
import { SiteHeader } from '@/components/chrome/site-header';
import type { ChromeData } from '@/lib/navigation/types';

/**
 * Accessibility audit of the site shell.
 *
 * The Phase 3 acceptance criterion is that axe reports no critical or serious
 * violations on the shell. This runs the real axe-core engine against the real
 * rendered chrome, and fails the build on any `critical` or `serious` finding.
 *
 * **What jsdom can and cannot check.** jsdom does not lay out the document, so
 * axe skips the rules that need geometry: colour contrast, target size, and
 * anything that depends on where an element sits on screen. Those are covered
 * elsewhere — colour contrast is asserted numerically against the design tokens
 * in `design-tokens.test.ts`, and the visual check belongs to the browser audit.
 * What this suite does cover is the structural half, which is where most real
 * ARIA bugs live: accessible names, roles, landmark structure, heading order,
 * duplicate ids, and invalid ARIA attribute combinations.
 *
 * The chrome is rendered with a populated fixture rather than an empty one, so
 * the mega menu, the announcement bar and the footer columns are all present and
 * audited rather than skipped.
 */

afterEach(cleanup);

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

/**
 * The header's counts are fetched by a small Client Component after mount (see
 * `header-actions-live.tsx`), which imports a Server Action. A Server Action is
 * importable from a Client Component in a real Next.js build — that is what the
 * `'use server'` boundary is for — but the action's module graph reaches
 * `server-only`, which throws by design when a test imports it into a
 * browser-like environment.
 *
 * This suite audits the shell's structure, not the counts fetch, so the action is
 * replaced with a fixed answer. The mock is at the module boundary and returns
 * the real `HeaderCounts` shape, so the badge path is still exercised.
 */
vi.mock('@/server/actions/counts-actions', () => ({
  readHeaderCounts: async () => ({ cartCount: 0, wishlistCount: 0, signedIn: false }),
}));

const chrome: ChromeData = {
  identity: {
    businessName: 'Appleton & Co',
    tagline: 'Independent watch retail',
    logoUrl: null,
    contactEmail: 'hello@example.com',
    contactPhone: '+44 20 7000 0000',
    whatsappUrl: 'https://wa.me/442070000000',
    addressLines: ['12 Guildhall Street', 'London', 'EC2V 7HH United Kingdom'],
    socials: [
      { label: 'Instagram', href: 'https://instagram.com/example' },
      { label: 'YouTube', href: 'https://youtube.com/@example' },
    ],
  },
  announcements: [
    {
      id: 'a1',
      message: 'Every timepiece is inspected and authenticated before it is offered.',
      linkLabel: 'How we authenticate',
      linkUrl: '/pages/about',
    },
    {
      id: 'a2',
      message: 'Payment is arranged directly with the boutique.',
      linkLabel: null,
      linkUrl: null,
    },
  ],
  header: [
    { kind: 'link', id: 'shop', label: 'Shop', href: '/collections/all', external: false },
    {
      kind: 'brands',
      id: 'brands',
      label: 'Brands',
      href: '/brands',
      panels: [
        {
          id: 'p1',
          label: 'Rolex',
          href: '/brands/rolex',
          productCount: null,
          columns: [
            {
              heading: 'Model families',
              links: [
                {
                  id: 'm1',
                  label: 'Cosmograph Daytona',
                  href: '/collections/cosmograph-daytona',
                  external: false,
                },
                { id: 'm2', label: 'Datejust', href: '/collections/datejust', external: false },
              ],
            },
          ],
        },
      ],
    },
    {
      kind: 'link',
      id: 'services',
      label: 'Services',
      href: '/services/sell-trade',
      external: false,
    },
  ],
  footerColumns: [
    {
      heading: 'Explore',
      links: [
        { id: 'f1', label: 'The Collection', href: '/collections/all', external: false },
        { id: 'f2', label: 'Brands', href: '/brands', external: false },
      ],
    },
    {
      heading: 'Policies',
      links: [
        { id: 'f3', label: 'Shipping', href: '/pages/shipping', external: false },
        { id: 'f4', label: 'Returns & Warranty', href: '/pages/warranty', external: false },
      ],
    },
  ],
  ageGate: { enabled: true, minimumAge: 18 },
  source: 'database',
};

async function auditShell(): Promise<axe.Result[]> {
  // `SiteHeader` already renders the announcement bar, so the shell is rendered
  // exactly as a page composes it. Rendering `AnnouncementBar` separately here
  // would put two identically-labelled regions on the page and produce a
  // `landmark-unique` failure that the real site does not have.
  render(
    <>
      <SiteHeader data={chrome} />
      <main id="main-content">
        <h1>Page heading</h1>
        <p>Page content.</p>
      </main>
      <SiteFooter data={chrome} />
    </>,
  );

  const results = await axe.run(document.body, {
    // The colour-contrast rule cannot run without layout, and reporting it as
    // "incomplete" would mask real failures elsewhere. It is asserted
    // numerically in design-tokens.test.ts instead.
    rules: { 'color-contrast': { enabled: false } },
  });

  return results.violations;
}

describe('site shell accessibility', () => {
  it('has no critical or serious axe violations', async () => {
    const violations = await auditShell();
    const severe = violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );

    // The message names the rule and the offending node, so a failure is
    // actionable rather than just a count.
    expect(
      severe.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.target.join(' ')),
      })),
    ).toEqual([]);
  });

  it('has no moderate or minor violations either', async () => {
    // Not required by the acceptance criterion, but a shell with a moderate
    // finding tends to grow into a serious one. Keeping this at zero is cheap
    // while the shell is small.
    const violations = await auditShell();
    expect(
      violations.map((violation) => ({
        id: violation.id,
        nodes: violation.nodes.map((node) => node.target.join(' ')),
      })),
    ).toEqual([]);
  });
});

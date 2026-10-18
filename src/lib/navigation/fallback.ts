import type { ChromeData } from '@/lib/navigation/types';

/**
 * Fallback chrome used when the database cannot be reached.
 *
 * This exists so the site renders a coherent shell before the Supabase project
 * exists (issue A1) and during a database outage, rather than crashing or
 * showing an empty header. It is **not** a second source of truth: every link
 * here points at a real route in this repository, and the components label the
 * shell as not-yet-connected so nobody mistakes it for live data.
 *
 * It mirrors what `supabase/seed/02_content.sql` inserts, so the fallback and
 * the seeded database produce the same navigation. When the seed changes, this
 * changes with it — `tests/navigation.test.ts` asserts the two agree on the set
 * of routes.
 */
export const fallbackChrome: ChromeData = {
  identity: {
    businessName: 'Carbon Watch Company',
    tagline: 'Independent luxury watch retail',
    logoUrl: null,
    contactEmail: null,
    contactPhone: null,
    whatsappUrl: null,
    addressLines: [],
    socials: [],
  },
  announcements: [],
  header: [
    { kind: 'link', id: 'fb-shop', label: 'Shop', href: '/shop', external: false },
    { kind: 'brands', id: 'fb-brands', label: 'Brands', href: '/brands', panels: [] },
    {
      kind: 'link',
      id: 'fb-sell',
      label: 'Sell or Trade',
      href: '/services/sell-trade',
      external: false,
    },
    {
      kind: 'link',
      id: 'fb-sourcing',
      label: 'Watch Sourcing',
      href: '/services/sourcing',
      external: false,
    },
    {
      kind: 'link',
      id: 'fb-repair',
      label: 'Repair & Restoration',
      href: '/services/repair-restoration',
      external: false,
    },
    { kind: 'link', id: 'fb-about', label: 'About', href: '/pages/about', external: false },
    { kind: 'link', id: 'fb-faq', label: 'FAQ', href: '/pages/faq', external: false },
    { kind: 'link', id: 'fb-contact', label: 'Contact', href: '/contact', external: false },
  ],
  footerColumns: [
    {
      heading: 'Explore',
      links: [
        { id: 'fb-f1', label: 'Shop All', href: '/shop', external: false },
        { id: 'fb-f2', label: 'Brands', href: '/brands', external: false },
        { id: 'fb-f3', label: 'About Us', href: '/pages/about', external: false },
        { id: 'fb-f4', label: 'FAQ', href: '/pages/faq', external: false },
      ],
    },
    {
      heading: 'Services',
      links: [
        { id: 'fb-f5', label: 'Sell or Trade', href: '/services/sell-trade', external: false },
        { id: 'fb-f6', label: 'Watch Sourcing', href: '/services/sourcing', external: false },
        {
          id: 'fb-f7',
          label: 'Repair & Restoration',
          href: '/services/repair-restoration',
          external: false,
        },
        { id: 'fb-f8', label: 'Contact', href: '/contact', external: false },
      ],
    },
    {
      heading: 'Policies',
      links: [
        { id: 'fb-f9', label: 'Shipping', href: '/pages/shipping', external: false },
        { id: 'fb-f10', label: 'Returns & Warranty', href: '/pages/warranty', external: false },
        { id: 'fb-f11', label: 'Terms of Use', href: '/pages/terms', external: false },
        { id: 'fb-f12', label: 'Privacy Policy', href: '/pages/privacy', external: false },
      ],
    },
  ],
  ageGate: { enabled: true, minimumAge: 18 },
  source: 'fallback',
};

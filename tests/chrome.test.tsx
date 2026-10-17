// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AgeGateDialog } from '@/components/chrome/age-gate';
import { MobileNav } from '@/components/chrome/mobile-nav';
import { HeaderActions } from '@/components/chrome/header-actions';
import type { ChromeData } from '@/lib/navigation/types';

/**
 * Chrome component tests.
 *
 * These render the real components into a real DOM and drive them with real
 * user events, so the accessibility wiring is genuinely exercised: the drawer's
 * focus trap, the accordion's `aria-expanded`, and the header action labels all
 * come from the library rather than from a stub. A test that asserted against a
 * mocked Radix would prove nothing about what ships.
 *
 * `cleanup` is called explicitly because the suite runs with `globals: false`,
 * which disables Testing Library's automatic teardown.
 */

afterEach(cleanup);

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

const chrome: ChromeData = {
  identity: {
    businessName: 'Appleton & Co',
    tagline: 'Independent watch retail',
    logoUrl: null,
    contactEmail: 'hello@example.com',
    contactPhone: '+44 20 7000 0000',
    whatsappUrl: null,
    addressLines: [],
    socials: [],
  },
  announcements: [],
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
              heading: null,
              links: [
                {
                  id: 'm1',
                  label: 'Cosmograph Daytona',
                  href: '/collections/cosmograph-daytona',
                  external: false,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  footerColumns: [],
  ageGate: { enabled: true, minimumAge: 18 },
  source: 'database',
};

describe('HeaderActions', () => {
  it('gives every action an accessible name', () => {
    render(<HeaderActions />);

    for (const label of ['Search', 'Account', 'Wishlist', 'Cart']) {
      expect(screen.getByRole('link', { name: new RegExp(`^${label}`) })).toBeDefined();
    }
  });

  it('shows no count badge when the counts are zero', () => {
    render(<HeaderActions cartCount={0} wishlistCount={0} />);

    // A visible "0" would imply an implementation that does not exist yet.
    const cart = screen.getByRole('link', { name: 'Cart' });
    expect(within(cart).queryByText('0')).toBeNull();
  });

  it('includes the count in the accessible name when above zero', () => {
    render(<HeaderActions cartCount={3} />);

    expect(screen.getByRole('link', { name: 'Cart, 3 items' })).toBeDefined();
  });

  it('uses the singular for a count of one', () => {
    render(<HeaderActions cartCount={1} />);
    expect(screen.getByRole('link', { name: 'Cart, 1 item' })).toBeDefined();
  });

  it('caps a large count so the badge cannot overflow the header', () => {
    render(<HeaderActions cartCount={250} />);
    // The visible badge is capped; the accessible name still carries the truth.
    expect(screen.getByText('99+')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Cart, 250 items' })).toBeDefined();
  });
});

describe('MobileNav', () => {
  it('opens a labelled dialog from the menu trigger', async () => {
    const user = userEvent.setup();
    render(<MobileNav data={chrome} />);

    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Menu' })).toBeDefined();
  });

  it('exposes the brand mega menu as a collapsible section with a real state', async () => {
    const user = userEvent.setup();
    render(<MobileNav data={chrome} />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    const dialog = await screen.findByRole('dialog');
    const trigger = within(dialog).getByRole('button', { name: 'Brands' });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await user.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(within(dialog).getByRole('link', { name: 'Cosmograph Daytona' })).toBeDefined();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(<MobileNav data={chrome} />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the contact details reachable inside the drawer', async () => {
    const user = userEvent.setup();
    render(<MobileNav data={chrome} />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: '+44 20 7000 0000' })).toBeDefined();
    expect(within(dialog).getByRole('link', { name: 'hello@example.com' })).toBeDefined();
  });

  it('repeats the appointment action that the header hides below xl', async () => {
    const user = userEvent.setup();
    render(<MobileNav data={chrome} />);
    await user.click(screen.getByRole('button', { name: 'Open menu' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('link', { name: 'Book an appointment' })).toBeDefined();
  });
});

describe('AgeGateDialog', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('asks a visitor who has not answered, and states the minimum age', async () => {
    render(<AgeGateDialog ageGate={{ enabled: true, minimumAge: 21 }} />);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/at least 21 years old/)).toBeDefined();
    expect(within(dialog).getByRole('button', { name: /21 or over/ })).toBeDefined();
  });

  it('renders nothing at all when the gate is disabled', () => {
    render(<AgeGateDialog ageGate={{ enabled: false, minimumAge: 18 }} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not ask again once the answer is confirmed', async () => {
    window.localStorage.setItem('lw:age-verified', 'yes');
    render(<AgeGateDialog ageGate={{ enabled: true, minimumAge: 18 }} />);

    // The effect reads storage on mount; nothing should appear afterwards.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('records the confirmation so the next visit skips the gate', async () => {
    const user = userEvent.setup();
    render(<AgeGateDialog ageGate={{ enabled: true, minimumAge: 18 }} />);
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: /Yes, I am 18 or over/ }));

    expect(window.localStorage.getItem('lw:age-verified')).toBe('yes');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('blocks a visitor who declines, and lets them change their answer', async () => {
    const user = userEvent.setup();
    render(<AgeGateDialog ageGate={{ enabled: true, minimumAge: 18 }} />);
    await screen.findByRole('dialog');

    await user.click(screen.getByRole('button', { name: /No, I am under 18/ }));

    expect(window.localStorage.getItem('lw:age-verified')).toBe('no');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/cannot let you in/i)).toBeDefined();

    // Changing the answer returns to the question rather than letting them in.
    await user.click(within(dialog).getByRole('button', { name: /Change my answer/ }));
    expect(window.localStorage.getItem('lw:age-verified')).toBe('no');
    expect(screen.getByRole('button', { name: /Yes, I am 18 or over/ })).toBeDefined();
  });

  it('cannot be dismissed with Escape', async () => {
    const user = userEvent.setup();
    render(<AgeGateDialog ageGate={{ enabled: true, minimumAge: 18 }} />);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    // A gate that can be dismissed without an answer is not a gate.
    expect(screen.queryByRole('dialog')).not.toBeNull();
  });
});

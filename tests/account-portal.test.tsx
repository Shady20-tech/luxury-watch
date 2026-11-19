// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountNav } from '@/components/account/account-nav';
import { ServiceRequestList } from '@/components/account/service-request-list';
import { serviceStatusLabel, serviceStatusTone } from '@/lib/services/presentation';
import type { ServiceRequestSummary } from '@/server/repositories/service-repository';

/**
 * Account-portal component tests.
 *
 * These render the real components. The nav is the only way a customer reaches
 * twelve account destinations, so a missing link is a page nobody can find; and
 * the service list is shared by four pages, so a badge that dropped its text
 * label would make four pages depend on colour alone.
 *
 * The pathname is a mutable module variable that the `next/navigation` mock reads
 * on each call, so a test can render the nav at a different route without
 * re-importing the component. `vi.mock` is hoisted above the imports, which is
 * why the mock can close over a variable declared below it.
 */

let currentPathname = '/account';

vi.mock('next/navigation', () => ({
  usePathname: () => currentPathname,
}));

afterEach(() => {
  cleanup();
  currentPathname = '/account';
});

function renderNavAt(pathname: string) {
  currentPathname = pathname;
  return render(<AccountNav />);
}

const LOGOUT_ACTION = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/server/actions/auth-actions', () => ({
  logoutAction: LOGOUT_ACTION,
}));

describe('AccountNav', () => {
  it('links every required account destination', () => {
    renderNavAt('/account');

    const nav = screen.getByRole('navigation', { name: 'Account' });
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));

    // The routes this phase adds, plus the ones that already existed. If a page
    // is added without a link it is unreachable, so the list is asserted whole.
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/account',
        '/account/orders',
        '/account/wishlist',
        '/account/sell-trade',
        '/account/sourcing',
        '/account/repairs',
        '/account/appointments',
        '/account/messages',
        '/account/profile',
        '/account/addresses',
        '/account/security',
        '/account/settings',
      ]),
    );
  });

  it('groups the destinations under headings', () => {
    renderNavAt('/account');

    const nav = screen.getByRole('navigation', { name: 'Account' });
    for (const heading of ['Shopping', 'Requests', 'Details']) {
      // `exact` keeps 'Requests' from also matching the 'Request a…' links.
      expect(within(nav).getByText(heading, { exact: true })).toBeDefined();
    }
  });

  it('marks the current page with aria-current', () => {
    renderNavAt('/account/repairs');

    const nav = screen.getByRole('navigation', { name: 'Account' });
    const current = within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');

    expect(current.length).toBe(1);
    expect(current[0]?.getAttribute('href')).toBe('/account/repairs');
  });

  it('does not mark Overview current on a nested page', () => {
    renderNavAt('/account/orders');

    const nav = screen.getByRole('navigation', { name: 'Account' });
    const overview = within(nav).getByRole('link', { name: /overview/i });

    expect(overview.getAttribute('aria-current')).toBeNull();
  });

  it('offers a sign-out control', () => {
    renderNavAt('/account');

    const nav = screen.getByRole('navigation', { name: 'Account' });
    expect(within(nav).getByRole('button', { name: /sign out/i })).toBeDefined();
  });
});

function request(overrides: Partial<ServiceRequestSummary> = {}): ServiceRequestSummary {
  return {
    id: 'r1',
    kind: 'repair',
    reference: 'LW-1001',
    title: 'Rolex Submariner — service',
    status: 'in_repair',
    createdAt: '2026-01-15T10:00:00.000Z',
    slotStart: null,
    ...overrides,
  };
}

describe('ServiceRequestList', () => {
  it('shows an honest empty state with a way to start a request', () => {
    render(<ServiceRequestList kind="sourcing" requests={[]} />);

    expect(screen.getByText(/no sourcing requests yet/i)).toBeDefined();
    expect(screen.getByRole('link', { name: /source a piece/i }).getAttribute('href')).toBe(
      '/services/sourcing',
    );
  });

  it('renders each request with its reference and a text status badge', () => {
    render(<ServiceRequestList kind="repair" requests={[request()]} />);

    expect(screen.getByText('Rolex Submariner — service')).toBeDefined();
    expect(screen.getByText(/LW-1001/)).toBeDefined();
    // The label is text, not colour alone — a colour-blind or screen-reader user
    // must still be able to read the state.
    expect(screen.getByText('In repair')).toBeDefined();
  });

  it('renders a request with no reference without a dangling separator', () => {
    render(
      <ServiceRequestList
        kind="appointment"
        requests={[request({ kind: 'appointment', reference: null, status: 'requested' })]}
      />,
    );

    const row = screen.getByText('Rolex Submariner — service').closest('li');
    expect(row?.textContent).not.toMatch(/·\s*·/);
  });
});

describe('serviceStatusTone', () => {
  it('classifies terminal success and failure states', () => {
    expect(serviceStatusTone('completed')).toBe('positive');
    expect(serviceStatusTone('declined')).toBe('negative');
    expect(serviceStatusTone('in_repair')).toBe('pending');
  });

  it('treats an unknown state as neutral rather than throwing', () => {
    // A workflow state added to an enum later must not break a page.
    expect(serviceStatusTone('some_future_state')).toBe('neutral');
  });
});

describe('serviceStatusLabel', () => {
  it('turns a snake_case status into a readable label', () => {
    expect(serviceStatusLabel('more_information_required')).toBe('More information required');
    expect(serviceStatusLabel('submitted')).toBe('Submitted');
  });
});

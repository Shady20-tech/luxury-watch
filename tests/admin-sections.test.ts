import { describe, expect, it } from 'vitest';

import {
  heldBy,
  landingSectionFor,
  mayEnterSection,
  maySeeOverview,
  permissionForSection,
  requirementForSection,
} from '@/lib/admin/sections';

/**
 * The section map is what keeps three callers agreeing: the layout refuses with
 * it, the navigation filters with it, the overview lands with it. A test here is
 * cheaper than discovering the disagreement in the browser.
 */

const held = (...keys: string[]) => new Set(keys);

describe('requirementForSection', () => {
  it('maps each section root to what opens it', () => {
    expect(requirementForSection('/admin/inventory')).toEqual({ permission: 'inventory.read' });
    expect(requirementForSection('/admin/orders')).toEqual({ permission: 'orders.read' });
    expect(requirementForSection('/admin/products')).toEqual({ permission: 'catalog.read' });
    expect(requirementForSection('/admin/inquiries')).toEqual({ permission: 'inquiries.read' });
    expect(requirementForSection('/admin/appointments')).toEqual({ permission: 'inquiries.read' });
    expect(requirementForSection('/admin/customers')).toEqual({ permission: 'customers.read' });
    expect(requirementForSection('/admin/settings')).toEqual({ permission: 'content.read' });
    expect(requirementForSection('/admin/audit')).toEqual({ permission: 'audit.read' });
  });

  it('gates the staff screen on the SUPER_ADMIN role, as its page does', () => {
    // `customers.read` is not enough: the screen grants permissions, so a
    // permission check there would let an administrator promote themselves.
    expect(requirementForSection('/admin/staff')).toEqual({ role: 'SUPER_ADMIN' });
    expect(permissionForSection('/admin/staff')).toBeNull();
  });

  it('matches nested paths against their section root', () => {
    expect(requirementForSection('/admin/orders/abc-123')).toEqual({ permission: 'orders.read' });
    expect(requirementForSection('/admin/settings/pages/new')).toEqual({
      permission: 'content.read',
    });
    expect(requirementForSection('/admin/products/new')).toEqual({ permission: 'catalog.read' });
  });

  it('does not match a sibling that merely shares a prefix', () => {
    // A bare `startsWith` would treat `/admin/ordersomething` as `/admin/orders`
    // and refuse or admit the wrong caller.
    expect(requirementForSection('/admin/ordersomething')).toBeNull();
    expect(requirementForSection('/admin/inventories')).toBeNull();
  });

  it('leaves the overview and the account area open to any staff member', () => {
    expect(requirementForSection('/admin')).toBeNull();
    expect(requirementForSection('/admin/account')).toBeNull();
  });
});

describe('mayEnterSection', () => {
  it('admits a caller holding the section permission', () => {
    expect(mayEnterSection('/admin/inventory', held('inventory.read'))).toBe(true);
  });

  it('refuses a caller without it', () => {
    expect(mayEnterSection('/admin/inventory', held('content.read'))).toBe(false);
  });

  it('admits anyone to a section that needs only staff', () => {
    expect(mayEnterSection('/admin', held())).toBe(true);
    expect(mayEnterSection('/admin/account', held())).toBe(true);
  });

  it('refuses an inventory manager the audit trail', () => {
    const inventoryManager = held(
      'catalog.read',
      'catalog.write',
      'inventory.read',
      'inventory.write',
    );
    expect(mayEnterSection('/admin/audit', inventoryManager)).toBe(false);
    expect(mayEnterSection('/admin/inventory', inventoryManager)).toBe(true);
  });

  it('refuses a content manager the inventory', () => {
    const contentManager = held('content.read', 'content.write');
    expect(mayEnterSection('/admin/inventory', contentManager)).toBe(false);
    expect(mayEnterSection('/admin/settings', contentManager)).toBe(true);
  });

  it('refuses an ADMIN the staff screen, because only SUPER_ADMIN opens it', () => {
    // This is the defect a permission-only map would hide: an ADMIN holds
    // `customers.read`, so a `customers.read` requirement would have admitted
    // them to the layout and let the page throw a 500 behind it.
    const admin = held('customers.read', 'customers.write', 'content.read', 'audit.read');
    expect(mayEnterSection('/admin/staff', admin)).toBe(false);
    expect(mayEnterSection('/admin/staff', held('SUPER_ADMIN'))).toBe(true);
  });
});

describe('heldBy', () => {
  it('merges permissions and roles into one set', () => {
    const merged = heldBy({ permissions: new Set(['inventory.read']), roles: ['SUPER_ADMIN'] });
    expect(merged.has('inventory.read')).toBe(true);
    expect(merged.has('SUPER_ADMIN')).toBe(true);
  });
});

describe('landingSectionFor', () => {
  // These sets mirror `role_permissions()` in 0007_rls_policies.sql exactly, so a
  // change to the database mapping that invalidates these expectations is caught
  // here rather than discovered as a manager landing on the wrong page.
  const CONTENT_MANAGER = held('content.read', 'content.write');
  const INVENTORY_MANAGER = held(
    'catalog.read',
    'catalog.write',
    'inventory.read',
    'inventory.write',
    'orders.read',
  );
  const SALES_MANAGER = held(
    'catalog.read',
    'inventory.read',
    'orders.read',
    'orders.write',
    'orders.settle',
    'inquiries.read',
    'inquiries.write',
    'content.read',
    'customers.read',
  );

  it('sends a content manager to content', () => {
    expect(landingSectionFor(CONTENT_MANAGER)).toBe('/admin/settings');
  });

  it('sends an inventory manager to inventory, not the order queue it may read', () => {
    expect(landingSectionFor(INVENTORY_MANAGER)).toBe('/admin/inventory');
  });

  it('sends a sales manager to the order queue', () => {
    expect(landingSectionFor(SALES_MANAGER)).toBe('/admin/orders');
  });

  it('always returns a reachable path, even for a role holding nothing', () => {
    expect(landingSectionFor(held())).toBe('/admin/account');
  });

  it('never returns a section the caller cannot enter', () => {
    for (const permissions of [CONTENT_MANAGER, INVENTORY_MANAGER, SALES_MANAGER]) {
      expect(mayEnterSection(landingSectionFor(permissions), permissions)).toBe(true);
    }
  });
});

describe('maySeeOverview', () => {
  it('is true for an administrator', () => {
    expect(maySeeOverview(true)).toBe(true);
  });

  it('is false for a single-section manager, who gets their own section instead', () => {
    expect(maySeeOverview(false)).toBe(false);
  });
});

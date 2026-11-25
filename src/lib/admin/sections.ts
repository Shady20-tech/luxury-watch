/**
 * Which administrative section a URL belongs to, and what opens it.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS A SEPARATE, PURE MODULE
 * -----------------------------------------------------------------------------
 *
 * Three places need the same answer: the layout (to refuse a route the caller
 * cannot open), the navigation (to decide which links to render), and the
 * overview (to send a caller to a section they can actually use). If each held
 * its own copy of the map, they would drift, and the drift is invisible — a link
 * that renders but refuses, or a route that opens but has no link.
 *
 * Keeping it free of `server-only` and of any Supabase import also makes it
 * directly testable, and lets the client navigation import it without pulling a
 * server module into the browser bundle.
 *
 * -----------------------------------------------------------------------------
 * THE MAP IS THE FLOOR, NOT THE CEILING
 * -----------------------------------------------------------------------------
 *
 * This decides the *section* requirement — "may you enter the inventory area at
 * all". Individual pages and actions still assert their own narrower permission
 * (`content.write` for an editor, `orders.settle` for settlement). A section
 * requirement that is too broad here would widen entry, not authority, because
 * the page behind it checks again.
 *
 * A section with no entry needs only a staff role. That is deliberate for
 * `/admin/account`, which every staff member must reach to change their own
 * password whatever their role.
 */

import type { Permission, StaffRole } from '@/server/services/admin-authorization';

/**
 * What a caller must hold to enter a section: a permission, a role, or both.
 *
 * The role arm exists because `/admin/staff` is gated on identity rather than on
 * capability. It is the screen that *grants* permissions, so a permission-based
 * check would be circular — an administrator must not be able to promote
 * themselves by editing roles. It requires `SUPER_ADMIN` directly, exactly as
 * its page does.
 */
type SectionRequirement = { permission: Permission } | { role: StaffRole };

/**
 * Section roots, matched on a path boundary so `/admin/settings/pages` matches
 * `/admin/settings` and `/admin/ordersomething` matches nothing.
 */
const SECTION_REQUIREMENTS: ReadonlyArray<readonly [string, SectionRequirement]> = [
  ['/admin/orders', { permission: 'orders.read' }],
  ['/admin/products', { permission: 'catalog.read' }],
  ['/admin/inventory', { permission: 'inventory.read' }],
  ['/admin/inquiries', { permission: 'inquiries.read' }],
  ['/admin/appointments', { permission: 'inquiries.read' }],
  ['/admin/customers', { permission: 'customers.read' }],
  ['/admin/settings', { permission: 'content.read' }],
  ['/admin/audit', { permission: 'audit.read' }],
  ['/admin/staff', { role: 'SUPER_ADMIN' }],
];

/**
 * The requirement that opens `pathname`, or `null` when any staff member may
 * enter it.
 *
 * Paths outside `/admin` return `null`, because this map only governs the
 * administration area.
 */
export function requirementForSection(pathname: string): SectionRequirement | null {
  for (const [root, requirement] of SECTION_REQUIREMENTS) {
    if (pathname === root || pathname.startsWith(`${root}/`)) return requirement;
  }
  return null;
}

/** The permission that opens `pathname`, or `null` when it is not permission-gated. */
export function permissionForSection(pathname: string): Permission | null {
  const requirement = requirementForSection(pathname);
  return requirement && 'permission' in requirement ? requirement.permission : null;
}

/**
 * The single set the section checks read from: the caller's permissions *and*
 * their roles.
 *
 * Roles belong here because one section (`/admin/staff`) is gated on identity,
 * not capability. Passing one merged set means a caller cannot forget to pass
 * roles and silently lose a section, or pass only roles and lose the rest.
 */
export function heldBy(identity: {
  permissions: ReadonlySet<string>;
  roles: readonly string[];
}): ReadonlySet<string> {
  return new Set<string>([...identity.permissions, ...identity.roles]);
}

/**
 * Whether a caller may enter `pathname`.
 *
 * `held` is the union of the caller's permissions and roles, resolved from the
 * database. This function does no I/O and makes no judgement of its own: it
 * reports whether the section's requirement is satisfied.
 */
export function mayEnterSection(pathname: string, held: ReadonlySet<string>): boolean {
  const requirement = requirementForSection(pathname);
  if (requirement === null) return true;
  return 'permission' in requirement
    ? held.has(requirement.permission)
    : held.has(requirement.role);
}

/**
 * The first section a caller may enter, used to land a role that has no business
 * on the overview.
 *
 * Each entry names the permission that makes the section *their work*: the write
 * permission where one exists, the read permission otherwise. Preferring the
 * write permission is what sends an inventory manager to Inventory rather than
 * to the order queue they may merely read, and a sales manager to the queue
 * rather than to the catalogue.
 *
 * `/admin/account` is the final fallback because every staff member can reach it,
 * so this never returns `null` for a signed-in staff member.
 */
const LANDING_ORDER: ReadonlyArray<readonly [string, Permission]> = [
  ['/admin/inventory', 'inventory.write'],
  ['/admin/orders', 'orders.write'],
  ['/admin/products', 'catalog.write'],
  ['/admin/settings', 'content.write'],
  ['/admin/inquiries', 'inquiries.write'],
  ['/admin/orders', 'orders.read'],
  ['/admin/inventory', 'inventory.read'],
  ['/admin/products', 'catalog.read'],
  ['/admin/inquiries', 'inquiries.read'],
  ['/admin/customers', 'customers.read'],
  ['/admin/settings', 'content.read'],
  ['/admin/audit', 'audit.read'],
];

export function landingSectionFor(held: ReadonlySet<string>): string {
  for (const [href, permission] of LANDING_ORDER) {
    if (held.has(permission)) return href;
  }
  return '/admin/account';
}

/**
 * Whether the overview is the caller's page at all.
 *
 * The overview is the administration's front page: a grid of figures drawn from
 * every section — orders, enquiries, stock, catalogue, the audit trail. It is a
 * view *across* the business, which is what an administrator's job is and what a
 * single-section manager's job is not.
 *
 * A manager is therefore sent to their own section instead. The alternative —
 * letting an inventory manager sit on a page that also reports open enquiries,
 * unconfirmed appointments and the audit trail — is precisely the "another
 * person's dashboard" the role split exists to prevent, even where each figure
 * is individually permitted. Holding a permission to read a figure is not the
 * same as the overview being their page.
 */
export function maySeeOverview(isAdmin: boolean): boolean {
  return isAdmin;
}

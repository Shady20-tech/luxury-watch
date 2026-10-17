/**
 * Navigation view models.
 *
 * These types are the contract between the database and the chrome components.
 * They are deliberately *not* the row types from `database.types.ts`: the
 * components must be renderable from a fixture in a test without a database,
 * and they must not know about `sort_order`, `is_active` or parent links.
 *
 * `lib/navigation/assemble.ts` is the only place that turns rows into these
 * shapes. A later phase swaps the fixture repository for the Supabase one and
 * nothing above this boundary changes.
 */

/** A single link. `href` is always a site-relative path or an https URL. */
export type NavLink = {
  id: string;
  label: string;
  href: string;
  /** External links open in a new tab and get a rel guard. */
  external: boolean;
  /** Optional short description shown in the mega menu, never in the bar. */
  description?: string | null;
};

/** A column of links inside a mega-menu panel. */
export type NavColumn = {
  /** Optional heading, for example "By model". */
  heading?: string | null;
  links: NavLink[];
};

/** A brand panel: the brand itself plus its model sub-links. */
export type NavBrandPanel = {
  id: string;
  label: string;
  href: string;
  /** Number of published products, when known. Used as a discreet count. */
  productCount?: number | null;
  columns: NavColumn[];
};

/** A top-level header item. */
export type NavItem =
  | { kind: 'link'; id: string; label: string; href: string; external: boolean }
  | { kind: 'brands'; id: string; label: string; href: string; panels: NavBrandPanel[] };

/** The announcement bar's data. `linkUrl` is optional. */
export type Announcement = {
  id: string;
  message: string;
  linkLabel: string | null;
  linkUrl: string | null;
};

/** Store identity and contact details used by the header and footer. */
export type SiteIdentity = {
  businessName: string;
  tagline: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappUrl: string | null;
  addressLines: string[];
  socials: { label: string; href: string }[];
};

/** Age-gate configuration, read from `site_settings`. */
export type AgeGate = {
  enabled: boolean;
  /** Minimum age in years. Constrained to 13–25 by the database. */
  minimumAge: number;
};

/** Everything the header and footer need, in one object. */
export type ChromeData = {
  identity: SiteIdentity;
  /** Rotating announcement messages, already filtered to the active window. */
  announcements: Announcement[];
  /** Top-level header items in display order. */
  header: NavItem[];
  /** Footer columns, grouped by `group_label`. */
  footerColumns: NavColumn[];
  /** Age-gate configuration. `enabled: false` renders no gate at all. */
  ageGate: AgeGate;
  /**
   * True when this data came from the database. False means the fixture was
   * used because Supabase is unreachable or unconfigured, which the UI states
   * plainly rather than pretending the menu is live.
   */
  source: 'database' | 'fallback';
};

import type {
  AgeGate,
  Announcement,
  ChromeData,
  NavBrandPanel,
  NavColumn,
  NavItem,
  NavLink,
  SiteIdentity,
} from '@/lib/navigation/types';

/**
 * Pure assembly of navigation view models.
 *
 * Everything here is a total function over plain rows, with no database and no
 * React. That is deliberate: the interesting logic in a menu is the tree
 * assembly and the cycle/limit handling, and that is exactly the logic that is
 * hard to test through a browser. Keeping it pure means it can be tested
 * directly, and it means the same code runs whether the rows came from
 * Supabase or from a fixture.
 */

/** A `navigation_items` row, narrowed to the columns assembly needs. */
export type NavigationRow = {
  id: string;
  parent_id: string | null;
  label: string;
  href: string;
  group_label: string | null;
  sort_order: number;
};

/** A `brands` row, narrowed. */
export type BrandRow = {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
};

/** A `models` row, narrowed. */
export type ModelRow = {
  id: string;
  brand_id: string;
  name: string;
  slug: string;
  sort_order: number;
};

export type AnnouncementRow = {
  id: string;
  message: string;
  link_label: string | null;
  link_url: string | null;
};

export type SiteSettingsRow = {
  business_name: string;
  tagline: string | null;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp_url: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_city: string | null;
  address_region: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  social_instagram: string | null;
  social_facebook: string | null;
  social_x: string | null;
  social_youtube: string | null;
  age_gate_enabled: boolean;
  age_gate_minimum_age: number;
};

/**
 * An href is external when it is an absolute https URL. The database constraint
 * allows only `/…` or `https://…`, so anything else is treated as external and
 * will not be rendered as a trusted internal path.
 */
export function isExternalHref(href: string): boolean {
  return /^https:\/\//i.test(href);
}

/**
 * Guard against a malformed or hostile href.
 *
 * The database already constrains hrefs to `/…` or `https://…`, but a row can
 * be edited by hand in the Supabase dashboard, and a `javascript:` URL in a
 * menu is a real XSS vector. This is the second line of defence.
 *
 * `//host` is rejected explicitly: it is a protocol-relative URL that inherits
 * the page scheme, so it passes a naive "starts with a slash" check while
 * pointing at another origin.
 */
export function isSafeHref(href: string): boolean {
  if (href.startsWith('//')) return false;
  return /^\//.test(href) || /^https:\/\//i.test(href);
}

export function toLink(row: NavigationRow): NavLink | null {
  if (!isSafeHref(row.href)) return null;
  return {
    id: row.id,
    label: row.label,
    href: row.href,
    external: isExternalHref(row.href),
  };
}

/**
 * Build the header tree from flat rows.
 *
 * Two sources feed the header:
 *
 *  - `navigation_items` rows, which supply the standalone items (Shop, Sell,
 *    About…) and any admin-authored sub-links, and
 *  - the catalogue itself, which supplies the brands mega-menu so it stays
 *    correct when a brand or model is added in the admin.
 *
 * A header item whose href is exactly `/brands` (or whose label is the
 * configured brands label) is *promoted* into the brands mega-menu rather than
 * rendered as a plain link, so the menu is built from live catalogue data.
 *
 * Rows with an unsafe href are dropped rather than rendered.
 */
export function buildHeaderNav(
  rows: NavigationRow[],
  brands: BrandRow[],
  models: ModelRow[],
  options: { brandsHref?: string; maxModelsPerBrand?: number } = {},
): NavItem[] {
  const brandsHref = options.brandsHref ?? '/brands';
  // A menu that lists 200 models is unusable and slow. The cap keeps the panel
  // scannable; the brand page remains the full list.
  const maxModels = options.maxModelsPerBrand ?? 14;

  const byParent = new Map<string | null, NavigationRow[]>();
  for (const row of rows) {
    const list = byParent.get(row.parent_id) ?? [];
    list.push(row);
    byParent.set(row.parent_id, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
  }

  const panels = buildBrandPanels(brands, models, maxModels);
  const items: NavItem[] = [];

  for (const row of byParent.get(null) ?? []) {
    if (!isSafeHref(row.href)) continue;

    if (row.href === brandsHref) {
      items.push({
        kind: 'brands',
        id: row.id,
        label: row.label,
        href: row.href,
        panels,
      });
      continue;
    }

    items.push({
      kind: 'link',
      id: row.id,
      label: row.label,
      href: row.href,
      external: isExternalHref(row.href),
    });
  }

  return items;
}

/** One panel per brand, each listing that brand's models in columns. */
export function buildBrandPanels(
  brands: BrandRow[],
  models: ModelRow[],
  maxModelsPerBrand: number,
): NavBrandPanel[] {
  const modelsByBrand = new Map<string, ModelRow[]>();
  for (const model of models) {
    const list = modelsByBrand.get(model.brand_id) ?? [];
    list.push(model);
    modelsByBrand.set(model.brand_id, list);
  }
  for (const list of modelsByBrand.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }

  return [...brands]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((brand) => {
      const brandModels = modelsByBrand.get(brand.id) ?? [];
      const shown = brandModels.slice(0, maxModelsPerBrand);
      const links: NavLink[] = shown.map((model) => ({
        id: model.id,
        label: model.name,
        href: `/collections/${model.slug}`,
        external: false,
      }));

      const columns: NavColumn[] = links.length > 0 ? [{ heading: null, links }] : [];

      // When the list was truncated, offer the full set rather than silently
      // hiding models the visitor cannot otherwise discover from the menu.
      if (brandModels.length > shown.length) {
        columns.push({
          heading: null,
          links: [
            {
              id: `${brand.id}-all`,
              label: `All ${brand.name}`,
              href: `/brands/${brand.slug}`,
              external: false,
            },
          ],
        });
      }

      return {
        id: brand.id,
        label: brand.name,
        href: `/brands/${brand.slug}`,
        productCount: null,
        columns,
      };
    });
}

/** Footer columns, grouped by `group_label`. */
export function buildFooterColumns(rows: NavigationRow[]): NavColumn[] {
  const groups = new Map<string, NavLink[]>();

  for (const row of rows) {
    const link = toLink(row);
    if (!link) continue;
    const key = row.group_label?.trim() || 'Explore';
    const list = groups.get(key) ?? [];
    list.push(link);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([heading, links]) => ({ heading, links }));
}

export function buildAnnouncements(rows: AnnouncementRow[]): Announcement[] {
  return rows.map((row) => ({
    id: row.id,
    message: row.message,
    linkLabel: row.link_label,
    linkUrl: row.link_url && isSafeHref(row.link_url) ? row.link_url : null,
  }));
}

export function buildIdentity(row: SiteSettingsRow | null): SiteIdentity {
  if (!row) {
    return {
      businessName: 'Carbon Watch Company',
      tagline: null,
      logoUrl: null,
      contactEmail: null,
      contactPhone: null,
      whatsappUrl: null,
      addressLines: [],
      socials: [],
    };
  }

  const addressLines = [
    row.address_line1,
    row.address_line2,
    [row.address_city, row.address_region].filter(Boolean).join(', '),
    [row.address_postal_code, row.address_country].filter(Boolean).join(' '),
  ]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line));

  const socials = [
    { label: 'Instagram', href: row.social_instagram },
    { label: 'Facebook', href: row.social_facebook },
    { label: 'X', href: row.social_x },
    { label: 'YouTube', href: row.social_youtube },
  ].filter((social): social is { label: string; href: string } => Boolean(social.href));

  return {
    businessName: row.business_name,
    tagline: row.tagline,
    logoUrl: row.logo_url,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    whatsappUrl: row.whatsapp_url,
    addressLines,
    socials,
  };
}

/** Assemble the whole chrome payload from raw rows. */
export function buildAgeGate(row: SiteSettingsRow | null, fallbackEnabled: boolean): AgeGate {
  if (!row) {
    // No settings row yet. The environment flag decides whether the gate exists,
    // and the minimum age is the schema default, so the gate is never absent
    // merely because the database is empty.
    return { enabled: fallbackEnabled, minimumAge: 18 };
  }

  // Clamp defensively. The database constrains this to 13–25, but a gate that
  // silently accepted 0 would let anyone through, so the value is not trusted
  // to be sane merely because a constraint exists.
  const minimumAge = Math.min(25, Math.max(13, row.age_gate_minimum_age ?? 18));

  return { enabled: row.age_gate_enabled, minimumAge };
}

export function assembleChrome(input: {
  /** `navigation_items` rows with `location = 'header'`. */
  headerRows: NavigationRow[];
  /** `navigation_items` rows with `location = 'footer'`. */
  footerRows: NavigationRow[];
  brands: BrandRow[];
  models: ModelRow[];
  announcements: AnnouncementRow[];
  settings: SiteSettingsRow | null;
  /** Used when there is no settings row to read the gate flag from. */
  ageGateFallback: boolean;
  source: 'database' | 'fallback';
}): ChromeData {
  return {
    identity: buildIdentity(input.settings),
    announcements: buildAnnouncements(input.announcements),
    header: buildHeaderNav(input.headerRows, input.brands, input.models),
    footerColumns: buildFooterColumns(input.footerRows),
    ageGate: buildAgeGate(input.settings, input.ageGateFallback),
    source: input.source,
  };
}

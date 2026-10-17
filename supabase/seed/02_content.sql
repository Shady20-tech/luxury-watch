-- =============================================================================
-- DEVELOPMENT CONTENT SEED  —  DO NOT RUN AGAINST PRODUCTION
-- =============================================================================
--
-- Seeds the content and configuration the site chrome renders from:
-- `site_settings`, `navigation_items` (header and footer) and `announcements`.
--
-- -----------------------------------------------------------------------------
-- IDEMPOTENCY
-- -----------------------------------------------------------------------------
--
-- Every row uses a fixed UUID and `on conflict (id) do update`, so re-running
-- this file updates the seeded rows in place. It does NOT delete rows an
-- administrator created, which a `delete then insert` would. The `0…01xx`
-- prefix keeps the seeded ids recognisable in the dashboard.
--
-- -----------------------------------------------------------------------------
-- WHAT IS DELIBERATELY NOT HERE
-- -----------------------------------------------------------------------------
--
-- Contact details are left null rather than filled with an invented address or
-- phone number. The footer and drawer handle nulls explicitly ("Boutique
-- address is not configured yet"), so the honest empty state is visible until
-- the owner sets real values in the admin. Inventing a plausible-looking address
-- for a real business would be worse than showing nothing.
--
-- The disclaimer in the footer is hardcoded in the component, not seeded here,
-- because it is a legal statement about the business's relationship with the
-- watch brands rather than editable marketing copy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- site_settings — the singleton row
-- -----------------------------------------------------------------------------
insert into public.site_settings (id, business_name, tagline)
values (true, 'Luxury Watch', 'Independent luxury watch retail')
on conflict (id) do update
  set business_name = excluded.business_name,
      tagline       = excluded.tagline,
      updated_at    = now();

-- -----------------------------------------------------------------------------
-- navigation_items — header
-- -----------------------------------------------------------------------------
--
-- `/brands` is special: the header component promotes the item pointing at it
-- into the brand mega-menu and builds the panels from the `brands` and `models`
-- tables. Adding a brand in the admin therefore updates the menu with no code
-- change and no reseed.
insert into public.navigation_items (id, location, parent_id, label, href, group_label, sort_order, is_active)
values
  ('00000000-0000-4000-8000-000000000101', 'header', null, 'Shop',                '/collections/all',              null, 10, true),
  ('00000000-0000-4000-8000-000000000102', 'header', null, 'Brands',              '/brands',                       null, 20, true),
  ('00000000-0000-4000-8000-000000000103', 'header', null, 'Sell or Trade',       '/services/sell-trade',          null, 30, true),
  ('00000000-0000-4000-8000-000000000104', 'header', null, 'Watch Sourcing',      '/services/sourcing',            null, 40, true),
  ('00000000-0000-4000-8000-000000000105', 'header', null, 'Repair & Restoration','/services/repair-restoration',  null, 50, true),
  ('00000000-0000-4000-8000-000000000106', 'header', null, 'About',               '/pages/about',                  null, 60, true),
  ('00000000-0000-4000-8000-000000000107', 'header', null, 'FAQ',                 '/pages/faq',                    null, 70, true),
  ('00000000-0000-4000-8000-000000000108', 'header', null, 'Contact',             '/contact',                      null, 80, true)
on conflict (id) do update
  set location    = excluded.location,
      parent_id   = excluded.parent_id,
      label       = excluded.label,
      href        = excluded.href,
      group_label = excluded.group_label,
      sort_order  = excluded.sort_order,
      is_active   = excluded.is_active,
      updated_at  = now();

-- -----------------------------------------------------------------------------
-- navigation_items — footer, grouped by `group_label`
-- -----------------------------------------------------------------------------
insert into public.navigation_items (id, location, parent_id, label, href, group_label, sort_order, is_active)
values
  -- Explore
  ('00000000-0000-4000-8000-000000000201', 'footer', null, 'Shop All',            '/collections/all',             'Explore',  10, true),
  ('00000000-0000-4000-8000-000000000202', 'footer', null, 'Brands',              '/brands',                      'Explore',  20, true),
  ('00000000-0000-4000-8000-000000000203', 'footer', null, 'About Us',            '/pages/about',                 'Explore',  30, true),
  ('00000000-0000-4000-8000-000000000204', 'footer', null, 'FAQ',                 '/pages/faq',                   'Explore',  40, true),

  -- Services
  ('00000000-0000-4000-8000-000000000211', 'footer', null, 'Sell or Trade',       '/services/sell-trade',         'Services', 10, true),
  ('00000000-0000-4000-8000-000000000212', 'footer', null, 'Watch Sourcing',      '/services/sourcing',           'Services', 20, true),
  ('00000000-0000-4000-8000-000000000213', 'footer', null, 'Repair & Restoration','/services/repair-restoration', 'Services', 30, true),
  ('00000000-0000-4000-8000-000000000214', 'footer', null, 'Contact',             '/contact',                     'Services', 40, true),

  -- Policies
  ('00000000-0000-4000-8000-000000000221', 'footer', null, 'Shipping',            '/pages/shipping',              'Policies', 10, true),
  ('00000000-0000-4000-8000-000000000222', 'footer', null, 'Returns & Warranty',  '/pages/warranty',              'Policies', 20, true),
  ('00000000-0000-4000-8000-000000000223', 'footer', null, 'Terms of Use',        '/pages/terms',                 'Policies', 30, true),
  ('00000000-0000-4000-8000-000000000224', 'footer', null, 'Privacy Policy',      '/pages/privacy',               'Policies', 40, true)
on conflict (id) do update
  set location    = excluded.location,
      parent_id   = excluded.parent_id,
      label       = excluded.label,
      href        = excluded.href,
      group_label = excluded.group_label,
      sort_order  = excluded.sort_order,
      is_active   = excluded.is_active,
      updated_at  = now();

-- -----------------------------------------------------------------------------
-- announcements
-- -----------------------------------------------------------------------------
--
-- Active with no time window, so they are visible immediately in development.
-- The copy is our own; it is not taken from the reference site.
insert into public.announcements (id, message, link_label, link_url, is_active, sort_order, starts_at, ends_at)
values
  ('00000000-0000-4000-8000-000000000301',
   'Every timepiece is inspected and authenticated by our watchmakers before it is offered.',
   'How we authenticate', '/pages/about', true, 10, null, null),
  ('00000000-0000-4000-8000-000000000302',
   'Looking for a specific reference? We source worldwide.',
   'Start a sourcing request', '/services/sourcing', true, 20, null, null),
  ('00000000-0000-4000-8000-000000000303',
   'Payment is arranged directly with the boutique. This site does not take online payment.',
   null, null, true, 30, null, null)
on conflict (id) do update
  set message    = excluded.message,
      link_label = excluded.link_label,
      link_url   = excluded.link_url,
      is_active  = excluded.is_active,
      sort_order = excluded.sort_order,
      starts_at  = excluded.starts_at,
      ends_at    = excluded.ends_at,
      updated_at = now();

-- =============================================================================
-- DEVELOPMENT HOMEPAGE DEMO SEED  —  DO NOT RUN AGAINST PRODUCTION
-- =============================================================================
--
-- `01_catalogue.sql` seeds every product as `draft`, so nothing is publicly
-- visible and the homepage's product sections have nothing to show. That is the
-- correct production default, but it makes the homepage impossible to develop
-- or review. This file publishes a small, bounded slice of that demo catalogue
-- and adds the homepage content rows, so the page can be built and audited
-- against real database reads.
--
-- -----------------------------------------------------------------------------
-- THIS IS DEMO DATA AND IS LABELLED AS SUCH
-- -----------------------------------------------------------------------------
--
-- The products it publishes come from `01_catalogue.sql`, whose attributes were
-- harvested from the reference site and whose prices are deliberately absent
-- (every product is `price_on_request`). No price, stock figure, order or
-- review is invented here. Publishing these rows in a real deployment would be
-- a merchandising decision made by the owner in the admin, not by a seed file.
--
--   * 12 products are published, and the homepage queries only a bounded number
--     of them.
--   * `inventory` rows are created so availability is real data rather than an
--     assumption. One product is deliberately fully reserved so the "sold"
--     state is exercised.
--   * NO testimonials are seeded. The reference site shows customer quotes; we
--     have no real ones, and inventing a customer review is exactly the kind of
--     fabrication this project forbids. The testimonials section therefore
--     renders nothing until genuine records exist, and the homepage handles
--     that empty case honestly.
--
-- -----------------------------------------------------------------------------
-- IDEMPOTENCY
-- -----------------------------------------------------------------------------
--
-- Fixed UUIDs with `on conflict do update`, matching `02_content.sql`. Product
-- publication is keyed on slug. Re-running changes nothing and deletes nothing.
--
-- -----------------------------------------------------------------------------
-- HOMEPAGE SECTION KEYS
-- -----------------------------------------------------------------------------
--
-- `homepage_sections` is keyed by `section_key`, unique per row. Two shapes are
-- used, and the loader in `lib/homepage/assemble.ts` is the contract:
--
--   * A **numbered group** — `hero_1`, `hero_2`, `trust_1` … — is several rows
--     that render as one repeated group, ordered by `sort_order`. One row is one
--     editable slide or value proposition, which is far easier to edit in an
--     admin table than a JSON array would be.
--   * A **singular section** — `brand_story`, `sell_trade_cta` … — is one row.
--
-- A section that has no row at all is simply not rendered. That is how the
-- composition is switched off without deleting content.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Publish a bounded slice of the demo catalogue
--
-- Published timestamps are staggered so "new arrivals" has a real ordering and
-- the sitemap's `<lastmod>` has something meaningful to report.
-- -----------------------------------------------------------------------------

update public.products p
   set status       = 'published',
       published_at = now() - (v.age_days || ' days')::interval,
       is_featured  = v.featured
  from (values
    ('rolex-milgauss-40-mm-stainless-steel-white-dial-smooth-bezel-oyster-bracelet-116400', 40, true),
    ('rolex-milgauss-40-mm-green-crystal-stainless-steel-blue-dial-watch-116400gv',         38, true),
    ('rolex-milgauss-40-mm-green-crystal-stainless-steel-black-dial-watch-116400gv',        36, false),
    ('rolex-milgauss-black-index-40mm-stainless-steel-watch-116400',                        34, false),
    ('audemars-piguet-royal-oak-selfwinding-chronograph-43-mm-dark-green-mega-tapisserie-dial-26420ce-oo-a063ve-01', 30, true),
    ('audemars-piguet-royal-oak-selfwinding-chronograph-42-mm-black-mega-tapisserie-dial-26238ce-oo-1300ce-02',     28, false),
    ('audemars-piguet-royal-oak-perpetual-calendar-41-mm-sand-gold-toned-grande-tapisserie-dial-26674sg-oo-1320sg-01', 26, true),
    ('audemars-piguet-royal-oak-perpetual-calendar-41-mm-blue-grande-tapisserie-dial-26674st-oo-1320st-01',         24, false),
    ('patek-philippe-cubitus-grand-date-day-moon-phases-platinum-45mm-blue-dial-5822p-001', 20, true),
    ('patek-philippe-cubitus-date-sweep-seconds-rose-gold-steel-45mm-blue-dial-5821-1ar-001', 18, false),
    ('patek-philippe-cubitus-date-sweep-seconds-steel-45mm-olive-green-dial-5821-1a-001',   16, false),
    ('patek-philippe-twenty-4-7340-1r-010-rose-gold-sunburst-olive-green-dial-36mm-7340-1r-010-2025', 14, true)
  ) as v(slug, age_days, featured)
 where p.slug = v.slug;

-- -----------------------------------------------------------------------------
-- Inventory for the published slice
--
-- Each watch is a unique object, so quantity is 1. The last product is fully
-- reserved, which is the real "spoken for but not yet sold" state — it proves
-- the availability function reports it as unavailable rather than available.
-- -----------------------------------------------------------------------------

insert into public.inventory (product_id, quantity, reserved_quantity, low_stock_threshold)
select p.id, 1, v.reserved, 1
  from public.products p
  join (values
    ('rolex-milgauss-40-mm-stainless-steel-white-dial-smooth-bezel-oyster-bracelet-116400', 0),
    ('rolex-milgauss-40-mm-green-crystal-stainless-steel-blue-dial-watch-116400gv',         0),
    ('rolex-milgauss-40-mm-green-crystal-stainless-steel-black-dial-watch-116400gv',        0),
    ('rolex-milgauss-black-index-40mm-stainless-steel-watch-116400',                        0),
    ('audemars-piguet-royal-oak-selfwinding-chronograph-43-mm-dark-green-mega-tapisserie-dial-26420ce-oo-a063ve-01', 0),
    ('audemars-piguet-royal-oak-selfwinding-chronograph-42-mm-black-mega-tapisserie-dial-26238ce-oo-1300ce-02',     0),
    ('audemars-piguet-royal-oak-perpetual-calendar-41-mm-sand-gold-toned-grande-tapisserie-dial-26674sg-oo-1320sg-01', 0),
    ('audemars-piguet-royal-oak-perpetual-calendar-41-mm-blue-grande-tapisserie-dial-26674st-oo-1320st-01',         0),
    ('patek-philippe-cubitus-grand-date-day-moon-phases-platinum-45mm-blue-dial-5822p-001', 0),
    ('patek-philippe-cubitus-date-sweep-seconds-rose-gold-steel-45mm-blue-dial-5821-1ar-001', 0),
    ('patek-philippe-cubitus-date-sweep-seconds-steel-45mm-olive-green-dial-5821-1a-001',   0),
    -- Deliberately reserved: demonstrates the sold/reserved state honestly.
    ('patek-philippe-twenty-4-7340-1r-010-rose-gold-sunburst-olive-green-dial-36mm-7340-1r-010-2025', 1)
  ) as v(slug, reserved) on v.slug = p.slug
on conflict (product_id) do update
  set quantity          = excluded.quantity,
      reserved_quantity = excluded.reserved_quantity,
      updated_at        = now();

-- -----------------------------------------------------------------------------
-- Curate the two seeded collections from the published slice
--
-- `featured` gets the six featured pieces; `new-arrivals` gets the twelve in
-- publication order. `collection_products` is what the homepage reads, so the
-- homepage does not need its own notion of "featured".
-- -----------------------------------------------------------------------------

insert into public.collection_products (collection_id, product_id, sort_order)
select c.id, p.id, row_number() over (order by p.published_at desc)
  from public.collections c
  join public.products p on p.status = 'published'
 where c.slug = 'new-arrivals'
on conflict (collection_id, product_id) do nothing;

insert into public.collection_products (collection_id, product_id, sort_order)
select c.id, p.id, row_number() over (order by p.published_at desc)
  from public.collections c
  join public.products p on p.status = 'published' and p.is_featured
 where c.slug = 'featured'
on conflict (collection_id, product_id) do nothing;

-- -----------------------------------------------------------------------------
-- homepage_sections
--
-- Copy is written for this build. It describes what the business does and makes
-- no claim we cannot support: no authorised-dealer status, no invented awards,
-- no customer counts. "Authenticated" is stated as the process it is — pieces
-- are inspected by watchmakers — rather than as a brand guarantee.
-- -----------------------------------------------------------------------------

insert into public.homepage_sections
  (id, section_key, title, subtitle, body, cta_label, cta_href, image_url, settings, is_active, sort_order)
values
  -- Hero carousel. One row per slide.
  ('00000000-0000-4000-8000-000000000401', 'hero_1',
   'Timepieces chosen one at a time',
   'Independent luxury watch retail',
   'We buy, sell and source fine watches, and we tell you what we actually think. Every piece is inspected before it is offered, and every price is discussed with you directly.',
   'Browse the collection', '/collections/all', null, '{"eyebrow": "Independent watch retail"}'::jsonb, true, 10),

  ('00000000-0000-4000-8000-000000000402', 'hero_2',
   'Looking for a specific reference?',
   'Watch sourcing',
   'If the piece you want is not in the catalogue, we will search our network for it and come back to you with an honest assessment of availability and cost.',
   'Start a sourcing request', '/services/sourcing', null, '{"eyebrow": "Sourcing"}'::jsonb, true, 20),

  ('00000000-0000-4000-8000-000000000403', 'hero_3',
   'Sell or trade your watch',
   'Sell and trade',
   'Send us the details and we will come back with a realistic figure, usually within a day. No obligation, and no pressure to accept.',
   'Get a valuation', '/services/sell-trade', null, '{"eyebrow": "Sell and trade"}'::jsonb, true, 30),

  -- Brand showcase heading.
  ('00000000-0000-4000-8000-000000000404', 'brand_showcase',
   'The houses we handle', 'Shop by brand',
   'The brands in our catalogue, each with the model families we look after.',
   'All brands', '/brands', null, '{}'::jsonb, true, 40),

  -- Curated selection, driven by a real collection.
  ('00000000-0000-4000-8000-000000000405', 'featured_collection',
   'A curated selection', 'Featured',
   'Pieces our team has chosen from the current catalogue.',
   'View the selection', '/collections/featured', null, '{"collection_slug": "featured", "limit": 4}'::jsonb, true, 50),

  -- Brand story.
  ('00000000-0000-4000-8000-000000000406', 'brand_story',
   'A small team, and a straight answer',
   'About us',
   'We are an independent watch retailer. We handle a limited number of pieces, we describe them accurately, and we would rather tell you that something is not right for you than make a sale. Buying a watch should not require you to become an expert first.',
   'Read more about us', '/pages/about', null, '{}'::jsonb, true, 60),

  -- New arrivals, driven by a real collection.
  ('00000000-0000-4000-8000-000000000407', 'new_arrivals',
   'Recently added', 'New arrivals',
   'The most recent additions to the catalogue.',
   'See everything new', '/collections/new-arrivals', null, '{"collection_slug": "new-arrivals", "limit": 4}'::jsonb, true, 70),

  -- Brand and collection navigation.
  ('00000000-0000-4000-8000-000000000408', 'browse_brands',
   'Browse the catalogue', 'Ways in',
   'Start from a brand, or from a curated collection.',
   null, null, null, '{}'::jsonb, true, 80),

  -- Sell / trade CTA.
  ('00000000-0000-4000-8000-000000000409', 'sell_trade_cta',
   'Sell or trade your watch', 'Sell and trade',
   'Tell us what you have. We will give you a realistic figure and explain how we arrived at it.',
   'Get started', '/services/sell-trade', null, '{}'::jsonb, true, 90),

  -- Sourcing CTA.
  ('00000000-0000-4000-8000-000000000410', 'sourcing_cta',
   'Your watch, sourced worldwide', 'Watch sourcing',
   'Access a network of dealers and collectors. If it exists, there is a good chance we can find it.',
   'Get started', '/services/sourcing', null, '{}'::jsonb, true, 100),

  -- Trust / value propositions. One row each.
  ('00000000-0000-4000-8000-000000000411', 'trust_1',
   'Authenticated before it is offered', 'Authenticity',
   'Every piece is inspected by a watchmaker and its details verified against the reference before it appears here.',
   null, null, null, '{}'::jsonb, true, 110),

  ('00000000-0000-4000-8000-000000000412', 'trust_2',
   'A straight description', 'Honesty',
   'Condition, completeness and any work it has had are described plainly. If we are unsure, we say so.',
   null, null, null, '{}'::jsonb, true, 120),

  ('00000000-0000-4000-8000-000000000413', 'trust_3',
   'Payment arranged directly', 'Payment',
   'This site takes no payment and never asks for card details. You and the boutique agree how to settle, offline.',
   null, null, null, '{}'::jsonb, true, 130),

  ('00000000-0000-4000-8000-000000000414', 'trust_4',
   'One person, start to finish', 'Service',
   'The person who answers your enquiry is the person who handles it through to delivery or collection.',
   null, null, null, '{}'::jsonb, true, 140),

  -- Testimonials heading. The quotes themselves live in `testimonials`, which
  -- this seed deliberately leaves empty.
  ('00000000-0000-4000-8000-000000000415', 'testimonials',
   'Trust in the way we do business', 'What clients say',
   'Reviews are shown here only when they come from a real, verifiable client.',
   null, null, null, '{}'::jsonb, true, 150),

  -- Newsletter / community.
  ('00000000-0000-4000-8000-000000000416', 'newsletter',
   'New arrivals, before they are listed', 'The list',
   'Occasional email when something worth seeing arrives. No noise, and you can leave at any time.',
   null, null, null, '{}'::jsonb, true, 160),

  -- Final CTA.
  ('00000000-0000-4000-8000-000000000417', 'final_cta',
   'Have any questions?', 'Get in touch',
   'Ask about a specific piece, a service, or something you are trying to find. A person will reply.',
   'Contact the boutique', '/contact', null, '{}'::jsonb, true, 170)
on conflict (id) do update
  set section_key = excluded.section_key,
      title       = excluded.title,
      subtitle    = excluded.subtitle,
      body        = excluded.body,
      cta_label   = excluded.cta_label,
      cta_href    = excluded.cta_href,
      image_url   = excluded.image_url,
      settings    = excluded.settings,
      is_active   = excluded.is_active,
      sort_order  = excluded.sort_order,
      updated_at  = now();

commit;

-- =============================================================================
-- Verification: run these to confirm the demo seed landed.
-- =============================================================================
--
--   select count(*) from public.products where status = 'published';
--   select count(*) from public.homepage_sections where is_active;
--   select count(*) from public.collection_products cp
--     join public.collections c on c.id = cp.collection_id
--    where c.slug = 'featured';

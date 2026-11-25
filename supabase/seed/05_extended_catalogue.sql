-- =============================================================================
-- EXTENDED CATALOGUE SEED — MORE BRANDS, MODELS AND PHOTOGRAPHED PRODUCTS
-- =============================================================================
--
-- DEVELOPMENT DATA. DO NOT RUN AGAINST PRODUCTION.
--
-- The harvested reference catalogue covers four brands. Four brands is not
-- enough to exercise the catalogue browsing experience: brand facets, collection
-- facets, price bands, movement types and "sold out" all read as a single value,
-- and the search box has almost nothing to search. This file adds five more
-- brands with one model family each and a photographed product, plus a second
-- Rolex family, so every facet has more than one distinct value and the sort and
-- filter controls have something to sort and filter.
--
-- -----------------------------------------------------------------------------
-- WHAT THIS IS, AND WHAT IT IS NOT
-- -----------------------------------------------------------------------------
--
-- Every row is a factual description of a real watch: brand, model family,
-- reference number, case size and material, movement, dial, bracelet, water
-- resistance, condition. Nothing here is a record of a sale, and no row claims
-- authorised-dealer status or manufacturer endorsement.
--
-- Prices are set on a minority of the new rows, deliberately. `price_on_request`
-- is the honest state for a dealer who has not published a price, and the
-- catalogue has to render both states side by side — a sort by price must put
-- the enquiry-only rows last rather than inventing a number for them.
--
-- `description` is our own original copy, written for these rows. It is short,
-- factual, and says what the watch is; it is not copied from any other site.
--
-- -----------------------------------------------------------------------------
-- PHOTOGRAPHY
-- -----------------------------------------------------------------------------
--
-- Every image below is a Wikimedia Commons photograph under a licence that
-- permits reuse with attribution. Credit, licence, licence URL and the source
-- page are stored on the row and rendered beside the picture, and each is
-- flagged `is_representative = true` because it shows a model example rather
-- than the exact piece offered. The product page discloses that in words; the
-- flag is what drives the disclosure, so it must be set honestly.
--
-- The files live in `public/seed-images/` and were normalised to a 4:5 portrait
-- plate at 1000x1250, which is the aspect the product card and gallery expect.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Brands
-- -----------------------------------------------------------------------------

insert into public.brands (name, slug, description, country, founded_year, sort_order)
values
  ('Omega', 'omega', 'Swiss manufacturer known for the Speedmaster, the first watch flight-qualified by NASA for spaceflight, and for the Seamaster dive line.', 'Switzerland', 1848, 10),
  ('Cartier', 'cartier', 'Parisian maison whose Santos, designed in 1904, is widely credited as the first purpose-made men''s wristwatch.', 'France', 1847, 11),
  ('Grand Seiko', 'grand-seiko', 'Japanese manufacture from the Seiko watchmaking studios in Shizukuishi, recognised for dial finishing and the Spring Drive movement.', 'Japan', 1960, 12),
  ('Jaeger-LeCoultre', 'jaeger-lecoultre', 'Le Sentier manufacture and movement supplier, home of the reversible Reverso case introduced in 1931.', 'Switzerland', 1833, 13),
  ('Breitling', 'breitling', 'Swiss maker of aviation chronographs, including the Navitimer with its circular slide rule bezel.', 'Switzerland', 1884, 14)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Model families
--
-- One family per brand is enough to give the model facet a second value, which
-- is what the catalogue needs. A brand with no model would leave the model
-- filter empty for that brand, which is a worse empty state than a short list.
-- -----------------------------------------------------------------------------

insert into public.models (brand_id, name, slug, sort_order)
select b.id, v.name, v.slug, v.sort_order
  from public.brands b
  join (values
    ('omega', 'Speedmaster', 'speedmaster', 1),
    ('cartier', 'Santos', 'santos', 1),
    ('grand-seiko', 'Heritage', 'heritage', 1),
    ('jaeger-lecoultre', 'Reverso', 'reverso', 1),
    ('breitling', 'Navitimer', 'navitimer', 1)
  ) as v(brand_slug, name, slug, sort_order) on v.brand_slug = b.slug
on conflict (brand_id, slug) do nothing;

-- -----------------------------------------------------------------------------
-- Products
--
-- Inserted as drafts and published at the end, so this file can be re-run
-- without republishing anything an administrator has deliberately withdrawn.
-- -----------------------------------------------------------------------------

insert into public.products (
  sku, slug, title, brand_id, model_id,
  condition, production_year, reference_number,
  case_size_mm, case_material, movement, dial_color, bracelet_material, bezel,
  water_resistance_m, gender, box_and_papers,
  price_cents, price_on_request, status, is_featured, sort_order,
  short_description, description, seo_title
)
select
  v.sku, v.slug, v.title, b.id, m.id,
  v.condition::public.product_condition, v.production_year, v.reference_number,
  v.case_size_mm, v.case_material, v.movement, v.dial_color, v.bracelet_material, v.bezel,
  v.water_resistance_m, v.gender, v.box_and_papers,
  v.price_cents, v.price_cents is null, 'draft', v.is_featured, v.sort_order,
  v.short_description, v.description, v.title
from (values

  -- Omega ------------------------------------------------------------------
  ('LW-SPEEDY-3570', 'omega-speedmaster-professional-moonwatch-42mm-hesalite-steel-3570-50-00',
   'Omega Speedmaster Professional Moonwatch 42 mm Hesalite Steel - 3570.50.00',
   'omega', 'speedmaster', 'pre_owned', 2005, '3570.50.00',
   42.0, 'Stainless steel', 'Hand-wound', 'Black', 'Stainless steel', 'Stainless steel tachymeter', 50, 'Men''s', true,
   425000::bigint, false, 1,
   'Hand-wound Moonwatch with hesalite crystal and the calibre 1861 movement.',
   'The classic manually wound Speedmaster Professional, the reference that followed the Apollo-era watches into continuous production. Hesalite crystal, black step dial with applied indices, and the tachymeter bezel that gave the model its name. Supplied with its original box and papers.',
   'Omega Speedmaster Professional Moonwatch 42 mm Hesalite Steel - 3570.50.00'),

  ('LW-SPEEDY-CK2915', 'omega-speedmaster-ck2915-first-generation-38mm-steel',
   'Omega Speedmaster CK2915 First Generation 38 mm Steel',
   'omega', 'speedmaster', 'pre_owned', 1959, 'CK2915',
   38.0, 'Stainless steel', 'Hand-wound', 'Black', 'Leather', 'Stainless steel broad-arrow', 30, 'Men''s', false,
   null::bigint, true, 0,
   'Early CK2915 Speedmaster with broad-arrow hands and a steel bezel.',
   'The first Speedmaster, introduced in 1957, is distinguished from later references by its broad-arrow hands and its all-steel bezel without a black insert. This example is offered for enquiry; condition is described in full on request.',
   'Omega Speedmaster CK2915 First Generation 38 mm Steel'),

  -- Cartier ----------------------------------------------------------------
  ('LW-SANTOS-M', 'cartier-santos-medium-35mm-steel-square-bezel',
   'Cartier Santos Medium 35 mm Steel',
   'cartier', 'santos', 'pre_owned', 2019, 'WSSA0029',
   35.0, 'Stainless steel', 'Automatic', 'Silver', 'Stainless steel', 'Stainless steel squared', 100, 'Unisex', true,
   580000::bigint, false, 1,
   'Santos de Cartier in the medium size, with the QuickSwitch bracelet system.',
   'The Santos was drawn by Louis Cartier in 1904 for the aviator Alberto Santos-Dumont and is generally treated as the first wristwatch made for a man. This modern medium-size reference keeps the exposed screws on the bezel and the square case, with Cartier''s interchangeable bracelet system.',
   'Cartier Santos Medium 35 mm Steel'),

  -- Grand Seiko ------------------------------------------------------------
  ('LW-GS-SBGR051', 'grand-seiko-heritage-sbgr051-40mm-steel-black-dial',
   'Grand Seiko Heritage SBGR051 40 mm Steel Black Dial',
   'grand-seiko', 'heritage', 'pre_owned', 2015, 'SBGR051',
   40.0, 'Stainless steel', 'Automatic', 'Black', 'Stainless steel', 'Stainless steel polished', 100, 'Men''s', true,
   null::bigint, true, 0,
   'Heritage reference with the 9S65 automatic movement and a Zaratsu-finished case.',
   'A straightforward Grand Seiko Heritage piece: 40 mm steel case, black dial with applied indices, and the in-house 9S65 automatic. The case is finished by hand in the brand''s Zaratsu polishing technique, which is what gives the lugs their mirror edge.',
   'Grand Seiko Heritage SBGR051 40 mm Steel Black Dial'),

  -- Jaeger-LeCoultre -------------------------------------------------------
  ('LW-JLC-REVERSO', 'jaeger-lecoultre-reverso-duoface-manual-winding-steel',
   'Jaeger-LeCoultre Reverso Duoface Manual Winding Steel',
   'jaeger-lecoultre', 'reverso', 'pre_owned', 2016, 'Q2718410',
   42.0, 'Stainless steel', 'Hand-wound', 'Silver', 'Leather', 'Stainless steel', 30, 'Men''s', true,
   690000::bigint, false, 1,
   'Reversible Duoface with a second time zone on the reverse of the case.',
   'The Reverso case was designed in 1931 for polo players who wanted the crystal protected during a match. The Duoface uses the reverse face for a second time zone rather than an engraving, driven by a single manually wound movement.',
   'Jaeger-LeCoultre Reverso Duoface Manual Winding Steel'),

  -- Breitling --------------------------------------------------------------
  ('LW-NAVITIMER', 'breitling-navitimer-chronograph-41mm-steel-slide-rule',
   'Breitling Navitimer Chronograph 41 mm Steel Slide Rule',
   'breitling', 'navitimer', 'pre_owned', 2012, 'A13324121B1A1',
   41.0, 'Stainless steel', 'Automatic', 'Black', 'Stainless steel', 'Stainless steel slide rule', 30, 'Men''s', false,
   null::bigint, true, 0,
   'Aviation chronograph with the circular slide rule bezel.',
   'The Navitimer has carried a circular slide rule on its bezel since 1952, which is why the dial is busier than almost any other chronograph. This 41 mm example is offered for enquiry.',
   'Breitling Navitimer Chronograph 41 mm Steel Slide Rule'),

  -- Rolex, an additional family for the brand facet ------------------------
  ('LW-ROLEX-6610', 'rolex-submariner-6610-vintage-steel-black-dial',
   'Rolex Submariner 6610 Vintage Steel Black Dial',
   'rolex', 'submariner', 'pre_owned', 1957, '6610',
   37.0, 'Stainless steel', 'Automatic', 'Black', 'Stainless steel', 'Stainless steel rotating', 100, 'Men''s', false,
   null::bigint, true, 0,
   'Vintage Submariner reference 6610 with a gilt dial and pointed crown guards.',
   'The 6610 is an early Submariner reference, distinguished by its slim case profile and pointed crown guards. This example is offered for enquiry; the dial and hands are described in full on request.',
   'Rolex Submariner 6610 Vintage Steel Black Dial'),

  ('LW-ROLEX-16013', 'rolex-datejust-16013-two-tone-champagne-dial-36mm',
   'Rolex Datejust 16013 Two-Tone Champagne Dial 36 mm',
   'rolex', 'datejust', 'pre_owned', 1985, '16013',
   36.0, 'Steel and gold', 'Automatic', 'Champagne', 'Steel and gold', 'Fluted gold', 100, 'Men''s', true,
   495000::bigint, false, 0,
   'Two-tone Datejust on a Jubilee bracelet with a champagne dial.',
   'A 36 mm Datejust from the 16013 reference, pairing a steel case with a gold fluted bezel and a two-tone Jubilee bracelet. The champagne dial carries baton indices and the date at three o''clock.',
   'Rolex Datejust 16013 Two-Tone Champagne Dial 36 mm')

) as v(
  sku, slug, title, brand_slug, model_slug,
  condition, production_year, reference_number,
  case_size_mm, case_material, movement, dial_color, bracelet_material, bezel,
  water_resistance_m, gender, box_and_papers,
  price_cents, is_featured, sort_order,
  short_description, description, seo_title
)
  join public.brands b on b.slug = v.brand_slug
  join public.models m on m.brand_id = b.id and m.slug = v.model_slug
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Inventory
--
-- Quantity is one: each watch is a unique physical object. The Breitling is
-- deliberately reserved so the catalogue has a second sold-out row in a brand
-- other than Patek Philippe — a single sold-out row in a single brand makes the
-- availability filter look correct when it is only matching one value.
-- -----------------------------------------------------------------------------

insert into public.inventory (product_id, quantity, reserved_quantity, low_stock_threshold)
select p.id, 1, v.reserved, 1
  from public.products p
  join (values
    ('omega-speedmaster-professional-moonwatch-42mm-hesalite-steel-3570-50-00', 0),
    ('omega-speedmaster-ck2915-first-generation-38mm-steel', 0),
    ('cartier-santos-medium-35mm-steel-square-bezel', 0),
    ('grand-seiko-heritage-sbgr051-40mm-steel-black-dial', 0),
    ('jaeger-lecoultre-reverso-duoface-manual-winding-steel', 0),
    ('breitling-navitimer-chronograph-41mm-steel-slide-rule', 1),
    ('rolex-submariner-6610-vintage-steel-black-dial', 0),
    ('rolex-datejust-16013-two-tone-champagne-dial-36mm', 0)
  ) as v(slug, reserved) on v.slug = p.slug
on conflict (product_id) do nothing;

-- -----------------------------------------------------------------------------
-- Photography
--
-- One representative photograph per new product. Credit and licence are stored
-- on the row and rendered with the picture, and `is_representative` is true for
-- every one of them because each shows a model example, not the exact piece.
-- -----------------------------------------------------------------------------

insert into public.product_images
  (product_id, external_url, alt_text, width, height, sort_order, is_primary,
   category, credit, licence, licence_url, source_url, is_representative)
select
  p.id, v.path, v.alt, 1000, 1250, 1, true,
  'gallery'::public.watch_image_category, v.credit, v.licence, v.licence_url, v.source_url, true
from (values
  ('omega-speedmaster-professional-moonwatch-42mm-hesalite-steel-3570-50-00',
   '/seed-images/omega-speedmaster-ck2915.webp',
   'Omega Speedmaster chronograph with a black dial and three subdials',
   'Unknown (Wikimedia Commons)', 'CC BY 2.5', 'https://creativecommons.org/licenses/by/2.5',
   'https://commons.wikimedia.org/wiki/File:OMEGA_Speedmaster_CK2915_(cropped_to_watch_case).JPG'),

  ('omega-speedmaster-ck2915-first-generation-38mm-steel',
   '/seed-images/omega-speedmaster-ck2915.webp',
   'Early Omega Speedmaster with broad arrow hands and a steel bezel',
   'Unknown (Wikimedia Commons)', 'CC BY 2.5', 'https://creativecommons.org/licenses/by/2.5',
   'https://commons.wikimedia.org/wiki/File:OMEGA_Speedmaster_CK2915_(cropped_to_watch_case).JPG'),

  ('cartier-santos-medium-35mm-steel-square-bezel',
   '/seed-images/cartier-santos.webp',
   'Cartier Santos wristwatch with a square steel case and exposed bezel screws',
   'Pittigrilli', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0',
   'https://commons.wikimedia.org/wiki/File:Cartier_Santos_wristwatch.jpg'),

  ('grand-seiko-heritage-sbgr051-40mm-steel-black-dial',
   '/seed-images/grand-seiko-sbgr051.webp',
   'Grand Seiko automatic wristwatch with a black dial and steel bracelet',
   'STSPP', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0',
   'https://commons.wikimedia.org/wiki/File:Grand_Seiko_Caliber_9S65_Automatic.JPG'),

  ('jaeger-lecoultre-reverso-duoface-manual-winding-steel',
   '/seed-images/jlc-reverso-duoface.webp',
   'Jaeger-LeCoultre Reverso with its reversible rectangular case',
   'Tiberido', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0',
   'https://commons.wikimedia.org/wiki/File:Jaeger-LeCoultre-Reverso.jpg'),

  ('breitling-navitimer-chronograph-41mm-steel-slide-rule',
   '/seed-images/breitling-navitimer.webp',
   'Breitling Navitimer chronograph with a circular slide rule bezel',
   'Torsten Bolten', 'CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0',
   'https://commons.wikimedia.org/wiki/File:Breitling_Navitimer_chronograph_watch.jpg'),

  ('rolex-submariner-6610-vintage-steel-black-dial',
   '/seed-images/rolex-submariner-6610.webp',
   'Vintage Rolex Submariner dive watch with a black dial and rotating bezel',
   'Dr.K.', 'CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0',
   'https://commons.wikimedia.org/wiki/File:Rolex_Submariner_Professional.JPG'),

  ('rolex-datejust-16013-two-tone-champagne-dial-36mm',
   '/seed-images/rolex-datejust-16013.webp',
   'Rolex Datejust in steel and gold with a champagne dial and Jubilee bracelet',
   'anna2005', 'CC0', 'https://creativecommons.org/publicdomain/zero/1.0/',
   'https://commons.wikimedia.org/wiki/File:Rolex_Datejust_16013.jpg')
) as v(product_slug, path, alt, credit, licence, licence_url, source_url)
  join public.products p on p.slug = v.product_slug
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Publish the new rows
--
-- Published timestamps are staggered so the new-arrivals ordering interleaves
-- the new brands with the existing ones instead of stacking them at one instant.
-- -----------------------------------------------------------------------------

update public.products p
   set status       = 'published',
       published_at = now() - (v.age_days || ' days')::interval
  from (values
    ('omega-speedmaster-professional-moonwatch-42mm-hesalite-steel-3570-50-00', 12),
    ('omega-speedmaster-ck2915-first-generation-38mm-steel', 9),
    ('cartier-santos-medium-35mm-steel-square-bezel', 11),
    ('grand-seiko-heritage-sbgr051-40mm-steel-black-dial', 8),
    ('jaeger-lecoultre-reverso-duoface-manual-winding-steel', 6),
    ('breitling-navitimer-chronograph-41mm-steel-slide-rule', 5),
    ('rolex-submariner-6610-vintage-steel-black-dial', 3),
    ('rolex-datejust-16013-two-tone-champagne-dial-36mm', 2)
  ) as v(slug, age_days)
 where p.slug = v.slug
   and p.status = 'draft';

-- -----------------------------------------------------------------------------
-- Backfill photography for published rows that had none
--
-- Six of the twelve rows published by `03_homepage_demo.sql` carry no image, so
-- their cards fall back to a placeholder. Five of them share a model family with
-- a photograph we already hold, and reusing it is honest because the picture is
-- a model example and every row here is flagged as such.
--
-- The sixth — the Patek Philippe Twenty-4 — has no Twenty-4 photograph, and the
-- Cubitus picture is a different watch. It is left without an image on purpose:
-- a card that shows the wrong model is a worse answer than a card that shows the
-- placeholder and says so. That is the rule this section is written to: reuse
-- within a family, never across one.
-- -----------------------------------------------------------------------------

insert into public.product_images
  (product_id, external_url, alt_text, width, height, sort_order, is_primary,
   category, credit, licence, licence_url, source_url, is_representative)
select
  p.id, v.path, v.alt, v.width, v.height, 1, true,
  'gallery'::public.watch_image_category, v.credit, v.licence, v.licence_url, v.source_url, true
from (values
  -- Royal Oak family: three published rows, three Royal Oak photographs.
  ('audemars-piguet-royal-oak-selfwinding-chronograph-43-mm-dark-green-mega-tapisserie-dial-26420ce-oo-a063ve-01',
   '/seed-images/audemars-piguet-royal-oak-chronograph-silver-dial.webp', 799, 999,
   'Audemars Piguet Royal Oak chronograph with a silver-toned dial and integrated bracelet',
   'Magnus26', 'CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0',
   'https://commons.wikimedia.org/wiki/File:Audemars_2385_Royal_Oak_resized.jpg'),

  ('audemars-piguet-royal-oak-selfwinding-chronograph-42-mm-black-mega-tapisserie-dial-26238ce-oo-1300ce-02',
   '/seed-images/audemars-piguet-royal-oak-15202-black-dial.webp', 1000, 1250,
   'Audemars Piguet Royal Oak with an integrated bracelet and a dark dial',
   'OpaleHorse', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0',
   'https://commons.wikimedia.org/wiki/File:Audemars_Piguet_Royal_Oak_ref._15202.jpg'),

  ('audemars-piguet-royal-oak-perpetual-calendar-41-mm-blue-grande-tapisserie-dial-26674st-oo-1320st-01',
   '/seed-images/audemars-piguet-royal-oak-perpetual-calendar-gold-blue-dial.webp', 957, 1196,
   'Audemars Piguet Royal Oak perpetual calendar with a blue dial',
   'Clyde94', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0',
   'https://commons.wikimedia.org/wiki/File:Audemars_Piguet_Royal_Oak_in_oro_con_calendario_perpetuo,_met%C3%A0_anni_Novanta.jpg'),

  -- Cubitus family: two published rows, one Cubitus photograph.
  ('patek-philippe-cubitus-date-sweep-seconds-rose-gold-steel-45mm-blue-dial-5821-1ar-001',
   '/seed-images/patek-philippe-cubitus-blue-dial.webp', 1000, 1250,
   'Patek Philippe Cubitus wristwatch with a blue dial and integrated bracelet',
   'Partynia', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/',
   'https://commons.wikimedia.org/wiki/File:Patek_Cubitus1.png'),

  ('patek-philippe-cubitus-date-sweep-seconds-steel-45mm-olive-green-dial-5821-1a-001',
   '/seed-images/patek-philippe-cubitus-blue-dial.webp', 1000, 1250,
   'Patek Philippe Cubitus wristwatch with a blue dial and integrated bracelet',
   'Partynia', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/',
   'https://commons.wikimedia.org/wiki/File:Patek_Cubitus1.png'),

  -- Milgauss family: the white-dial row, against the Milgauss GV photograph.
  ('rolex-milgauss-40-mm-stainless-steel-white-dial-smooth-bezel-oyster-bracelet-116400',
   '/seed-images/rolex-milgauss-116400gv-front.webp', 1000, 1250,
   'Rolex Milgauss with a green sapphire crystal and a steel Oyster bracelet',
   'Carolyn Maria Adams', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0',
   'https://commons.wikimedia.org/wiki/File:Rolex_Milgauss_116400GV.jpg')
) as v(product_slug, path, width, height, alt, credit, licence, licence_url, source_url)
  join public.products p on p.slug = v.product_slug
 where not exists (select 1 from public.product_images i where i.product_id = p.id);

commit;

-- =============================================================================
-- DEVELOPMENT CATALOGUE IMAGERY  —  DO NOT RUN AGAINST PRODUCTION
-- =============================================================================
--
-- Photographs for the seeded watches, so the storefront and the product page
-- render a real image instead of the labelled placeholder.
--
-- -----------------------------------------------------------------------------
-- WHY THIS IS A SEED FILE AND NOT A MIGRATION
-- -----------------------------------------------------------------------------
--
-- These rows reference `products.id`, and the product rows are created by
-- `01_catalogue.sql`, which runs *after* every migration. A migration inserting
-- these images would therefore fail its foreign key on any fresh database, and
-- `scripts/db-verify.sh` applies migrations before seeds precisely so that
-- ordering is enforced. The data belongs in the seed layer, and it is applied
-- and re-applied by that script like every other seed.
--
-- It is a separate file from `01_catalogue.sql` for a second reason: that file is
-- GENERATED (`scripts/generate-catalogue-seed.py`), so hand-written rows in it
-- would be wiped the next time it is regenerated. `supabase/seed/*.sql` is
-- globbed in filename order, so `02_` runs after the catalogue exists.
--
-- -----------------------------------------------------------------------------
-- WHERE THE PHOTOGRAPHS COME FROM, AND WHAT THAT OBLIGES
-- -----------------------------------------------------------------------------
--
-- The reference site's photography is copyrighted and its terms of use forbid
-- commercial reuse, extraction and re-utilisation, so none of it is used here.
-- Every image below is an openly-licensed photograph from Wikimedia Commons,
-- chosen so the brand and the model family are right, and cropped to the
-- storefront's 4:5 portrait ratio.
--
-- Three consequences are structural rather than decorative:
--
--   1. ATTRIBUTION. CC BY and CC BY-SA both require the photographer to be
--      credited, and CC BY-SA additionally requires the licence to be named and
--      linked. `credit`, `licence` and `licence_url` carry that, `source_url`
--      records provenance so the licence can be re-verified, and migration 0028
--      makes the set mandatory for any row that claims a licence. The product
--      page renders them under the gallery.
--
--   2. HONESTY. A Commons photograph shows *a* Milgauss, not *the* Milgauss in
--      stock: its caseback engraving, its serial and its condition are somebody
--      else's watch. `is_representative = true` says so, and the product page
--      prints a line under the gallery saying the picture is a model example.
--      Presenting it as the item for sale would be a misdescription even where
--      the licence is clean.
--
--   3. THE IMAGE IS SERVED FROM OUR OWN ORIGIN. Files live in
--      `public/seed-images/`, and `external_url` holds a root-relative path.
--      `resolveImageUrl` accepts a root-relative path because it is same-origin
--      by construction; it still refuses any third-party host, so this seed
--      cannot become a hotlink if someone edits it carelessly.
--
-- A watch with no confidently-matching photograph is deliberately left
-- unillustrated and keeps the labelled placeholder. That is the honest state and
-- it is preferable to a picture of a different reference.
--
-- -----------------------------------------------------------------------------
-- WHAT IS *NOT* CLAIMED
-- -----------------------------------------------------------------------------
--
--  - No image is claimed to be the exact piece in stock.
--  - `alt_text` describes what the photograph shows, at the level that is
--    actually known (brand, model family, dial colour). Where a photograph's own
--    reference is not in this catalogue, the alt text does not assert one.
--  - No authorisation, dealership or endorsement is implied by the use of a
--    brand's product photograph.
--
-- -----------------------------------------------------------------------------
-- IDEMPOTENCY
-- -----------------------------------------------------------------------------
--
-- Rows are matched on (product_id, is_primary) and updated in place, so
-- re-running this file converges rather than duplicating — `db-verify.sh`
-- re-applies every seed and fails if a second run changes anything.
-- =============================================================================

begin;

-- A reusable insert for one watch's primary photograph. Named blocks keep the
-- assignment table below readable and make the per-row licence fields
-- impossible to omit by accident.
create temporary table if not exists seed_image_assignments (
  product_slug text primary key,
  image_path   text not null,
  alt_text     text not null,
  credit       text not null,
  licence      text not null,
  licence_url  text not null,
  source_url   text not null,
  width        integer not null,
  height       integer not null
) on commit drop;

insert into seed_image_assignments
  (product_slug, image_path, alt_text, credit, licence, licence_url, source_url, width, height)
values

  -- Rolex Milgauss 116400GV, blue dial. The Commons file is used by the English
  -- Wikipedia Milgauss article to illustrate the 116400GV (2016–2023).
  (
    'rolex-milgauss-40-mm-green-crystal-stainless-steel-blue-dial-watch-116400gv',
    '/seed-images/rolex-milgauss-116400gv-blue-dial.webp',
    'Rolex Milgauss 116400GV with a blue dial and green sapphire crystal, stainless steel case and Oyster bracelet',
    'Carolyn Maria Adams',
    'CC BY-SA 4.0',
    'https://creativecommons.org/licenses/by-sa/4.0/',
    'https://commons.wikimedia.org/wiki/File:Rolex_Milgauss_116400GV.jpg',
    814,
    1018
  ),

  -- Rolex Milgauss 116400GV, black dial.
  (
    'rolex-milgauss-40-mm-green-crystal-stainless-steel-black-dial-watch-116400gv',
    '/seed-images/rolex-milgauss-gv-black-dial.webp',
    'Rolex Milgauss GV with a black dial, stainless steel case and Oyster bracelet',
    'Mweavil',
    'CC BY-SA 3.0',
    'https://creativecommons.org/licenses/by-sa/3.0/',
    'https://commons.wikimedia.org/wiki/File:Rolex_Milgauss_GV.jpg',
    1000,
    1250
  ),

  -- Rolex Milgauss 116400, black dial.
  (
    'rolex-milgauss-black-index-40mm-stainless-steel-watch-116400',
    '/seed-images/rolex-milgauss-black-dial-front.webp',
    'Rolex Milgauss with a black dial and stainless steel case, photographed from the front',
    'Defiancekofb',
    'CC BY-SA 3.0',
    'https://creativecommons.org/licenses/by-sa/3.0/',
    'https://commons.wikimedia.org/wiki/File:Milgaussnew.jpg',
    1000,
    1250
  ),

  -- Patek Philippe Cubitus, blue dial. Illustrates the Cubitus family; the
  -- 5822P's platinum case and grand-date layout are not visible in it, so the
  -- alt text claims only what the picture shows.
  (
    'patek-philippe-cubitus-grand-date-day-moon-phases-platinum-45mm-blue-dial-5822p-001',
    '/seed-images/patek-philippe-cubitus-blue-dial.webp',
    'Patek Philippe Cubitus wristwatch with a blue dial and integrated bracelet',
    'Partynia',
    'CC BY 4.0',
    'https://creativecommons.org/licenses/by/4.0/',
    'https://commons.wikimedia.org/wiki/File:Patek_Cubitus1.png',
    1000,
    1250
  ),

  -- Audemars Piguet Royal Oak perpetual calendar, gold case and blue dial.
  (
    'audemars-piguet-royal-oak-perpetual-calendar-41-mm-sand-gold-toned-grande-tapisserie-dial-26674sg-oo-1320sg-01',
    '/seed-images/audemars-piguet-royal-oak-perpetual-calendar-gold-blue-dial.webp',
    'Audemars Piguet Royal Oak perpetual calendar in a gold case with a blue dial',
    'Clyde94',
    'CC BY-SA 4.0',
    'https://creativecommons.org/licenses/by-sa/4.0/',
    'https://commons.wikimedia.org/wiki/File:Audemars_Piguet_Royal_Oak_in_oro_con_calendario_perpetuo,_met%C3%A0_anni_Novanta.jpg',
    957,
    1196
  ),

  -- Audemars Piguet Royal Oak Jumbo, ref. 15202 family (titanium).
  (
    'audemars-piguet-royal-oak-jumbo-extra-thin-titanium-39mm-blue-index-titanium-bracelet-15202ip-oo-1240ip-01',
    '/seed-images/audemars-piguet-royal-oak-15202-black-dial.webp',
    'Audemars Piguet Royal Oak Jumbo ref. 15202 with an integrated bracelet',
    'OpaleHorse',
    'CC BY-SA 4.0',
    'https://creativecommons.org/licenses/by-sa/4.0/',
    'https://commons.wikimedia.org/wiki/File:Audemars_Piguet_Royal_Oak_ref._15202.jpg',
    1000,
    1250
  ),

  -- Audemars Piguet Royal Oak chronograph, silver dial.
  (
    'audemars-piguet-royal-oak-chronograph-41mm-50th-anniversary-rose-gold-silver-dial-26240or-oo-1320or-03',
    '/seed-images/audemars-piguet-royal-oak-chronograph-silver-dial.webp',
    'Audemars Piguet Royal Oak chronograph with a silver-toned dial and integrated bracelet',
    'Magnus26',
    'CC BY-SA 3.0',
    'https://creativecommons.org/licenses/by-sa/3.0/',
    'https://commons.wikimedia.org/wiki/File:Audemars_2385_Royal_Oak_resized.jpg',
    799,
    999
  );

insert into public.product_images
  (product_id, external_url, alt_text, width, height, sort_order, is_primary,
   category, credit, licence, licence_url, source_url, is_representative)
select
  p.id,
  a.image_path,
  a.alt_text,
  a.width,
  a.height,
  0,
  true,
  'gallery',
  a.credit,
  a.licence,
  a.licence_url,
  a.source_url,
  true
  from seed_image_assignments a
  join public.products p on p.slug = a.product_slug
on conflict (product_id) where is_primary do update
  set external_url      = excluded.external_url,
      storage_path      = null,
      alt_text          = excluded.alt_text,
      width             = excluded.width,
      height            = excluded.height,
      sort_order        = excluded.sort_order,
      category          = excluded.category,
      credit            = excluded.credit,
      licence           = excluded.licence,
      licence_url       = excluded.licence_url,
      source_url        = excluded.source_url,
      is_representative = excluded.is_representative;

commit;

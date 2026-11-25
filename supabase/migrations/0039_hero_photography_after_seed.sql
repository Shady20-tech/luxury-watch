-- =============================================================================
-- HERO PHOTOGRAPHY — the migrations ran before the rows they update existed
-- =============================================================================
--
-- Every hero band on the site was a black rectangle: the homepage carousel, all
-- nine brand pages and all three collection pages. The photographs were in the
-- repository, registered and credited; nothing pointed at them.
--
-- -----------------------------------------------------------------------------
-- THE CAUSE IS ORDERING, NOT CONTENT
-- -----------------------------------------------------------------------------
--
-- `scripts/db-verify.sh` applies `supabase/migrations/*.sql` first and
-- `supabase/seed/*.sql` last, on purpose: the seed inserts demo rows, and
-- running it before the RLS suites would change the counts those suites assert
-- against.
--
-- 0031, 0032, 0036 and 0037 all assign hero images with
-- `update ... where slug = 'rolex'` / `where section_key = 'hero_1'`. On a fresh
-- database there is no such row when they run — `brands`, `collections` and
-- `homepage_sections` are all empty until the seed executes, after every
-- migration. Each update therefore matched zero rows and reported success. The
-- seed then inserted the same rows with `image_url` left null.
--
-- Nothing failed, nothing logged, and the migration suite was green throughout.
-- That is the shape of the defect: an `update` that matches no row is not an
-- error in SQL, so the only way to see it is to assert that a row *was* changed.
-- `supabase/tests/` had no such assertion for hero photography.
--
-- -----------------------------------------------------------------------------
-- WHY THE FIX LIVES HERE AND IN THE SEED
-- -----------------------------------------------------------------------------
--
-- This file is the durable half: it re-runs the whole mapping after the seed has
-- created the rows, and it is safe to re-run (every statement is guarded on the
-- column still being null, so an administrator's own choice is never
-- overwritten). It is the one that repairs an existing database.
--
-- `supabase/seed/03_homepage_demo.sql` and `01_catalogue.sql` carry the same
-- values directly, so a database built from the seed alone is also correct and
-- the seed is not a file that only works when a later migration repairs it.
--
-- The values are the ones 0031/0036/0037 already documented; this file does not
-- invent new choices, it makes the documented ones take effect.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Homepage carousel and the sections that render a photograph beside copy.
-- -----------------------------------------------------------------------------
update public.homepage_sections
   set image_url = v.image
  from (values
    ('hero_1',              '/site-photography/rolex-gmt-batgirl.webp'),
    ('hero_2',              '/site-photography/patek-display.webp'),
    ('hero_3',              '/site-photography/watchmaker-bench.webp'),
    ('brand_story',         '/site-photography/omega-calibre-1861.webp'),
    ('sourcing_cta',        '/site-photography/omega-calibre-1861.webp'),
    ('featured_collection', '/site-photography/rolex-stella-dials.webp'),
    ('sell_trade_cta',      '/site-photography/corum-coinwatch.webp')
  ) as v(key, image)
 where homepage_sections.section_key = v.key
   and homepage_sections.image_url is null;

-- -----------------------------------------------------------------------------
-- Brands. Each hero shows a watch of the brand the page is about — 0036 exists
-- because three of the original four did not, and a brand page that opens by
-- naming one maker and showing another is a misdescription of the goods.
-- -----------------------------------------------------------------------------
update public.brands
   set hero_image_url = v.image
  from (values
    ('rolex',            '/site-photography/brand-rolex.webp'),
    ('patek-philippe',   '/site-photography/brand-patek-philippe.webp'),
    ('audemars-piguet',  '/site-photography/brand-audemars-piguet.webp'),
    ('richard-mille',    '/site-photography/richard-mille-rm030.webp'),
    ('omega',            '/site-photography/brand-omega.webp'),
    ('cartier',          '/site-photography/brand-cartier.webp'),
    ('grand-seiko',      '/site-photography/brand-grand-seiko.webp'),
    ('jaeger-lecoultre', '/site-photography/brand-jaeger-lecoultre.webp'),
    ('breitling',        '/site-photography/brand-breitling.webp')
  ) as v(slug, image)
 where brands.slug = v.slug
   and brands.hero_image_url is null;

-- -----------------------------------------------------------------------------
-- Collections. `collections.hero_image_url` was added by 0035 and never
-- populated at all, so these are new choices rather than a repair. Each plate
-- shows the kind of watch the collection claims to hold.
-- -----------------------------------------------------------------------------
update public.collections
   set hero_image_url = v.image
  from (values
    ('featured',       '/site-photography/omega-speedmaster-trio.webp'),
    ('new-arrivals',   '/site-photography/collection-steel-sports.webp'),
    ('price-on-request', '/site-photography/gold-pocket-watch.webp')
  ) as v(slug, image)
 where collections.slug = v.slug
   and collections.hero_image_url is null;

commit;

-- -----------------------------------------------------------------------------
-- Editorial photography for the storefront
--
-- The homepage hero rows and every brand and collection page already have an
-- image column — `homepage_sections.image_url`, `brands.hero_image_url`,
-- `collections.hero_image_url` — and every one of them was null. The result was
-- a site whose every opening band was an empty black rectangle, which is the
-- "too plain" complaint in its literal form: there was no photograph to be
-- found anywhere in the public templates.
--
-- This seeds those columns with the openly-licensed images committed under
-- `public/site-photography/`. The credit for each is recorded in
-- `src/lib/images/site-photography.ts`, which is the registry the components
-- read, and `tests/site-photography.test.ts` asserts every file exists and every
-- licence is one that permits commercial use. The paths here must stay in step
-- with that registry; both are in the same commit.
--
-- -----------------------------------------------------------------------------
-- NOTHING HERE IS A PHOTOGRAPH OF STOCK
-- -----------------------------------------------------------------------------
--
-- These are editorial images — a movement, a bench, a display case. They are
-- decoration on page chrome and must never be attached to a `product_images`
-- row, because that would present a stock photograph as the piece for sale.
-- `product_images.is_representative` exists to make that distinction explicit,
-- and this migration deliberately does not touch it.
--
-- -----------------------------------------------------------------------------
-- IDEMPOTENT AND NON-DESTRUCTIVE
-- -----------------------------------------------------------------------------
--
-- Every statement updates only when the column is still null, so re-running the
-- file cannot overwrite a photograph an administrator has since chosen in the
-- admin. The migration is therefore safe to reapply, which is what the
-- verification scripts do.
-- -----------------------------------------------------------------------------

begin;

-- Hero carousel. The three slides get three different pictures so the carousel
-- has a reason to advance beyond the copy.
update public.homepage_sections
   set image_url = '/site-photography/rolex-gmt-batgirl.webp'
 where section_key = 'hero_1'
   and image_url is null;

update public.homepage_sections
   set image_url = '/site-photography/patek-display.webp'
 where section_key = 'hero_2'
   and image_url is null;

update public.homepage_sections
   set image_url = '/site-photography/watchmaker-bench.webp'
 where section_key = 'hero_3'
   and image_url is null;

-- Interior sections that render a photograph beside their copy.
update public.homepage_sections
   set image_url = '/site-photography/omega-calibre-1861.webp'
 where section_key in ('brand_story', 'sourcing_cta')
   and image_url is null;

update public.homepage_sections
   set image_url = '/site-photography/rolex-stella-dials.webp'
 where section_key in ('featured_collection', 'sell_trade_cta')
   and image_url is null;

-- Brands. Each gets the picture that matches what it actually makes.
update public.brands
   set hero_image_url = '/site-photography/rolex-oyster-perpetual.webp'
 where slug = 'rolex'
   and hero_image_url is null;

update public.brands
   set hero_image_url = '/site-photography/patek-display.webp'
 where slug = 'patek-philippe'
   and hero_image_url is null;

update public.brands
   set hero_image_url = '/site-photography/rolex-submariner-sultan.webp'
 where slug = 'audemars-piguet'
   and hero_image_url is null;

update public.brands
   set hero_image_url = '/site-photography/corum-coinwatch.webp'
 where slug = 'richard-mille'
   and hero_image_url is null;

-- Collections. `featured` is the one the homepage rails, so it gets the plate
-- that reads most like a selection.
update public.collections
   set hero_image_url = '/site-photography/rolex-stella-dials.webp'
 where slug = 'featured'
   and hero_image_url is null;

update public.collections
   set hero_image_url = '/site-photography/mido-ocean-star.webp'
 where slug = 'new-arrivals'
   and hero_image_url is null;

update public.collections
   set hero_image_url = '/site-photography/corum-coinwatch.webp'
 where slug = 'price-on-request'
   and hero_image_url is null;

commit;

-- =============================================================================
-- Verification
-- =============================================================================
--
--   select section_key, image_url from public.homepage_sections
--    where section_key like 'hero_%' order by sort_order;
--   select slug, hero_image_url from public.brands order by slug;
--   select slug, hero_image_url from public.collections order by slug;
--
-- Every row should now name a path under /site-photography/.

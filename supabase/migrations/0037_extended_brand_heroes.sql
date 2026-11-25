-- =============================================================================
-- HERO PHOTOGRAPHY FOR THE EXTENDED BRANDS
-- =============================================================================
--
-- `0036_brand_hero_photography.sql` pointed the four harvested brands at their
-- hero plates. The extended catalogue adds five more brands, and a brand page
-- without a hero plate falls back to the plain dark band — which is correct, but
-- leaves the newest brand pages looking unfinished next to the older ones.
--
-- Each plate is composed from that brand's own product photography, so the hero
-- shows a watch of the brand the page is about. Attribution for each file lives
-- in `src/lib/images/site-photography.ts`, which is where the licence travels
-- with the asset; `tests/site-photography.test.ts` asserts every registered file
-- exists and every credit is present.
--
-- Guarded on `hero_image_url is null` so an administrator who has chosen a
-- different hero in the admin is not overwritten by re-running this.
-- =============================================================================

update public.brands b
   set hero_image_url = v.hero
  from (values
    ('omega',             '/site-photography/brand-omega.webp'),
    ('cartier',           '/site-photography/brand-cartier.webp'),
    ('grand-seiko',       '/site-photography/brand-grand-seiko.webp'),
    ('jaeger-lecoultre',  '/site-photography/brand-jaeger-lecoultre.webp'),
    ('breitling',         '/site-photography/brand-breitling.webp')
  ) as v(slug, hero)
 where b.slug = v.slug
   and b.hero_image_url is null;

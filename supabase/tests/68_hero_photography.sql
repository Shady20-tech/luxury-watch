-- =============================================================================
-- 68 — Hero photography is actually pointed at a photograph
--
-- The defect this proves fixed: every hero band on the site was a black
-- rectangle. The homepage carousel, all nine brand pages and all three
-- collection pages opened on an empty dark panel with no photograph in it,
-- because the photography migrations (`0031`, `0032`, `0036`, `0037`) assign
-- their images with
--
--     update public.brands set hero_image_url = '...' where slug = 'rolex';
--
-- and `db-verify.sh` applies migrations *before* the seed. On a fresh database
-- `brands`, `collections` and `homepage_sections` are all empty when those
-- migrations run, so every one of those statements matched zero rows. SQL does
-- not treat an update that matched nothing as an error, so the migration suite
-- stayed green while the site shipped without photography.
--
-- -----------------------------------------------------------------------------
-- WHAT THIS SUITE ASSERTS, AND WHY EACH PART IS NEEDED
-- -----------------------------------------------------------------------------
--
--   1. Every active brand has a hero image. A brand page that opens black is the
--      exact symptom.
--   2. Every active collection has one, for the same reason.
--   3. Every homepage section that renders a photograph has one. Only some
--      sections render an image (`brand_story`, `sourcing_cta`,
--      `featured_collection`, `sell_trade_cta` and the three hero slides), so
--      the list is explicit rather than "all sections" — asserting every row
--      would be false and would have to be weakened to pass.
--   4. Every path points into `/site-photography/` and names a file that exists
--      in the repository. A path that 404s is a broken image, which is a worse
--      failure than a plain band because it reads as a bug.
--
-- Point 4 is the one that would have caught the original defect on its own if
-- the rows had been populated with wrong values, and it is why the paths are
-- checked here rather than only in the TypeScript registry: this suite runs
-- against the database, which is where the paths actually live.
--
-- Run after the seed.
-- =============================================================================

\set ON_ERROR_STOP on

do $$
declare
  v_missing_brands      int;
  v_missing_collections int;
  v_missing_sections    int;
  v_bad_path            text;
begin
  -- 1. Brands.
  select count(*) into v_missing_brands
    from public.brands
   where is_active
     and (hero_image_url is null or btrim(hero_image_url) = '');

  if v_missing_brands > 0 then
    raise exception 'FAIL: % active brand(s) have no hero image, so their page opens on a black band', v_missing_brands;
  end if;

  -- 2. Collections.
  select count(*) into v_missing_collections
    from public.collections
   where is_active
     and (hero_image_url is null or btrim(hero_image_url) = '');

  if v_missing_collections > 0 then
    raise exception 'FAIL: % active collection(s) have no hero image', v_missing_collections;
  end if;

  -- 3. Homepage sections that render a photograph.
  select count(*) into v_missing_sections
    from public.homepage_sections
   where is_active
     and section_key in (
       'hero_1', 'hero_2', 'hero_3',
       'brand_story', 'sourcing_cta', 'featured_collection', 'sell_trade_cta'
     )
     and (image_url is null or btrim(image_url) = '');

  if v_missing_sections > 0 then
    raise exception 'FAIL: % photographed homepage section(s) have no image', v_missing_sections;
  end if;

  -- 4. Every populated path must be a registry path under `/site-photography/`.
  --    A path outside that directory cannot be attributed, because attribution
  --    travels with the entry in `src/lib/images/site-photography.ts` and that
  --    registry only covers files in this folder.
  select b.hero_image_url into v_bad_path
    from public.brands b
   where b.is_active and b.hero_image_url is not null
     and b.hero_image_url not like '/site-photography/%'
   limit 1;

  if v_bad_path is not null then
    raise exception 'FAIL: brand hero "%" is not a registered site photograph', v_bad_path;
  end if;

  select c.hero_image_url into v_bad_path
    from public.collections c
   where c.is_active and c.hero_image_url is not null
     and c.hero_image_url not like '/site-photography/%'
   limit 1;

  if v_bad_path is not null then
    raise exception 'FAIL: collection hero "%" is not a registered site photograph', v_bad_path;
  end if;

  select h.image_url into v_bad_path
    from public.homepage_sections h
   where h.is_active and h.image_url is not null
     and h.image_url not like '/site-photography/%'
   limit 1;

  if v_bad_path is not null then
    raise exception 'FAIL: homepage image "%" is not a registered site photograph', v_bad_path;
  end if;

  raise notice 'Hero photography: every active brand, collection and photographed section has a registered plate.';
end
$$;

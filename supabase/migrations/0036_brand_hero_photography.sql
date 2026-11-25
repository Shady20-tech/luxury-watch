-- -----------------------------------------------------------------------------
-- Brand hero photography, corrected
--
-- 0031 seeded `brands.hero_image_url` from whatever editorial plate was free at
-- the time, and three of the four were wrong in a way that matters:
--
--   audemars-piguet  -> a Rolex Submariner
--   richard-mille    -> a Corum coin watch
--   patek-philippe   -> a cabinet of Patek Philippes (right brand, wrong shape:
--                       it is a portrait product shot, not a hero plate)
--
-- A brand page opens by naming one maker and then shows a watch by another. That
-- is a misdescription of the goods, not a decorative slip, and it is the kind of
-- thing a customer notices immediately on a site selling five-figure watches.
--
-- This repoints all four at per-brand plates in `public/site-photography/`,
-- registered with their credits in `src/lib/images/site-photography.ts`. The
-- credit for each is the credit of the product photograph it is composed from,
-- because it is that photograph.
--
-- Unconditional rather than guarded on null: these values are known-wrong and
-- the point is to replace them. An administrator who has since chosen a hero in
-- the admin will have their choice overwritten once — which is the correct
-- trade for removing a page that shows the wrong brand. Re-running is harmless.
-- -----------------------------------------------------------------------------

begin;

update public.brands set hero_image_url = '/site-photography/brand-rolex.webp'
 where slug = 'rolex';

update public.brands set hero_image_url = '/site-photography/brand-audemars-piguet.webp'
 where slug = 'audemars-piguet';

update public.brands set hero_image_url = '/site-photography/brand-patek-philippe.webp'
 where slug = 'patek-philippe';

update public.brands set hero_image_url = '/site-photography/richard-mille-rm030.webp'
 where slug = 'richard-mille';

commit;

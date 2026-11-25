-- -----------------------------------------------------------------------------
-- A dark classic watch behind the sell-or-trade banner
--
-- `0031` pointed `sell_trade_cta` at the Stella-dial plate. That plate is a row
-- of bright lacquered dials: correct for a *selection* (which is where
-- `featured_collection` uses it) and wrong for the sell/trade strip, where the
-- photograph sits behind white body copy on a near-black band. A bright plate
-- under text is the one arrangement the gradient cannot fully rescue, and the
-- browser contrast audit measures the result rather than the intent.
--
-- `corum-coinwatch` is the darkest image in the registry (mean luminance ~73 of
-- 255, against ~93 for the Stella plate) and is a single object photographed
-- against black — which is what makes the band read as "a watch under a light"
-- rather than a photograph pasted onto a page. It is also a classic dress
-- piece, which is the register the sell/trade offer is speaking in.
--
-- Idempotent in the same way `0031` is: it only moves the row off the plate it
-- was seeded with, so an administrator who has since chosen their own picture is
-- not overruled by re-running the migration.
-- -----------------------------------------------------------------------------

begin;

update public.homepage_sections
   set image_url = '/site-photography/corum-coinwatch.webp'
 where section_key = 'sell_trade_cta'
   and image_url = '/site-photography/rolex-stella-dials.webp';

commit;

-- =============================================================================
-- Verification
-- =============================================================================
--
--   select section_key, image_url from public.homepage_sections
--    where section_key in ('sell_trade_cta', 'sourcing_cta');
--
-- `sell_trade_cta` should name corum-coinwatch.webp.

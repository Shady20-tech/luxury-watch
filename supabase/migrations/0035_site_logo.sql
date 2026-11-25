-- -----------------------------------------------------------------------------
-- The site logo
--
-- `site_settings.logo_url` has existed since 0006 and the header has always
-- honoured it — `Wordmark` renders the image when the column is set and a text
-- wordmark when it is not. The column was simply never filled, so every
-- environment showed the text fallback.
--
-- The asset is the approved gold crest, committed under `public/brand/`. It is
-- a transparent PNG so it sits on the dark header without a visible plate, and
-- the same file is used for the browser icon through `src/app/icon.png`.
--
-- Guarded on `logo_url is null` so an administrator who uploads a different
-- logo in the admin is never overwritten by a re-run of the migrations.
-- -----------------------------------------------------------------------------

begin;

update public.site_settings
   set logo_url = '/brand/logo.png'
 where logo_url is null;

commit;

-- -----------------------------------------------------------------------------
-- 41 — the brand crest
--
-- `site_settings.logo_url` pointed at `/brand/logo.png`, the line-art mark that
-- was replaced by the supplied crest. Point it at the new asset so the header
-- and footer draw the approved branding rather than the retired drawing.
--
-- -----------------------------------------------------------------------------
-- WHY THIS UPDATES RATHER THAN FILLS A NULL
-- -----------------------------------------------------------------------------
--
-- 0035 was guarded on `logo_url is null` so an administrator's own upload would
-- never be overwritten by a re-run. That guard has done its job and is now in
-- the way: the value is set (to the retired asset), so the guard would skip the
-- row forever and the old mark would keep winning.
--
-- The `where` clause below is the same protection expressed against the *old
-- value* instead of against null: it replaces the retired default and leaves any
-- other value — a genuine admin upload — untouched. Re-running is a no-op,
-- because the row no longer matches once it has been updated.
-- -----------------------------------------------------------------------------

begin;

update public.site_settings
   set logo_url = '/brand/crest.png'
 where logo_url = '/brand/logo.png';

commit;

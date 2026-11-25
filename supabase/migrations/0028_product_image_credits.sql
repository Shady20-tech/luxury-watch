-- =============================================================================
-- 0028 — Image credits, licences, and a photograph that is not the object
--
-- -----------------------------------------------------------------------------
-- WHY THREE COLUMNS BECOME ONE OBLIGATION
-- -----------------------------------------------------------------------------
--
-- Until now every `product_images` row was the dealer's own photograph of the
-- actual piece. That is still the intended state, and the columns added here are
-- all nullable for that reason: a dealer's own photograph needs no credit line,
-- no licence, and is never a stand-in.
--
-- The development seed is the exception. It carries no photography of its own,
-- so it now uses openly-licensed photographs from Wikimedia Commons. Three new
-- facts become mandatory for such a row, and all three are licence conditions
-- rather than presentation choices:
--
--   * `credit` — the photographer, so attribution can be rendered. CC BY and
--     CC BY-SA both require it.
--   * `licence` — the licence name, so a reader can see what they may do with
--     the picture. CC BY-SA additionally requires share-alike to be stated.
--   * `licence_url` — the deed, because "CC BY-SA 4.0" alone is not a link to
--     the terms.
--
-- `source_url` points at the file's Commons page. It is the provenance record:
-- it is how someone later verifies the licence, and how a mis-assignment gets
-- traced and corrected.
--
-- -----------------------------------------------------------------------------
-- `is_representative` — the honesty column
-- -----------------------------------------------------------------------------
--
-- A Commons photograph of a Milgauss 116400GV shows *a* Milgauss 116400GV. It is
-- not a photograph of the particular watch in stock: the caseback engraving, the
-- serial, the exact condition are all somebody else's. Presenting it as the item
-- for sale is a misdescription, however good the licence, and it is the kind of
-- misdescription that matters when the buyer eventually receives a different
-- object.
--
-- So a seeded photograph is marked `is_representative = true` and the storefront
-- says so, in words, next to the gallery. A dealer's own photograph defaults to
-- false and carries no such caption. The default is deliberately the honest one
-- for real stock: the common case needs no data entered, and the exceptional
-- case needs a sentence written.
--
-- This is additive and reversible. Nothing here changes a query, and every
-- existing row stays valid with all four new columns null and the flag false.
-- =============================================================================

begin;

alter table public.product_images
  add column if not exists credit text,
  add column if not exists licence text,
  add column if not exists licence_url text,
  add column if not exists source_url text,
  add column if not exists is_representative boolean not null default false;

comment on column public.product_images.credit is
  'Photographer or rights holder, rendered beside the photograph. Required by CC BY and CC BY-SA.';
comment on column public.product_images.licence is
  'Licence name, e.g. ''CC BY-SA 4.0''. Null for the dealer''s own photography.';
comment on column public.product_images.licence_url is
  'Link to the licence deed, so the terms are one click away from the credit.';
comment on column public.product_images.source_url is
  'Provenance: the page the image came from, so the licence can be re-verified later.';
comment on column public.product_images.is_representative is
  'True when the photograph shows a model example rather than the exact item in stock.';

-- -----------------------------------------------------------------------------
-- 1. A credited image must carry everything the licence requires
--
-- A check constraint rather than an application rule, because the seed is not the
-- only writer: the admin can attach an external image too, and a row that is
-- visually fine but legally incomplete should be rejected at the point of
-- writing, not discovered by a reader looking at an unattributed photograph.
--
-- The constraint is deliberately scoped to rows that claim a licence. A dealer's
-- own photograph has `licence is null` and is unaffected even if it has no
-- credit, which is correct: they own it.
-- -----------------------------------------------------------------------------

alter table public.product_images
  drop constraint if exists product_images_licence_complete_check;

alter table public.product_images
  add constraint product_images_licence_complete_check check (
    licence is null
    or (
      nullif(trim(credit), '') is not null
      and nullif(trim(licence), '') is not null
      and nullif(trim(licence_url), '') is not null
      and nullif(trim(source_url), '') is not null
    )
  );

-- A representative photograph is a licensing situation by definition: it is
-- somebody else's picture of somebody else's watch. Requiring a credit keeps the
-- flag from being used to label an unattributed image as a stand-in.
alter table public.product_images
  drop constraint if exists product_images_representative_credited_check;

alter table public.product_images
  add constraint product_images_representative_credited_check check (
    not is_representative
    or nullif(trim(credit), '') is not null
  );

commit;

-- =============================================================================
-- BRACELET FACET — the missing spelling rule
-- =============================================================================
--
-- 0027 established write-time normalisation for the five free-text facet
-- columns and mapped `case_material` 'stainless steel' to 'Stainless Steel'. It
-- did not map the same lowercase spelling for `bracelet_material`, because at
-- the time no row held it.
--
-- The extended catalogue then introduced exactly that row, so the bracelet
-- facet split into two filter entries:
--
--   'Stainless Steel' (6)  vs  'Stainless steel' (5)
--
-- and selecting either one hid the other five pieces. `28_facet_values.sql`
-- caught it, because its assertion is the invariant ("no column holds two
-- spellings that fold to the same key") rather than a list of expected strings.
-- That is the whole point of writing the test that way: a hand-checked value
-- list would have been updated alongside the bug.
--
-- The fix belongs in the map, not in the seed. Correcting the seed would fix
-- this database and leave the next writer free to introduce the duplicate
-- again; the map is the single place that decides what a material is called,
-- and 0027's own reasoning says so. The mapping is one reviewed pair of the
-- same phrase, which is exactly the standard 0027 set for adding a rule: a
-- mechanical fold would also merge 'Steel' with 'Stainless Steel', and those
-- are different products at different prices.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Redefine the normaliser with the missing pair.
--
-- `create or replace` with the identical signature, body copied from 0027 and
-- extended, so there is one definition of the map and this migration is the
-- last word on it (AGENTS.md: the migration that last defines a function is the
-- one that governs).
-- -----------------------------------------------------------------------------

create or replace function public.catalogue_normalise_facet_value(
  p_column text,
  p_value  text
)
returns text
language sql
immutable
set search_path = ''
as $$
  with cleaned as (
    select nullif(btrim(regexp_replace(p_value, '\s+', ' ', 'g')), '') as value
  ),
  map (column_name, old_value, new_value) as (
    values
      -- case_material
      ('case_material', 'stainless steel',        'Stainless Steel'),        -- 1 vs 6
      ('case_material', 'black ceramic',          'Black Ceramic'),          -- 2 vs 3
      ('case_material', '18-carat sand gold',     '18-carat sand gold'),     -- settles case only
      ('case_material', 'titanium and carbon tpt','Titanium and Carbon TPT'),
      ('case_material', 'blue / white quartz tpt','Blue/White Quartz TPT'),  -- settles spacing only

      -- dial_color
      ('dial_color', 'ice blue',    'Ice blue'),    -- 1  vs 1, sentence case
      ('dial_color', 'open-work',   'Openworked'),  -- 11 vs 68
      ('dial_color', 'open work',   'Openworked'),  -- 3  vs 68
      ('dial_color', 'openwork',    'Openworked'),  -- 1  vs 68
      ('dial_color', 'open-worked', 'Openworked'),  -- 2  vs 68

      -- movement. 'Manual' (26) is deliberately not merged into 'Manual-Wind':
      -- the catalogue lists them separately and it is not certain they name the
      -- same escapement. Only spellings of one phrase are merged.
      ('movement', 'manual wind',      'Manual-Wind'), -- 1 vs 70
      ('movement', 'manual winding',   'Manual-Wind'), -- 1 vs 70
      ('movement', 'manual hand wind', 'Manual-Wind'), -- 5 vs 70
      ('movement', 'hand-wound',       'Manual-Wind'), -- 1 vs 70
      ('movement', 'self-winding',     'Selfwinding'), -- 1 vs 9

      -- gender. The only difference is U+2019 versus U+0027, which render
      -- almost identically — that is why the duplicate row went unnoticed.
      ('gender', 'men’s', 'Men''s'),  -- 19 vs 553
      ('gender', 'women’s', 'Ladies'), -- 4  vs 131

      -- bracelet_material. Two problems: spelling variants, and marketing prose.
      -- A filter list cannot be read when a row is a paragraph. The full
      -- sentence is already stored verbatim in `product_specs` under 'Bracelet',
      -- so shortening the facet column loses nothing — the product page still
      -- prints it. Two scraped values mixed band and clasp; the clasp is in
      -- `product_specs` too.
      ('bracelet_material', 'ceramic bracelet', 'Ceramic'),
      ('bracelet_material', 'integrated black ceramic bracelet with invisible pin design', 'Ceramic'),
      ('bracelet_material', 'integrated bracelet entirely crafted in 18-carat sand gold',  'Sand Gold'),
      ('bracelet_material', 'integrated stainless steel bracelet', 'Stainless Steel'),
      ('bracelet_material', 'steel bracelet', 'Stainless Steel'),
      -- The pair this migration exists for: same phrase, one lowercase letter.
      ('bracelet_material', 'stainless steel', 'Stainless Steel'),
      ('bracelet_material', 'integrated bracelet combining bmg studs with titanium links', 'Titanium'),
      ('bracelet_material', 'interchangeable dark green textured leather strap and additional black rubber strap', 'Leather'),
      ('bracelet_material', 'blue textured rubber-coated strap with calfskin lining',  'Rubber'),
      ('bracelet_material', 'black textured rubber-coated strap with calfskin lining', 'Rubber'),
      ('bracelet_material', 'grey rubber-coated strap', 'Rubber'),
      ('bracelet_material', 'black rubber',             'Rubber'),
      ('bracelet_material', 'matt black alligator leather strap', 'Leather'),
      ('bracelet_material', 'alligator leather strap',            'Leather'),
      ('bracelet_material', 'alligator leather',                  'Leather'),
      ('bracelet_material', 'beige alligator strap',              'Leather'),
      ('bracelet_material', 'band material: white goldclasp: tang buckle',          'White Gold'),
      ('bracelet_material', 'band material: rose gold/steel, clasp: folding clasp', 'Rose Gold/Steel')
  )
  select coalesce(m.new_value, c.value)
    from cleaned c
    -- A placeholder is not a value: "Not Mentioned" and "N/A" tell a visitor
    -- nothing and cannot be filtered on, so they become null ("not recorded").
    left join map m
      on m.column_name = p_column
     and m.old_value = lower(c.value)
   where c.value is null
      or c.value not in ('Not Mentioned', 'N/A (Replace with strap material if applicable)');
$$;

comment on function public.catalogue_normalise_facet_value(text, text) is
  'Canonical spelling for one facet value, or null for a placeholder. Applied on '
  'write so a facet cannot split one material across several filter rows.';

-- -----------------------------------------------------------------------------
-- Repair rows that already hold the duplicate spelling.
--
-- The trigger only fires on write, so a database that already holds
-- 'Stainless steel' in `bracelet_material` — which is every database seeded
-- before this migration — needs the backfill. `updated_at` is left alone: this
-- is not a merchant edit and must not reorder the "newest" sort or move a
-- sitemap `<lastmod>`.
-- -----------------------------------------------------------------------------

update public.products
   set bracelet_material = public.catalogue_normalise_facet_value('bracelet_material', bracelet_material)
 where bracelet_material is distinct from public.catalogue_normalise_facet_value('bracelet_material', bracelet_material);

-- `create or replace` preserves the existing ACL, so the revokes from 0027
-- still hold. They are repeated here anyway: a migration that recreates a
-- function should not depend on a detail of Postgres that a future
-- `drop function` would silently undo.
revoke execute on function public.catalogue_normalise_facet_value(text, text) from public;
revoke execute on function public.catalogue_normalise_facet_value(text, text) from anon, authenticated, service_role;

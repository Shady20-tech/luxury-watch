-- =============================================================================
-- FACET VALUE NORMALISATION
-- =============================================================================
--
-- The five free-text facet columns (`case_material`, `dial_color`, `movement`,
-- `bracelet_material`, `gender`) are typed by hand in the admin, and the seeded
-- catalogue arrived with the same value spelled several ways:
--
--   'Stainless Steel' (6)   vs  'Stainless steel' (1)
--   'Black Ceramic'   (3)   vs  'Black ceramic'   (2)
--   'Men''s'          (553) vs  'Men’s'           (19)
--   'Openworked' (68) / 'Open-work' / 'Openwork' / 'Open Work' / 'Open-Work'
--   'Manual-Wind'     (70) vs  'Manual Wind' / 'Manual Winding'
--
-- `catalogue_facets` groups by the raw column value, so each spelling became its
-- own filter row. Filtering on one hid the pieces stored under the other: on the
-- demo catalogue "Stainless Steel" matched 4 of the 5 stainless pieces and
-- "Stainless steel" matched the fifth, so the catalogue looked like it held
-- fewer watches than it does. That is a data defect, not a rendering one, and no
-- front-end change can fix it — one material has to be one stored value.
--
-- -----------------------------------------------------------------------------
-- WHY AN EXPLICIT MAPPING AND NOT A FOLDING RULE
-- -----------------------------------------------------------------------------
--
-- A mechanical fold (`lower(regexp_replace(value, '[^a-z0-9]+', '', 'g'))`) is
-- right only when the folded forms really are the same thing. Here they are not:
-- 'Steel' and 'Stainless Steel' are different rows at different prices, and
-- folding them would merge two genuinely different filter entries. 'Gold' and
-- 'Rose Gold' likewise. A rule that is correct for the duplicates and wrong for
-- the near-duplicates is worse than no rule, because the mistake is invisible —
-- the filter still returns rows, just the wrong ones.
--
-- So the map below merges only pairs that were reviewed individually, and every
-- canonical value is the majority spelling of its pair (counts in comments are
-- from the seeded catalogue at the time of writing). Anything absent keeps its
-- own value, including values that merely look similar.
--
-- -----------------------------------------------------------------------------
-- WRITE-TIME, NOT READ-TIME
-- -----------------------------------------------------------------------------
--
-- The function is applied by a trigger on `products` and by the backfill at the
-- bottom, so it runs once per write rather than once per facet query.
-- Normalising in `catalogue_facets` instead would keep the defect out of the
-- sidebar but leave the stored value wrong, cost the partial btree indexes on
-- these columns (0010), and put a mangled key in the URL that the catalogue
-- never displays. Here the equality filters, the indexes and a readable URL all
-- keep working.
--
-- Seeds run *after* migrations (`db-verify.sh`), so the backfill below cannot
-- repair a fresh seed — the trigger is what covers it, because `01_catalogue.sql`
-- inserts and upserts through `products`. The backfill exists for a database
-- that already holds rows and will never run the seed again: the deployed
-- project, or a preview built before this migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- catalogue_normalise_facet_value — one value, one column, no I/O.
--
-- Immutable so it can be used in the trigger, the backfill and, if ever needed,
-- a generated column. `set search_path = ''` with no unqualified names, matching
-- the other helper functions in this schema.
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
-- Apply it on every write to the five columns.
--
-- `before insert or update` rather than an explicit call in the admin action,
-- because there are several write paths (the admin form, the seed, a bulk SQL
-- import) and only some of them go through the action. A trigger is the one
-- place that cannot be forgotten by the next writer.
--
-- The trigger is skipped when none of the columns is being changed, so a stock
-- adjustment or a status change does not rewrite them.
-- -----------------------------------------------------------------------------

-- A trigger function executes with the privileges of the role doing the write,
-- not the table owner, so a `service_role` insert would fail on the revokes
-- below. `security definer` makes the trigger run as the owner — it calls one
-- pure function and touches no table of its own, so there is nothing for the
-- elevated context to reach. `search_path = ''` and fully qualified names keep
-- the owner context from being redirectable.
create or replace function public.products_normalise_facets()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.case_material     := public.catalogue_normalise_facet_value('case_material',     new.case_material);
  new.dial_color        := public.catalogue_normalise_facet_value('dial_color',        new.dial_color);
  new.movement          := public.catalogue_normalise_facet_value('movement',          new.movement);
  new.bracelet_material := public.catalogue_normalise_facet_value('bracelet_material', new.bracelet_material);
  new.gender            := public.catalogue_normalise_facet_value('gender',            new.gender);
  return new;
end $$;

drop trigger if exists products_normalise_facets on public.products;
create trigger products_normalise_facets
  before insert or update of
    case_material, dial_color, movement, bracelet_material, gender
  on public.products
  for each row
  execute function public.products_normalise_facets();

-- -----------------------------------------------------------------------------
-- Backfill the rows that already exist.
--
-- Touching every row is deliberate: the trigger cannot fire for data that
-- landed before it existed. `updated_at` is left alone, because this is not a
-- merchant edit and should not reorder the "newest" sort or move a sitemap
-- `<lastmod>`.
-- -----------------------------------------------------------------------------

update public.products
   set case_material     = public.catalogue_normalise_facet_value('case_material',     case_material),
       dial_color        = public.catalogue_normalise_facet_value('dial_color',        dial_color),
       movement          = public.catalogue_normalise_facet_value('movement',          movement),
       bracelet_material = public.catalogue_normalise_facet_value('bracelet_material', bracelet_material),
       gender            = public.catalogue_normalise_facet_value('gender',            gender)
 where case_material     is distinct from public.catalogue_normalise_facet_value('case_material',     case_material)
    or dial_color        is distinct from public.catalogue_normalise_facet_value('dial_color',        dial_color)
    or movement          is distinct from public.catalogue_normalise_facet_value('movement',          movement)
    or bracelet_material is distinct from public.catalogue_normalise_facet_value('bracelet_material', bracelet_material)
    or gender            is distinct from public.catalogue_normalise_facet_value('gender',            gender);

-- -----------------------------------------------------------------------------
-- The function is a write-time helper, not an API surface.
--
-- Two revokes are needed, not one. `PUBLIC` holds EXECUTE on every new function
-- by default, and the shim/Supabase default privileges additionally grant it to
-- `anon`, `authenticated` and `service_role` at CREATE time — so revoking from
-- `public` alone leaves the API roles still able to call it. `catalogue_filtered`
-- in 0010 is revoked from both for the same reason.
--
-- The trigger runs as the table owner, so it is unaffected.
-- -----------------------------------------------------------------------------

revoke execute on function public.catalogue_normalise_facet_value(text, text) from public;
revoke execute on function public.catalogue_normalise_facet_value(text, text) from anon, authenticated, service_role;
revoke execute on function public.products_normalise_facets() from public;
revoke execute on function public.products_normalise_facets() from anon, authenticated, service_role;

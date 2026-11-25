-- =============================================================================
-- 28 — Facet value normalisation (migration 0027)
--
-- `catalogue_facets` groups by the raw column value, so one material stored
-- under two spellings becomes two filter rows, each hiding the other's pieces.
-- On the demo catalogue that meant "Stainless Steel" showed 4 of the 5 stainless
-- watches. This suite proves the write-time normaliser keeps that from
-- happening, on the seeded data and on a new insert alike.
--
-- The assertions are deliberately about an *invariant* rather than a list of
-- strings. A test that enumerated the expected values would pass while a new
-- duplicate spelling was introduced by someone else; "no two values in a column
-- fold to the same key" cannot.
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- 1. The invariant on whatever the database currently holds.
--
-- The fold used here is the same one the migration was written against:
-- case, spaces and hyphenation folded away, word order and word choice kept.
-- `Steel` and `Stainless Steel` therefore stay distinct, which is the point —
-- they are different rows at different prices, not a spelling mistake.
-- -----------------------------------------------------------------------------

do $$
declare
  offending record;
begin
  for offending in
    select col, key, string_agg(distinct value, ' | ' order by value) as spellings
      from (
        select 'case_material' as col,
               lower(regexp_replace(btrim(case_material), '[^a-zA-Z0-9]+', '', 'g')) as key,
               case_material as value
          from public.products where case_material is not null
        union all
        select 'dial_color',
               lower(regexp_replace(btrim(dial_color), '[^a-zA-Z0-9]+', '', 'g')),
               dial_color
          from public.products where dial_color is not null
        union all
        select 'movement',
               lower(regexp_replace(btrim(movement), '[^a-zA-Z0-9]+', '', 'g')),
               movement
          from public.products where movement is not null
        union all
        select 'bracelet_material',
               lower(regexp_replace(btrim(bracelet_material), '[^a-zA-Z0-9]+', '', 'g')),
               bracelet_material
          from public.products where bracelet_material is not null
        union all
        select 'gender',
               lower(regexp_replace(btrim(gender), '[^a-zA-Z0-9]+', '', 'g')),
               gender
          from public.products where gender is not null
      ) t
     group by col, key
    having count(distinct value) > 1
  loop
    raise exception 'FAIL: % holds % spellings that fold to the same facet key %',
      offending.col, offending.spellings, offending.key;
  end loop;

  raise notice 'pass [facets: no column holds two spellings of one value]';
end $$;

-- -----------------------------------------------------------------------------
-- 2. A write through the trigger is normalised.
--
-- The seed runs after the migrations, so the seeded rows above prove the
-- trigger fires on install. This proves it fires for a *later* insert too,
-- which the seed cannot: a fresh seed is normalised by the trigger, but a row
-- inserted years from now goes through the same path.
-- -----------------------------------------------------------------------------

set role service_role;

insert into public.products
  (id, sku, slug, title, status, published_at, price_cents, price_on_request,
   case_material, dial_color, movement, bracelet_material, gender)
values
  ('f1900000-0000-4000-8000-000000000001', 'FACET-1', 'facet-normalise-probe', 'Facet Normalise Probe',
   'published', now(), null, true,
   'stainless steel', 'OPEN-WORK', 'manual wind', 'Integrated stainless steel bracelet', 'Men’s');

do $$
declare
  probe record;
begin
  select case_material, dial_color, movement, bracelet_material, gender
    into probe
    from public.products
   where id = 'f1900000-0000-4000-8000-000000000001';

  if probe.case_material <> 'Stainless Steel' then
    raise exception 'FAIL: case_material was stored as %, expected Stainless Steel', probe.case_material;
  end if;
  if probe.dial_color <> 'Openworked' then
    raise exception 'FAIL: dial_color was stored as %, expected Openworked', probe.dial_color;
  end if;
  if probe.movement <> 'Manual-Wind' then
    raise exception 'FAIL: movement was stored as %, expected Manual-Wind', probe.movement;
  end if;
  if probe.bracelet_material <> 'Stainless Steel' then
    raise exception 'FAIL: bracelet_material was stored as %, expected Stainless Steel', probe.bracelet_material;
  end if;
  -- U+2019 versus U+0027: indistinguishable on screen, distinct in a filter.
  if probe.gender <> 'Men''s' then
    raise exception 'FAIL: gender was stored as %, expected Men''s', probe.gender;
  end if;

  raise notice 'pass [facets: an insert is normalised on write]';
end $$;

-- -----------------------------------------------------------------------------
-- 3. Whitespace is collapsed and a blank is not a value.
-- -----------------------------------------------------------------------------

insert into public.products
  (id, sku, slug, title, status, published_at, price_cents, price_on_request,
   case_material, dial_color, movement)
values
  ('f1900000-0000-4000-8000-000000000002', 'FACET-2', 'facet-whitespace-probe', 'Facet Whitespace Probe',
   'published', now(), null, true,
   '  Stainless   Steel  ', '   ', '   ');

do $$
declare
  probe record;
begin
  select case_material, dial_color, movement
    into probe
    from public.products
   where id = 'f1900000-0000-4000-8000-000000000002';

  if probe.case_material <> 'Stainless Steel' then
    raise exception 'FAIL: whitespace was not collapsed, stored as %', quote_literal(probe.case_material);
  end if;
  if probe.dial_color is not null then
    raise exception 'FAIL: a blank dial_color was stored as %, expected null', quote_literal(probe.dial_color);
  end if;
  if probe.movement is not null then
    raise exception 'FAIL: a blank movement was stored as %, expected null', quote_literal(probe.movement);
  end if;

  raise notice 'pass [facets: whitespace is collapsed and a blank is null]';
end $$;

-- -----------------------------------------------------------------------------
-- 4. A placeholder is not a filter value.
--
-- "Not Mentioned" and "N/A (Replace with strap material if applicable)" cannot
-- be acted on — a visitor cannot want one — so they must not survive as a value.
-- -----------------------------------------------------------------------------

insert into public.products
  (id, sku, slug, title, status, published_at, price_cents, price_on_request,
   dial_color, bracelet_material)
values
  ('f1900000-0000-4000-8000-000000000003', 'FACET-3', 'facet-placeholder-probe', 'Facet Placeholder Probe',
   'published', now(), null, true,
   'Not Mentioned', 'N/A (Replace with strap material if applicable)');

do $$
declare
  probe record;
begin
  select dial_color, bracelet_material
    into probe
    from public.products
   where id = 'f1900000-0000-4000-8000-000000000003';

  if probe.dial_color is not null or probe.bracelet_material is not null then
    raise exception 'FAIL: a placeholder survived as a facet value: %, %',
      probe.dial_color, probe.bracelet_material;
  end if;

  raise notice 'pass [facets: a placeholder becomes null]';
end $$;

-- -----------------------------------------------------------------------------
-- 5. The normaliser is not an API surface.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, so omitting a
-- grant is not enough. It is a write-time helper, and a caller has no reason to
-- reach it through PostgREST.
-- -----------------------------------------------------------------------------

do $$
declare
  allowed text[];
begin
  select coalesce(array_agg(grantee.rolname::text), '{}')
    into allowed
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    join pg_roles grantee on grantee.oid = a.grantee
   where p.proname = 'catalogue_normalise_facet_value'
     and a.privilege_type = 'EXECUTE';

  if 'anon' = any (allowed) or 'authenticated' = any (allowed) then
    raise exception 'FAIL: catalogue_normalise_facet_value is executable by the API roles: %', allowed;
  end if;

  raise notice 'pass [facets: the normaliser is not callable by anon or authenticated]';
end $$;

reset role;

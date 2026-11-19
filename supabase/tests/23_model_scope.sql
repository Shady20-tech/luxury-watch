-- =============================================================================
-- 23 — Model scope and published totals per model (migration 0018)
--
-- -----------------------------------------------------------------------------
-- WHY THIS SUITE EXISTS
-- -----------------------------------------------------------------------------
--
-- The model scope is the only scope whose slug is composite, and the reason is
-- a data fact, not a preference: `models` is unique on `(brand_id, slug)`, and
-- the seed holds four distinct models whose slug is `other`. A scope that
-- resolved a model slug alone would answer with four brands' stock. That is the
-- failure this suite is built to catch, because it produces a page that looks
-- entirely normal and simply shows the wrong watches.
--
-- `published_model_counts()` is `security definer` for the same reason as the
-- collection aggregate, so the publication gate is a `where` clause rather than
-- a policy. Deleting it would leave every other suite green while the sitemap
-- and the model page agreed on a number that counted drafts.
--
-- What is asserted, in both directions:
--
--   1. The model scope returns only that model's published pieces.
--   2. The same model slug under a DIFFERENT brand returns nothing, which is the
--      composite-key guarantee.
--   3. An inactive model scope returns nothing rather than widening.
--   4. The aggregate counts published pieces and ignores drafts.
--   5. `anon` may read the aggregate, because the sitemap runs without a session.
--   6. `anon` may NOT call `catalogue_filtered` directly — it returns whole rows,
--      including `cost_cents`.
-- =============================================================================

\set ON_ERROR_STOP on

set role service_role;

-- Two brands that deliberately share a model slug, plus an inactive model.
insert into public.brands (id, name, slug, is_active)
values
  ('f1000000-0000-4000-8000-000000000001', 'Msc Brand A', 'msc-brand-a', true),
  ('f1000000-0000-4000-8000-000000000002', 'Msc Brand B', 'msc-brand-b', true)
on conflict (slug) do update set is_active = excluded.is_active;

insert into public.models (id, brand_id, name, slug, is_active)
values
  ('f1000000-0000-4000-8000-000000000011', 'f1000000-0000-4000-8000-000000000001', 'Shared',   'shared-model', true),
  ('f1000000-0000-4000-8000-000000000012', 'f1000000-0000-4000-8000-000000000002', 'Shared',   'shared-model', true),
  ('f1000000-0000-4000-8000-000000000013', 'f1000000-0000-4000-8000-000000000001', 'Retired',  'retired-model', false)
on conflict (id) do nothing;

insert into public.products (id, sku, slug, title, brand_id, model_id, status, published_at, price_cents, price_on_request)
values
  -- Published, brand A / shared-model.
  ('f1000000-0000-4000-8000-000000000101', 'MSC-A-PUB', 'msc-a-pub', 'Msc A Pub', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000011', 'published', now(), 100000, false),
  -- Draft in the same model: must not be counted or returned.
  ('f1000000-0000-4000-8000-000000000102', 'MSC-A-DRF', 'msc-a-drf', 'Msc A Drf', 'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000011', 'draft',     null,  100000, false),
  -- Published, brand B / shared-model. The composite key must keep this out of
  -- brand A's scope.
  ('f1000000-0000-4000-8000-000000000103', 'MSC-B-PUB', 'msc-b-pub', 'Msc B Pub', 'f1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000012', 'published', now(), 100000, false),
  -- Published under an inactive model: not a public destination.
  ('f1000000-0000-4000-8000-000000000104', 'MSC-RET',   'msc-ret',   'Msc Ret',   'f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000013', 'published', now(), 100000, false)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 1. The model scope returns exactly that model's published piece.
-- -----------------------------------------------------------------------------
do $$
declare v_count bigint;
begin
  select count(*) into v_count
    from public.catalogue_search('model', 'msc-brand-a/shared-model',
      null, null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, 'any', null, 'any', 'featured', 60, 0);

  if v_count is distinct from 1 then
    raise exception 'FAIL: model scope returned % row(s), expected 1', v_count;
  end if;
  raise notice 'pass [model scope: returns only its own published pieces]';
end $$;

-- -----------------------------------------------------------------------------
-- 2. The same model slug under a different brand returns nothing.
--
-- This is the whole reason the scope slug is composite. If the scope matched on
-- the model slug alone, this would return brand B's piece and the page would
-- silently show the wrong brand.
-- -----------------------------------------------------------------------------
do $$
declare v_count bigint;
begin
  select count(*) into v_count
    from public.catalogue_search('model', 'msc-brand-a/shared-model-crossed',
      null, null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, 'any', null, 'any', 'featured', 60, 0);

  if v_count is distinct from 0 then
    raise exception 'FAIL: an unknown composite scope returned % row(s)', v_count;
  end if;
  raise notice 'pass [model scope: an unknown composite slug yields nothing]';
end $$;

do $$
declare v_count bigint;
begin
  -- Brand B's model holds one published piece; brand A's scope must not see it.
  select count(*) into v_count
    from public.catalogue_search('model', 'msc-brand-a/shared-model',
      null, null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, 'any', null, 'any', 'featured', 60, 0)
   where id = 'f1000000-0000-4000-8000-000000000103';

  if v_count is distinct from 0 then
    raise exception 'FAIL: brand A''s model scope leaked brand B''s piece';
  end if;
  raise notice 'pass [model scope: cannot see another brand''s piece with the same slug]';
end $$;

-- -----------------------------------------------------------------------------
-- 3. An inactive model is not a public destination.
-- -----------------------------------------------------------------------------
do $$
declare v_count bigint;
begin
  select count(*) into v_count
    from public.catalogue_search('model', 'msc-brand-a/retired-model',
      null, null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, 'any', null, 'any', 'featured', 60, 0);

  if v_count is distinct from 0 then
    raise exception 'FAIL: an inactive model scope returned % row(s)', v_count;
  end if;
  raise notice 'pass [model scope: an inactive model yields nothing]';
end $$;

-- -----------------------------------------------------------------------------
-- 4. The aggregate counts published pieces only.
-- -----------------------------------------------------------------------------
do $$
declare v_count bigint;
begin
  select product_count into v_count
    from public.published_model_counts()
   where model_id = 'f1000000-0000-4000-8000-000000000011';

  if v_count is distinct from 1 then
    raise exception 'FAIL: model aggregate counted % piece(s), expected 1', v_count;
  end if;
  raise notice 'pass [counts: a draft is not counted]';
end $$;

do $$
declare v_count bigint;
begin
  select product_count into v_count
    from public.published_model_counts()
   where model_id = 'f1000000-0000-4000-8000-000000000013';

  if v_count is not null then
    raise exception 'FAIL: an inactive model appeared with count %', v_count;
  end if;
  raise notice 'pass [counts: an inactive model is absent]';
end $$;

-- -----------------------------------------------------------------------------
-- 5. `anon` may read the aggregate; 6. `anon` may not call catalogue_filtered.
--
-- The aggregate is what the sitemap needs without a session. The filter function
-- returns whole rows including `cost_cents`, so it stays unreachable from the
-- API roles; the public entry points return an explicit column list.
-- -----------------------------------------------------------------------------
set role anon;

do $$
declare v_count bigint;
begin
  select product_count into v_count
    from public.published_model_counts()
   where model_id = 'f1000000-0000-4000-8000-000000000011';

  if v_count is distinct from 1 then
    raise exception 'FAIL: anon saw % for the model aggregate, expected 1', v_count;
  end if;
  raise notice 'pass [counts: anon can read the aggregate]';
end $$;

-- -----------------------------------------------------------------------------
-- 7. A model suggestion points at the model page, not the brand's facet.
--
-- The typeahead used to send a shopper to `/brands/<brand>?model=<model>`, a
-- `noindex, follow` filtered URL that canonicalises onto the brand page. Now
-- that the model has its own address, the suggestion must use it — otherwise the
-- autocomplete quietly keeps handing out the URL the rest of the phase stopped
-- using.
-- -----------------------------------------------------------------------------
do $$
declare v_href text;
begin
  select href into v_href
    from public.catalogue_suggest('shared', 8)
   where kind = 'model';

  if v_href is not null and v_href <> '/brands/msc-brand-a/models/shared-model' then
    raise exception 'FAIL: model suggestion pointed at %', v_href;
  end if;

  if v_href is null then
    raise exception 'FAIL: no model suggestion was returned for the shared model';
  end if;
  raise notice 'pass [suggest: a model hit links to the model page]';
end $$;

do $$
begin
  begin
    perform count(*) from public.catalogue_filtered('all');
    raise exception 'FAIL: anon was able to call catalogue_filtered directly';
  exception
    when insufficient_privilege then
      raise notice 'pass [privilege: anon cannot call catalogue_filtered]';
  end;
end $$;

set role service_role;

-- -----------------------------------------------------------------------------
-- Cleanup, so a database that has run this suite still shows the seed counts.
-- -----------------------------------------------------------------------------
delete from public.products
 where id in (
   'f1000000-0000-4000-8000-000000000101',
   'f1000000-0000-4000-8000-000000000102',
   'f1000000-0000-4000-8000-000000000103',
   'f1000000-0000-4000-8000-000000000104'
 );

delete from public.models
 where id in (
   'f1000000-0000-4000-8000-000000000011',
   'f1000000-0000-4000-8000-000000000012',
   'f1000000-0000-4000-8000-000000000013'
 );

delete from public.brands
 where id in (
   'f1000000-0000-4000-8000-000000000001',
   'f1000000-0000-4000-8000-000000000002'
 );

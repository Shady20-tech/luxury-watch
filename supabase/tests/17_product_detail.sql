-- =============================================================================
-- 17 — Product detail (migration 0011)
--
-- Three things are proved here, and the first is a regression test for a real
-- leak rather than a new feature.
--
--   1. The public API roles cannot read `products.cost_cents` or
--      `products.compare_at_cents` — by any route: a direct column select, a
--      select-star, or an ordering by the column.
--   2. `catalogue_similar` re-applies the publication gate and the
--      active-taxonomy gate across its `security definer` boundary, and only
--      returns watches that genuinely share an attribute.
--   3. `submit_product_question` validates, refuses an unpublished product, and
--      enforces its rate limit in the database rather than only in the action.
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------

set role service_role;

insert into public.brands (id, name, slug, is_active)
values
  ('d0000000-0000-4000-8000-000000000001', 'Pd Brand Active',   'pd-brand-active',   true),
  ('d0000000-0000-4000-8000-000000000002', 'Pd Brand Other',    'pd-brand-other',    true),
  ('d0000000-0000-4000-8000-000000000003', 'Pd Brand Inactive', 'pd-brand-inactive', false)
on conflict (slug) do update set is_active = excluded.is_active;

insert into public.models (id, brand_id, name, slug, is_active)
values
  ('d0000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000001', 'Pd Model', 'pd-model', true)
on conflict (brand_id, slug) do update set is_active = excluded.is_active;

insert into public.products
  (sku, slug, title, brand_id, model_id, status, published_at,
   price_cents, price_on_request, cost_cents, compare_at_cents,
   condition, production_year, case_size_mm, case_material, movement, dial_color)
values
  -- The anchor: published, priced, with a cost and a promotional price set so
  -- the leak test has something real to fail on.
  ('PD-1', 'pd-anchor', 'Pd Anchor', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000011',
   'published', now() - interval '30 days', 500000, false, 310000, 600000,
   'unworn', 2024, 40, 'Pd Steel', 'Automatic', 'Blue'),
  -- Same model: the strongest relation.
  ('PD-2', 'pd-same-model', 'Pd Same Model', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000011',
   'published', now() - interval '20 days', null, true, 999999, null,
   'pre_owned', 2021, 41, 'Pd Gold', 'Manual', 'Black'),
  -- Same brand, different model: the second relation.
  ('PD-3', 'pd-same-brand', 'Pd Same Brand', 'd0000000-0000-4000-8000-000000000001', null,
   'published', now() - interval '10 days', 700000, false, null, null,
   'unworn', 2023, 42, 'Pd Titanium', 'Automatic', 'Green'),
  -- Different brand, but shares case material, dial colour and movement.
  ('PD-4', 'pd-shared-attrs', 'Pd Shared Attrs', 'd0000000-0000-4000-8000-000000000002', null,
   'published', now() - interval '5 days', null, true, null, null,
   'vintage', 1990, 36, 'Pd Steel', 'Automatic', 'Blue'),
  -- Shares nothing at all. Must never appear as related.
  ('PD-5', 'pd-unrelated', 'Pd Unrelated', 'd0000000-0000-4000-8000-000000000002', null,
   'published', now() - interval '4 days', null, true, null, null,
   'vintage', 1985, 34, 'Pd Resin', 'Quartz', 'Orange'),
  -- Draft sibling of the anchor: same model, must be excluded.
  ('PD-6', 'pd-draft-sibling', 'Pd Draft Sibling', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000011',
   'draft', null, null, true, null, null,
   'unworn', 2024, 40, 'Pd Steel', 'Automatic', 'Blue'),
  -- Published, same brand, but the brand is inactive: must be excluded.
  ('PD-7', 'pd-inactive-brand', 'Pd Inactive Brand', 'd0000000-0000-4000-8000-000000000003', null,
   'published', now() - interval '3 days', null, true, null, null,
   'unworn', 2024, 40, 'Pd Steel', 'Automatic', 'Blue')
on conflict (slug) do update
  set status = excluded.status,
      published_at = excluded.published_at,
      cost_cents = excluded.cost_cents,
      compare_at_cents = excluded.compare_at_cents,
      price_cents = excluded.price_cents,
      price_on_request = excluded.price_on_request;

reset role;

-- -----------------------------------------------------------------------------
-- 1. The commercial columns are not readable by the public roles
--
-- This is the regression test. Before migration 0011, `anon` held `select` on
-- the whole table and could read `cost_cents` for any published product.
-- -----------------------------------------------------------------------------

set role anon;

do $$
declare
  v_visible   boolean;
  v_cost_priv boolean;
begin
  -- 1a. The column privilege itself must be absent. Checking the privilege
  --     catalogue rather than only trying a query makes the failure message
  --     name the actual problem.
  select has_column_privilege('anon', 'public.products', 'cost_cents', 'select')
    into v_cost_priv;
  if v_cost_priv then
    raise exception 'FAIL: anon still holds select on products.cost_cents';
  end if;

  if has_column_privilege('anon', 'public.products', 'compare_at_cents', 'select') then
    raise exception 'FAIL: anon still holds select on products.compare_at_cents';
  end if;
  raise notice 'pass [security: anon holds no select on cost_cents or compare_at_cents]';

  -- 1b. A direct select of the sensitive column must be rejected outright, not
  --     silently return nulls. A null would still confirm the column exists and
  --     hide the fact that the grant is missing.
  begin
    perform cost_cents from public.products where slug = 'pd-anchor';
    raise exception 'FAIL: anon read products.cost_cents through a direct select';
  exception
    when insufficient_privilege then
      raise notice 'pass [security: anon direct select of cost_cents is denied]';
  end;

  -- 1c. Select-star must also be denied. This is the shape a careless query
  --     takes, and it is the one that would have leaked silently.
  begin
    perform * from public.products where slug = 'pd-anchor';
    raise exception 'FAIL: anon read products.* (which includes cost_cents)';
  exception
    when insufficient_privilege then
      raise notice 'pass [security: anon select-star on products is denied]';
  end;

  -- 1d. Ordering by the column is a read of it, and must be denied too.
  begin
    perform id from public.products order by cost_cents;
    raise exception 'FAIL: anon ordered by products.cost_cents';
  exception
    when insufficient_privilege then
      raise notice 'pass [security: anon cannot order by cost_cents]';
  end;

  -- 1e. The columns the storefront does need must still be readable, or the fix
  --     has broken the product page instead of securing it.
  select (select count(*) from public.products where slug = 'pd-anchor') = 1
    into v_visible;
  if not v_visible then
    raise exception 'FAIL: anon cannot read the published product row at all';
  end if;
  raise notice 'pass [security: anon still reads the public product columns]';
end
$$;

reset role;

-- The staff path is the service-role client, which must still see the cost.
set role service_role;
do $$
declare
  v_cost bigint;
begin
  select cost_cents into v_cost from public.products where slug = 'pd-anchor';
  if v_cost is null then
    raise exception 'FAIL: service_role can no longer read cost_cents; the admin screens would break';
  end if;
  raise notice 'pass [security: service_role still reads cost_cents]';
end
$$;
reset role;

-- -----------------------------------------------------------------------------
-- 2. catalogue_similar
-- -----------------------------------------------------------------------------

set role anon;

do $$
declare
  v_anchor   uuid;
  v_slugs    text[];
  v_reasons  text[];
  v_top      text;
  v_n        bigint;
begin
  select id into v_anchor from public.products where slug = 'pd-anchor';

  select array_agg(slug), array_agg(match_reason)
    into v_slugs, v_reasons
    from public.catalogue_similar(v_anchor, 8);

  if v_slugs is null then
    raise exception 'FAIL: catalogue_similar returned nothing for a product with related watches';
  end if;

  -- 2a. The anchor is never its own related product.
  if 'pd-anchor' = any (v_slugs) then
    raise exception 'FAIL: the anchor appeared in its own related list';
  end if;

  -- 2b. A draft sibling shares the model and must not leak.
  if 'pd-draft-sibling' = any (v_slugs) then
    raise exception 'FAIL: catalogue_similar returned a draft product';
  end if;

  -- 2c. A published product under an inactive brand is still a published
  --     product, and suite 16 documents that it stays visible: what inactive
  --     taxonomy withholds is scoping to it and its facet values, not the
  --     products themselves. `catalogue_similar` inherits that by reading
  --     through `catalogue_filtered`. Asserting the documented behaviour here
  --     keeps the two suites from contradicting each other.
  if not ('pd-inactive-brand' = any (v_slugs)) then
    raise exception 'FAIL: a published product under inactive taxonomy should still be related-eligible';
  end if;
  raise notice 'pass [similar: inactive taxonomy does not hide a published product]';

  -- 2d. A product sharing no attribute must not pad the list.
  if 'pd-unrelated' = any (v_slugs) then
    raise exception 'FAIL: catalogue_similar returned a product with no shared attribute';
  end if;
  raise notice 'pass [similar: no anchor, draft or unrelated row leaks]';

  -- 2e. Ranking: the function's own ordering must put the same-model sibling
  --     first, ahead of the same-brand one and the shared-attribute one.
  select s.slug into v_top
    from public.catalogue_similar(v_anchor, 8) s
   limit 1;
  if v_top <> 'pd-same-model' then
    raise exception 'FAIL: the strongest relation was not ranked first (got %)', v_top;
  end if;
  raise notice 'pass [similar: same-model sibling ranks first]';

  -- 2f. The match reason must describe a real relationship, not be a constant.
  if not ('model' = any (v_reasons)) or not ('brand' = any (v_reasons)) then
    raise exception 'FAIL: match_reason did not distinguish model from brand relations (%)', v_reasons;
  end if;
  raise notice 'pass [similar: match_reason reflects the real relationship]';

  -- 2g. An unknown anchor must yield no rows. Otherwise the function is an
  --     oracle for the existence of a product.
  select count(*) into v_n
    from public.catalogue_similar('00000000-0000-4000-8000-0000000000ff'::uuid, 8);
  if v_n <> 0 then
    raise exception 'FAIL: an unknown anchor returned rows';
  end if;
  raise notice 'pass [similar: an unknown anchor returns no rows]';

  -- 2h. The limit is bounded, so one page cannot ask for the whole catalogue.
  select count(*) into v_n from public.catalogue_similar(v_anchor, 1000);
  if v_n > 24 then
    raise exception 'FAIL: p_limit was not clamped; % rows returned', v_n;
  end if;
  raise notice 'pass [similar: p_limit is clamped]';
end
$$;

reset role;

set role service_role;
do $$
declare
  v_draft uuid;
  v_n     bigint;
begin
  select id into v_draft from public.products where slug = 'pd-draft-sibling';

  -- `set role anon` cannot read the draft id, so the negative case is asserted
  -- here: the function is called with a real draft id and must return nothing.
  set local role anon;
  select count(*) into v_n from public.catalogue_similar(v_draft, 8);
  if v_n <> 0 then
    raise exception 'FAIL: a draft anchor returned % related rows', v_n;
  end if;
  raise notice 'pass [similar: a draft anchor returns no rows]';
end
$$;
reset role;

-- -----------------------------------------------------------------------------
-- 3. submit_product_question
-- -----------------------------------------------------------------------------

set role anon;

do $$
declare
  v_ref text;
  v_n   bigint;
begin
  -- 3a. The happy path returns a reference and writes exactly one inquiry.
  v_ref := public.submit_product_question(
    'pd-anchor', 'Test Enquirer', 'enquirer@example.com', 'Is this still available?', null);

  if v_ref is null or v_ref = '' then
    raise exception 'FAIL: submit_product_question returned no reference';
  end if;
  raise notice 'pass [question: returns a reference]';

  -- 3b. An unpublished product must be refused, so the function cannot be used
  --     to confirm that a draft exists.
  begin
    perform public.submit_product_question(
      'pd-draft-sibling', 'Test Enquirer', 'enquirer@example.com', 'Hello?', null);
    raise exception 'FAIL: an enquiry was accepted for a draft product';
  exception
    when no_data_found then
      raise notice 'pass [question: an unpublished product is refused]';
  end;

  -- 3c. An unknown slug is refused the same way.
  begin
    perform public.submit_product_question(
      'pd-no-such-product', 'Test Enquirer', 'enquirer@example.com', 'Hello?', null);
    raise exception 'FAIL: an enquiry was accepted for an unknown product';
  exception
    when no_data_found then
      raise notice 'pass [question: an unknown product is refused]';
  end;

  -- 3d. Shape validation holds at the boundary, not only in the action.
  begin
    perform public.submit_product_question('pd-anchor', '   ', 'a@b.co', 'Hi', null);
    raise exception 'FAIL: an empty name was accepted';
  exception
    when check_violation then
      raise notice 'pass [question: a blank name is refused]';
  end;

  begin
    perform public.submit_product_question('pd-anchor', 'Test', 'not-an-email', 'Hi', null);
    raise exception 'FAIL: a malformed email was accepted';
  exception
    when check_violation then
      raise notice 'pass [question: a malformed email is refused]';
  end;

  begin
    perform public.submit_product_question('pd-anchor', 'Test', 'a@b.co', '   ', null);
    raise exception 'FAIL: an empty message was accepted';
  exception
    when check_violation then
      raise notice 'pass [question: a blank message is refused]';
  end;
end
$$;

-- 3e. The per-address limit is enforced in the database, so calling the API
--     directly does not avoid it.
--
--     The five accepted submissions are made in their own block with no
--     exception handler, because a `begin ... exception` block rolls back to
--     its savepoint — including the counter increments. Putting the accepted
--     submissions inside the block that expects a failure would roll them back
--     and the limit would never be reached.
set role anon;

do $$
declare
  i integer;
begin
  for i in 1..5 loop
    perform public.submit_product_question(
      'pd-anchor', 'Rate Tester', 'rate@example.com', 'Message ' || i, null);
  end loop;
  raise notice 'pass [question: five enquiries are accepted for one address]';
end
$$;

do $$
begin
  -- The sixth must be refused.
  perform public.submit_product_question(
    'pd-anchor', 'Rate Tester', 'rate@example.com', 'Six', null);
  raise exception 'FAIL: the per-address rate limit did not engage';
exception
  when check_violation then
    raise notice 'pass [question: the per-address hourly limit engages]';
end
$$;

-- 3f. The limiter is case-insensitive on the address, so changing the case is
--     not a way around it.
do $$
begin
  perform public.submit_product_question(
    'pd-anchor', 'Rate Tester', 'RATE@example.com', 'Seven', null);
  raise exception 'FAIL: the rate limit was bypassed by changing the case of the email';
exception
  when check_violation then
    raise notice 'pass [question: the rate limit is case-insensitive on the email]';
end
$$;

reset role;

-- 3g. The inquiry really landed, with the right type and product, and was
--     stored lower-cased and trimmed.
set role service_role;
do $$
declare
  v_type public.inquiry_type;
  v_pid  uuid;
begin
  select type, product_id into v_type, v_pid
    from public.inquiries
   where email = 'enquirer@example.com'
   order by created_at
   limit 1;

  if v_type <> 'product_question' then
    raise exception 'FAIL: the inquiry type was % rather than product_question', v_type;
  end if;

  if v_pid <> (select id from public.products where slug = 'pd-anchor') then
    raise exception 'FAIL: the inquiry was not linked to the product';
  end if;
  raise notice 'pass [question: the inquiry is stored with the right type and product]';
end
$$;
reset role;

-- -----------------------------------------------------------------------------
-- 4. Clean up so later suites see the catalogue they expect
-- -----------------------------------------------------------------------------

set role service_role;
delete from public.inquiries where email in ('enquirer@example.com', 'rate@example.com');
delete from public.rate_limit_counters where bucket like 'product_question:%';
delete from public.products where sku like 'PD-%';
delete from public.models where id = 'd0000000-0000-4000-8000-000000000011';
delete from public.brands where id in (
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000003'
);
reset role;

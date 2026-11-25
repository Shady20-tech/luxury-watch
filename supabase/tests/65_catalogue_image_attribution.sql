-- =============================================================================
-- 65 — Catalogue card image attribution (migration 0029)
--
-- The defect this proves fixed: 0028 added `credit`, `licence` and
-- `licence_url` to `product_images`, and the product detail gallery rendered
-- them — but the two RPCs behind every listing did not return them. So every
-- photographed card on `/shop`, each collection and brand page, the model pages,
-- `/search` and `/wishlist` showed a Wikimedia Commons photograph under CC BY or
-- CC BY-SA with no attribution.
--
-- Three things are proved:
--
--   1. `catalogue_search` returns the attribution belonging to the image it
--      actually selects. This matters more than it looks: the RPC resolves the
--      card's image with `order by is_primary desc, sort_order, id limit 1`, so
--      a credit read from any other row would attribute the wrong photograph. The
--      fixture below gives one product two images with different authors and
--      asserts the primary one's credit is what comes back.
--   2. `catalogue_by_ids` — the wishlist's source — returns the same columns, so
--      the surface a signed-in visitor curates is not the one that goes
--      uncredited.
--   3. A piece with no photograph reports no credit rather than a stray value,
--      which is what lets the card decide to render nothing.
--
-- Run after the seed, so the seed's own credit invariants are exercised too.
-- =============================================================================

\set ON_ERROR_STOP on

-- -----------------------------------------------------------------------------
-- Fixtures: one brand, one model, two products, three images and two credits.
--
--   * `attrib-two-images` has a primary photograph by "Primary Author" and a
--     secondary one by "Secondary Author". The card must carry the primary's.
--   * `attrib-no-image` has no image row at all.
-- -----------------------------------------------------------------------------

set role service_role;

insert into public.brands (id, name, slug, is_active)
values ('e6000000-0000-4000-8000-000000000001', 'Attrib Brand', 'attrib-brand', true)
on conflict (slug) do update set is_active = excluded.is_active;

insert into public.collections (id, title, slug, is_active)
values ('e6000000-0000-4000-8000-000000000002', 'Attrib Collection', 'attrib-collection', true)
on conflict (slug) do update set is_active = excluded.is_active;

insert into public.products (
  id, sku, slug, title, brand_id, reference_number, status, published_at,
  condition, price_cents, currency, price_on_request, is_featured, sort_order
)
values
  ('e6000000-0000-4000-8000-000000000010', 'ATTRIB-1', 'attrib-two-images',
   'Attrib Watch Two Images', 'e6000000-0000-4000-8000-000000000001',
   'AT-1', 'published', now(), 'unworn', 100000, 'USD', false, false, 0),
  ('e6000000-0000-4000-8000-000000000011', 'ATTRIB-2', 'attrib-no-image',
   'Attrib Watch No Image', 'e6000000-0000-4000-8000-000000000001',
   'AT-2', 'published', now(), 'unworn', 200000, 'USD', false, false, 0)
on conflict (slug) do update set status = excluded.status;

insert into public.product_images (
  id, product_id, storage_path, external_url, alt_text, sort_order, is_primary,
  credit, licence, licence_url, source_url
)
values
  -- The secondary image sorts first only by insertion; `is_primary` wins.
  ('e6000000-0000-4000-8000-000000000021', 'e6000000-0000-4000-8000-000000000010',
   null, '/seed-images/attrib-secondary.webp', 'Secondary photograph', 0, false,
   'Secondary Author', 'CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/',
   'https://commons.wikimedia.org/wiki/File:Attrib_secondary.jpg'),
  ('e6000000-0000-4000-8000-000000000020', 'e6000000-0000-4000-8000-000000000010',
   null, '/seed-images/attrib-primary.webp', 'Primary photograph', 5, true,
   'Primary Author', 'CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/',
   'https://commons.wikimedia.org/wiki/File:Attrib_primary.jpg')
on conflict (id) do update set
  credit = excluded.credit,
  licence = excluded.licence,
  licence_url = excluded.licence_url,
  source_url = excluded.source_url,
  is_primary = excluded.is_primary,
  sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- 1. `catalogue_search` carries the selected image's attribution
-- -----------------------------------------------------------------------------
set role anon;
do $$
declare
  v_credit    text;
  v_licence   text;
  v_lic_url   text;
  v_alt       text;
  v_nocredit  int;
begin
  select s.image_credit, s.image_licence, s.image_licence_url, s.image_alt
    into v_credit, v_licence, v_lic_url, v_alt
    from public.catalogue_search(p_scope => 'brand', p_scope_slug => 'attrib-brand') s
   where s.slug = 'attrib-two-images' limit 1;

  if v_credit is null then
    raise exception 'FAIL: catalogue_search returned no image credit for a photographed product';
  end if;

  -- The card shows the primary image, so the credit must be the primary's. A
  -- credit joined without matching the image's ordering would return the
  -- secondary author here and this is the assertion that would notice.
  if v_credit <> 'Primary Author' then
    raise exception 'FAIL: catalogue_search credited "%" but selects the primary photograph by "Primary Author"', v_credit;
  end if;
  if v_licence <> 'CC BY-SA 4.0' then
    raise exception 'FAIL: catalogue_search returned licence "%", expected CC BY-SA 4.0', v_licence;
  end if;
  if v_lic_url is null then
    raise exception 'FAIL: catalogue_search dropped the licence URL';
  end if;
  if v_alt <> 'Primary photograph' then
    raise exception 'FAIL: catalogue_search returned alt "%", expected the primary image''s', v_alt;
  end if;
  raise notice 'pass [search: credit belongs to the image the card selects]';

  -- 1b. The same row must be reachable through the unscoped listing, which is
  --     what `/shop` calls.
  select s.image_credit into v_credit
    from public.catalogue_search(p_scope => 'all', p_query => 'attrib two images') s
   where s.slug = 'attrib-two-images' limit 1;
  if v_credit is distinct from 'Primary Author' then
    raise exception 'FAIL: the unscoped listing lost the image credit (%)', coalesce(v_credit, 'null');
  end if;
  raise notice 'pass [search: the /shop listing carries the credit]';

  -- 1c. No photograph, no credit — so the card renders nothing rather than a
  --     dangling attribution.
  select count(*) into v_nocredit
    from public.catalogue_search(p_scope => 'brand', p_scope_slug => 'attrib-brand') s
   where s.slug = 'attrib-no-image'
     and (s.image_credit is not null or s.image_licence is not null);
  if v_nocredit <> 0 then
    raise exception 'FAIL: a product with no image reported a credit';
  end if;
  raise notice 'pass [search: a product with no photograph reports no credit]';
end $$;

-- -----------------------------------------------------------------------------
-- 2. `catalogue_by_ids` — the wishlist — returns the same attribution
-- -----------------------------------------------------------------------------
set role anon;
do $$
declare
  v_credit  text;
  v_licence text;
begin
  select c.image_credit, c.image_licence into v_credit, v_licence
    from public.catalogue_by_ids(array['e6000000-0000-4000-8000-000000000010'::uuid]) c;

  if v_credit is null then
    raise exception 'FAIL: catalogue_by_ids returned no image credit, so the wishlist shows it uncredited';
  end if;
  if v_credit <> 'Primary Author' or v_licence <> 'CC BY-SA 4.0' then
    raise exception 'FAIL: catalogue_by_ids credited "%" / "%"', v_credit, v_licence;
  end if;
  raise notice 'pass [wishlist: catalogue_by_ids carries the credit]';
end $$;

-- -----------------------------------------------------------------------------
-- 3. `catalogue_similar` — the related rail — carries the credit too
--
--    The product page credited its gallery photograph and then showed up to eight
--    related cards from this function with no attribution. This asserts the rail
--    is fixed, and that it attributes the image each related card selects.
-- -----------------------------------------------------------------------------
set role anon;
do $$
declare
  v_credited  int;
  v_photographed int;
  v_wrong     int;
begin
  select count(*) filter (where s.image_external_url is not null),
         count(*) filter (where s.image_credit is not null)
    into v_photographed, v_credited
    from public.catalogue_similar('e6000000-0000-4000-8000-000000000011'::uuid) s;

  if v_credited = 0 then
    raise exception 'FAIL: catalogue_similar returned no image credit, so the related rail shows it uncredited';
  end if;
  if v_credited < v_photographed then
    raise exception 'FAIL: % related card(s) have a photograph but only % carry a credit',
      v_photographed, v_credited;
  end if;

  -- A credit that is not the image's is worse than none: it attributes somebody
  -- else's photograph. The fixture's only image is the primary by "Primary
  -- Author", so anything else here means the join lost the image's ordering.
  select count(*) into v_wrong
    from public.catalogue_similar('e6000000-0000-4000-8000-000000000011'::uuid) s
   where s.image_credit is not null and s.image_credit <> 'Primary Author';
  if v_wrong <> 0 then
    raise exception 'FAIL: % related card(s) credited a photograph they do not show', v_wrong;
  end if;
  raise notice 'pass [related: catalogue_similar carries the credit]';
end $$;

-- -----------------------------------------------------------------------------
-- 4. The seed's own photography is fully credited
--
-- The seed is the only real photography in the project, so this is where a new
-- image row without a credit would be caught. It runs against the seed rather
-- than the fixture above.
-- -----------------------------------------------------------------------------
set role anon;
do $$
declare
  v_uncredited int;
begin
  select count(*) into v_uncredited
    from public.catalogue_search(p_scope => 'all', p_limit => 60) s
   where s.image_external_url is not null
     and s.image_external_url like '/seed-images/%'
     and (s.image_credit is null or s.image_licence is null);

  if v_uncredited <> 0 then
    raise exception 'FAIL: % seeded catalogue image(s) are shown without a complete credit', v_uncredited;
  end if;
  raise notice 'pass [seed: every seeded photograph carries an author and a licence]';
end $$;

-- -----------------------------------------------------------------------------
-- Cleanup, so a re-run of the suite starts from the same state.
-- -----------------------------------------------------------------------------
set role service_role;
delete from public.product_images
 where product_id in ('e6000000-0000-4000-8000-000000000010', 'e6000000-0000-4000-8000-000000000011');
delete from public.products
 where id in ('e6000000-0000-4000-8000-000000000010', 'e6000000-0000-4000-8000-000000000011');
delete from public.collections where id = 'e6000000-0000-4000-8000-000000000002';
delete from public.brands where id = 'e6000000-0000-4000-8000-000000000001';

-- =============================================================================
-- 0016 — Catalogue discovery: search across collections
--
-- -----------------------------------------------------------------------------
-- WHY THIS IS A NEW MIGRATION AND NOT AN EDIT TO 0010
-- -----------------------------------------------------------------------------
--
-- `create or replace function` means the last definition in the migration
-- sequence wins. 0010 created `catalogue_filtered` and `catalogue_suggest`, and
-- nothing since has redefined them, so 0010 is still the governing definition —
-- but editing a migration that has already run in an environment does not change
-- that environment. A new migration applies everywhere, so the change belongs
-- here. This is the same rule AGENTS.md records for `cart_pricing`.
--
-- -----------------------------------------------------------------------------
-- THE GAP
-- -----------------------------------------------------------------------------
--
-- Phase 5's prompt requires search across products, brands, models AND
-- collections. `catalogue_suggest` already returns collection hits, but
-- `catalogue_filtered` — which is what the results grid reads — searched only
-- product fields plus brand and model names. So typing a collection's name
-- produced a suggestion that, when followed, ran a search that matched nothing:
-- the suggestion promised a result set the search could not deliver.
--
-- The fix is a correlated `exists` against `collection_products` and
-- `collections`, mirroring the `collection` facet's own join. A product matches a
-- collection term when it belongs to an active collection whose title matches,
-- which is what "search collections" has to mean for a product grid: the grid
-- cannot show a collection, so it shows the pieces in it.
--
-- The `exists` is deliberately gated on the same `c.is_active` the facet and the
-- RLS policy use. A definer function bypasses RLS, so re-applying the rule here
-- is what keeps an inactive collection from becoming a searchable oracle.
--
-- -----------------------------------------------------------------------------
-- THE SUGGEST DETAIL
-- -----------------------------------------------------------------------------
--
-- `catalogue_suggest` reported a brand as `count(p.id) || ' pieces'` where the
-- count joined only `status = 'published'`. The word is wrong for this
-- catalogue — the storefront calls them watches everywhere else — and, more
-- importantly, the count is a number the brand page then has to match. It is
-- computed the same way here (published products for the brand) so the
-- suggestion and the brand page cannot disagree.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- An index for the new correlated lookup.
--
-- `collection_products` already has `(product_id)`, which serves
-- "collections of this product". The search goes the other way — from a
-- matching collection title to its products — so `(collection_id)` is what the
-- `exists` needs when it starts from the collection side. The primary key
-- `(collection_id, product_id)` already covers that prefix, so no new index is
-- added here; this comment records why, so the next reader does not add a
-- duplicate.
-- -----------------------------------------------------------------------------

create or replace function public.catalogue_filtered(
  p_scope          text    default 'all',   -- 'all' | 'collection' | 'brand'
  p_scope_slug     text    default null,
  p_query          text    default null,
  p_brands         text[]  default null,    -- brand slugs
  p_collections    text[]  default null,    -- collection slugs
  p_models         text[]  default null,    -- model slugs
  p_conditions     text[]  default null,    -- product_condition values
  p_case_materials text[]  default null,
  p_dial_colors    text[]  default null,
  p_movements      text[]  default null,
  p_bracelets      text[]  default null,
  p_genders        text[]  default null,
  p_year_min       integer default null,
  p_year_max       integer default null,
  p_case_min       numeric default null,
  p_case_max       numeric default null,
  p_price_min      bigint  default null,    -- minor units (cents)
  p_price_max      bigint  default null,
  p_price_mode     text    default 'any',   -- 'any' | 'priced' | 'on_request'
  p_box_and_papers boolean default null,
  p_availability   text    default 'any',   -- 'any' | 'available' | 'reserved'
  p_exclude        text    default null
)
returns setof public.products
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.*
    from public.products p
    left join public.brands b on b.id = p.brand_id
    left join public.models m on m.id = p.model_id
   where p.status = 'published'
     and (
       p_scope = 'all'
       or (
         p_scope = 'collection'
         and exists (
           select 1
             from public.collection_products cp
             join public.collections c on c.id = cp.collection_id
            where cp.product_id = p.id
              and c.slug = p_scope_slug
              and c.is_active
         )
       )
       or (
         p_scope = 'brand'
         and b.slug = p_scope_slug
         and b.is_active
       )
     )
     -- Text search across every entity the prompt names: the product's own
     -- fields, its brand, its model, and the collections it belongs to.
     and (
       nullif(btrim(coalesce(p_query, '')), '') is null
       or to_tsvector('english',
            coalesce(p.title, '') || ' ' || coalesce(p.reference_number, '') || ' ' ||
            coalesce(p.short_description, '') || ' ' || coalesce(p.case_material, '') || ' ' ||
            coalesce(p.dial_color, '')
          ) @@ websearch_to_tsquery('english', p_query)
       or p.title ilike public.catalogue_like_pattern(p_query) escape '\'
       or p.reference_number ilike public.catalogue_like_pattern(p_query) escape '\'
       or p.sku ilike public.catalogue_like_pattern(p_query) escape '\'
       or b.name ilike public.catalogue_like_pattern(p_query) escape '\'
       or m.name ilike public.catalogue_like_pattern(p_query) escape '\'
       -- Collections. The `exists` short-circuits per product, and the
       -- collection title is indexed by collections_slug_key / title ordering,
       -- so this stays a bounded lookup rather than a scan of every product.
       or exists (
         select 1
           from public.collection_products cp3
           join public.collections c3 on c3.id = cp3.collection_id
          where cp3.product_id = p.id
            and c3.is_active
            and c3.title ilike public.catalogue_like_pattern(p_query) escape '\'
       )
     )
     and (p_exclude = 'brand'        or p_brands is null         or b.slug = any (p_brands))
     and (p_exclude = 'model'        or p_models is null         or m.slug = any (p_models))
     and (p_exclude = 'condition'    or p_conditions is null     or p.condition::text = any (p_conditions))
     and (p_exclude = 'caseMaterial' or p_case_materials is null or p.case_material = any (p_case_materials))
     and (p_exclude = 'dialColor'    or p_dial_colors is null    or p.dial_color = any (p_dial_colors))
     and (p_exclude = 'movement'     or p_movements is null      or p.movement = any (p_movements))
     and (p_exclude = 'bracelet'     or p_bracelets is null      or p.bracelet_material = any (p_bracelets))
     and (p_exclude = 'gender'       or p_genders is null        or p.gender = any (p_genders))
     and (
       p_exclude = 'collection'
       or p_collections is null
       or exists (
         select 1
           from public.collection_products cp2
           join public.collections c2 on c2.id = cp2.collection_id
          where cp2.product_id = p.id
            and c2.slug = any (p_collections)
            and c2.is_active
       )
     )
     and (p_exclude = 'year'  or p_year_min is null or p.production_year >= p_year_min)
     and (p_exclude = 'year'  or p_year_max is null or p.production_year <= p_year_max)
     and (p_exclude = 'case'  or p_case_min is null or p.case_size_mm >= p_case_min)
     and (p_exclude = 'case'  or p_case_max is null or p.case_size_mm <= p_case_max)
     and (p_exclude = 'price' or p_price_min is null or p.price_cents >= p_price_min)
     and (p_exclude = 'price' or p_price_max is null or p.price_cents <= p_price_max)
     and (p_exclude = 'boxAndPapers' or p_box_and_papers is null or p.box_and_papers = p_box_and_papers)
     and (
       p_exclude = 'price'
       or p_price_mode is null
       or p_price_mode = 'any'
       or (p_price_mode = 'priced'     and not p.price_on_request)
       or (p_price_mode = 'on_request' and p.price_on_request)
     )
     and (
       p_exclude = 'availability'
       or p_availability is null
       or p_availability = 'any'
       or (p_availability = 'available' and     public.is_product_available(p.id))
       or (p_availability = 'reserved'  and not public.is_product_available(p.id))
     );
$$;

comment on function public.catalogue_filtered(text, text, text, text[], text[], text[], text[], text[], text[], text[], text[], text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text, text) is
  'The internal catalogue query. Returns whole products rows, so it is NOT '
  'granted to any API role: catalogue_search, catalogue_facets and '
  'catalogue_suggest are the public entry points.';

-- -----------------------------------------------------------------------------
-- The suggest detail wording.
--
-- Replaced rather than patched so the count and the brand page read the same
-- quantity. Everything else about the function is unchanged.
-- -----------------------------------------------------------------------------

create or replace function public.catalogue_suggest(
  p_query text default '',
  p_limit integer default 8
)
returns table (
  kind   text,
  label  text,
  detail text,
  href   text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounded as (
    select least(greatest(coalesce(p_limit, 8), 1), 12) as n
  ),
  needle as (
    select nullif(btrim(coalesce(p_query, '')), '') as q
  ),
  product_hits as (
    select 'product'::text as kind,
           p.title as label,
           nullif(concat_ws(' · ', b.name, p.reference_number), '') as detail,
           '/products/' || p.slug as href,
           0 as rank
      from public.products p
      left join public.brands b on b.id = p.brand_id
     where (select q from needle) is not null
       and p.status = 'published'
       and (
         p.title ilike public.catalogue_like_pattern((select q from needle)) escape '\'
         or p.reference_number ilike public.catalogue_like_pattern((select q from needle)) escape '\'
         or p.sku ilike public.catalogue_like_pattern((select q from needle)) escape '\'
         or b.name ilike public.catalogue_like_pattern((select q from needle)) escape '\'
       )
     order by p.is_featured desc, p.published_at desc nulls last, p.id
     limit (select n from bounded)
  ),
  brand_hits as (
    select 'brand'::text as kind,
           b.name as label,
           case count(p.id)
             when 0 then null
             when 1 then '1 watch'
             else count(p.id)::text || ' watches'
           end as detail,
           '/brands/' || b.slug as href,
           1 as rank
      from public.brands b
      left join public.products p on p.brand_id = b.id and p.status = 'published'
     where (select q from needle) is not null
       and b.is_active
       and b.name ilike public.catalogue_like_pattern((select q from needle)) escape '\'
     group by b.id, b.name, b.slug
     order by count(p.id) desc, b.name
     limit (select n from bounded)
  ),
  collection_hits as (
    select 'collection'::text as kind,
           c.title as label,
           -- The published count, so the suggestion agrees with the badge on
           -- the collections index.
           (
             select case count(*)
                      when 0 then null
                      when 1 then '1 watch'
                      else count(*)::text || ' watches'
                    end
               from public.collection_products cp
               join public.products cp_p on cp_p.id = cp.product_id
              where cp.collection_id = c.id
                and cp_p.status = 'published'
           ) as detail,
           '/collections/' || c.slug as href,
           1 as rank
      from public.collections c
     where (select q from needle) is not null
       and c.is_active
       and c.title ilike public.catalogue_like_pattern((select q from needle)) escape '\'
     order by c.sort_order
     limit (select n from bounded)
  ),
  model_hits as (
    select 'model'::text as kind,
           m.name as label,
           b.name as detail,
           '/brands/' || b.slug || '?model=' || m.slug as href,
           1 as rank
      from public.models m
      join public.brands b on b.id = m.brand_id
     where (select q from needle) is not null
       and m.is_active
       and b.is_active
       and m.name ilike public.catalogue_like_pattern((select q from needle)) escape '\'
     order by m.name
     limit (select n from bounded)
  )
  select kind, label, detail, href from (
    select * from brand_hits
    union all
    select * from collection_hits
    union all
    select * from model_hits
    union all
    select * from product_hits
  ) s
  order by rank, label
  limit (select n from bounded) + 4;
$$;

comment on function public.catalogue_suggest(text, integer) is
  'Typeahead suggestions across brands, collections, models and products. '
  'Security definer, so every visibility rule is re-applied in the body; a '
  'blank query returns nothing.';

revoke execute on function public.catalogue_filtered(text, text, text, text[], text[], text[], text[], text[], text[], text[], text[], text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text, text) from public;
revoke execute on function public.catalogue_filtered(text, text, text, text[], text[], text[], text[], text[], text[], text[], text[], text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text, text) from anon, authenticated;

grant execute on function public.catalogue_suggest(text, integer) to anon, authenticated;

-- `catalogue_search` and `catalogue_facets` are untouched by this migration but
-- call the redefined `catalogue_filtered`. Their grants are restated so a
-- migration applied to a fresh database ends in the same grant state as one
-- applied over 0010, which is the state `16_catalogue.sql` asserts.
grant execute on function public.catalogue_search(text, text, text, text[], text[], text[], text[], text[], text[], text[], text[], text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text, text, integer, integer) to anon, authenticated;
grant execute on function public.catalogue_facets(text, text, text, text[], text[], text[], text[], text[], text[], text[], text[], text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text) to anon, authenticated;


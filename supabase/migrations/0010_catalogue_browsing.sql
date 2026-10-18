-- =============================================================================
-- 0010 — Catalogue browsing: search, facets and sorting
--
-- The storefront catalogue must be searchable, filterable and sortable without
-- ever pulling the whole catalogue into the application. This migration adds
-- the database side of that.
--
-- -----------------------------------------------------------------------------
-- WHY THESE LIVE IN THE DATABASE RATHER THAN IN THE APPLICATION
-- -----------------------------------------------------------------------------
--
-- The catalogue holds over four thousand products and the deployed client is a
-- browser holding a public anon key. Any filtering done in the application
-- would mean selecting every published product first — megabytes over the wire,
-- on every request, from a client that anyone can point at the API directly.
--
-- PostgREST can express equality and `in` filters, but it cannot express:
--   * a facet aggregation (there is no GROUP BY),
--   * full-text ranking,
--   * a filtered count and a filtered page in one round trip.
--
-- So the filtering, counting and facet aggregation happen here, and only the
-- requested page and the aggregate totals cross the wire.
--
-- -----------------------------------------------------------------------------
-- WHAT MAY BE CALLED BY THE PUBLIC, AND WHY
-- -----------------------------------------------------------------------------
--
-- Only `catalogue_search`, `catalogue_facets` and `catalogue_suggest` are
-- granted to `anon`/`authenticated`. Each returns an explicit column list that
-- deliberately excludes `cost_cents`, `compare_at_cents` and `sort_order`:
-- cost price is the business's margin and has no place on a public endpoint.
--
-- `catalogue_filtered` is the internal query used by the other two. It returns
-- whole `products` rows, so it is deliberately **not** granted to any API role.
-- A `security definer` function runs with the owner's privileges and the owner
-- can call it regardless of grants, so withholding the grant costs nothing and
-- keeps a full-row read off the public surface. This is the same reasoning as
-- 0009's decision to expose stock as a boolean rather than a row.
--
-- -----------------------------------------------------------------------------
-- PUBLICATION GATE
-- -----------------------------------------------------------------------------
--
-- These functions are `security definer` so they can read `brands`, `models`
-- and `collections` for facet labels in one pass. A definer function bypasses
-- Row Level Security, so it must re-apply every visibility rule the policies
-- would have applied:
--
--   * `products.status = 'published'`  — the storefront gate (products_public_read)
--   * `brands.is_active`               — brands_public_read
--   * `models.is_active`               — models_public_read
--   * `collections.is_active`          — collections_public_read
--
-- Without those clauses these functions would become an oracle that reveals
-- draft products, inactive brands and unpublished collections through the facet
-- counts. Each is applied below and asserted by `supabase/tests/16_catalogue.sql`.
--
-- -----------------------------------------------------------------------------
-- BOUNDED RESULT SETS
-- -----------------------------------------------------------------------------
--
-- `catalogue_search` clamps its own page size, so a caller cannot ask for the
-- whole catalogue by passing a large `p_limit`. The clamp is in the database,
-- not only in the application, because the API is reachable with the public
-- anon key.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- catalogue_like_pattern — escape LIKE metacharacters in user input
--
-- `%` and `_` are wildcards in LIKE. A visitor searching for "%" would otherwise
-- match every row, and a long run of `%` is a cheap way to make the database do
-- avoidable work. Escaping turns the input into a literal.
--
-- Declared before `catalogue_filtered`, which calls it.
-- -----------------------------------------------------------------------------

create or replace function public.catalogue_like_pattern(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select '%' || replace(replace(replace(coalesce(p_value, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

comment on function public.catalogue_like_pattern(text) is
  'Wraps a search term in a LIKE pattern, escaping backslash, percent and '
  'underscore so user input is matched literally rather than as wildcards.';

-- -----------------------------------------------------------------------------
-- catalogue_condition_label — the display label for a condition value
--
-- Kept in the database so the facet labels and any future admin screen agree on
-- one spelling.
-- -----------------------------------------------------------------------------

create or replace function public.catalogue_condition_label(p_value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_value
           when 'new'       then 'New'
           when 'unworn'    then 'Unworn'
           when 'pre_owned' then 'Pre-owned'
           when 'vintage'   then 'Vintage'
           else initcap(replace(coalesce(p_value, ''), '_', ' '))
         end;
$$;

comment on function public.catalogue_condition_label(text) is
  'Display label for a product_condition value, used by the facet payload.';

-- -----------------------------------------------------------------------------
-- catalogue_filtered — the single definition of "a product the visitor can see,
-- matching these filters"
--
-- Every other function in this file reads through this one, so the publication
-- gate and the filter semantics exist in exactly one place. If a filter is
-- wrong, it is wrong once.
--
-- NOT granted to anon/authenticated: see "WHAT MAY BE CALLED BY THE PUBLIC".
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
  -- 'any' | 'available' | 'reserved'. A text value rather than a second
  -- boolean, so the sidebar can offer "Reserved" as well as "Available": a
  -- reserved watch is a real, browsable state, and an availability filter that
  -- could only ever answer "yes" would be half a control.
  p_availability   text    default 'any',
  -- Names one facet dimension whose own filter is skipped. `catalogue_facets`
  -- calls this once per dimension with `p_exclude` set to that dimension, which
  -- is what keeps a facet list multi-select: without it, selecting Rolex would
  -- make every other brand count zero and the visitor could never add a second
  -- brand to the same filter.
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
     -- Scope. An inactive or unknown scope slug yields nothing rather than
     -- silently widening to the whole catalogue.
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
     -- Text search. Full-text first (uses products_search_idx); the ILIKE
     -- fallback covers the partial words a shopper types mid-word, which
     -- full-text cannot match.
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
     )
     -- Facet filters. Each is "any of", and each is skipped when the array is
     -- absent, so an unfiltered request passes no arrays at all. Each is also
     -- skipped when `p_exclude` names its own dimension, which is how
     -- `catalogue_facets` counts one dimension against every filter except its
     -- own.
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
     -- Ranges. A null bound means "open in that direction". The price and year
     -- and case dimensions are each excluded on their own pass too.
     and (p_exclude = 'year'  or p_year_min is null or p.production_year >= p_year_min)
     and (p_exclude = 'year'  or p_year_max is null or p.production_year <= p_year_max)
     and (p_exclude = 'case'  or p_case_min is null or p.case_size_mm >= p_case_min)
     and (p_exclude = 'case'  or p_case_max is null or p.case_size_mm <= p_case_max)
     and (p_exclude = 'price' or p_price_min is null or p.price_cents >= p_price_min)
     and (p_exclude = 'price' or p_price_max is null or p.price_cents <= p_price_max)
     and (p_exclude = 'boxAndPapers' or p_box_and_papers is null or p.box_and_papers = p_box_and_papers)
     -- Price mode and availability are excluded together with the price range,
     -- because the sidebar presents them as one "pricing" group and one
     -- "availability" group.
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
  'The single definition of a publicly visible product matching the catalogue '
  'filters. Re-applies the publication gate that `security definer` bypasses. '
  'Returns whole rows, so it is NOT granted to anon/authenticated; the public '
  'entry points are catalogue_search, catalogue_facets and catalogue_suggest.';

-- -----------------------------------------------------------------------------
-- catalogue_search — one page of results
--
-- Ordering is expressed with CASE keys rather than dynamic SQL: building an
-- ORDER BY string from a caller-supplied value is how SQL injection is
-- introduced, and an unrecognised sort falls back to the default instead of
-- raising. Every ordering ends with `id` so pagination is stable — without a
-- total order, two pages can repeat or skip a row.
--
-- The returned columns are an explicit list. `cost_cents`, `compare_at_cents`
-- and `sort_order` are deliberately absent.
-- -----------------------------------------------------------------------------

create or replace function public.catalogue_search(
  p_scope          text    default 'all',
  p_scope_slug     text    default null,
  p_query          text    default null,
  p_brands         text[]  default null,
  p_collections    text[]  default null,
  p_models         text[]  default null,
  p_conditions     text[]  default null,
  p_case_materials text[]  default null,
  p_dial_colors    text[]  default null,
  p_movements      text[]  default null,
  p_bracelets      text[]  default null,
  p_genders        text[]  default null,
  p_year_min       integer default null,
  p_year_max       integer default null,
  p_case_min       numeric default null,
  p_case_max       numeric default null,
  p_price_min      bigint  default null,
  p_price_max      bigint  default null,
  p_price_mode     text    default 'any',
  p_box_and_papers boolean default null,
  p_availability   text    default 'any',
  p_sort           text    default 'featured',
  p_limit          integer default 24,
  p_offset         integer default 0
)
returns table (
  id                uuid,
  slug              text,
  title             text,
  brand_name        text,
  brand_slug        text,
  model_name        text,
  model_slug        text,
  reference_number  text,
  production_year   integer,
  condition         text,
  case_size_mm      numeric,
  case_material     text,
  movement          text,
  dial_color        text,
  bracelet_material text,
  gender            text,
  box_and_papers    boolean,
  price_cents       bigint,
  currency          text,
  price_on_request  boolean,
  published_at      timestamptz,
  is_featured       boolean,
  image_storage_path text,
  image_external_url text,
  image_alt         text,
  is_available      boolean,
  total_count       bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounded as (
    select
      least(greatest(coalesce(p_limit, 24), 1), 60)  as page_size,
      greatest(coalesce(p_offset, 0), 0)             as page_offset
  ),
  filtered as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability
    )
  ),
  page as (
    select f.*,
           -- The sort is materialised as a row number rather than relying on
           -- the outer query preserving this ORDER BY. Postgres does not
           -- guarantee that a non-materialised CTE's ordering survives a join,
           -- and the LEFT JOINs below are exactly such a join — without the row
           -- number the price sort silently returned nulls first.
           row_number() over (
             order by
               case when p_sort = 'relevance' and nullif(btrim(coalesce(p_query, '')), '') is not null
                    then ts_rank(
                      to_tsvector('english',
                        coalesce(f.title, '') || ' ' || coalesce(f.reference_number, '') || ' ' ||
                        coalesce(f.short_description, '') || ' ' || coalesce(f.case_material, '') || ' ' ||
                        coalesce(f.dial_color, '')
                      ),
                      websearch_to_tsquery('english', p_query)
                    )
               end desc,
               case when p_sort = 'price_asc'  then f.price_cents end asc  nulls last,
               case when p_sort = 'price_desc' then f.price_cents end desc nulls last,
               case when p_sort = 'oldest'     then f.published_at end asc  nulls last,
               case when p_sort = 'title_asc'  then f.title end asc,
               case when p_sort = 'title_desc' then f.title end desc,
               case when p_sort = 'reference_asc' then f.reference_number end asc nulls last,
               -- Default, 'newest' and 'featured'. 'featured' also honours the
               -- manual sort_order, which is the only ordering an editor
               -- controls directly.
               case when p_sort not in ('price_asc','price_desc','oldest','title_asc','title_desc','reference_asc')
                    then f.is_featured end desc,
               case when p_sort not in ('price_asc','price_desc','oldest','title_asc','title_desc','reference_asc')
                    then f.sort_order end asc,
               f.published_at desc nulls last,
               f.id
           ) as row_number
      from filtered f
     order by row_number
     limit (select page_size from bounded)
    offset (select page_offset from bounded)
  )
  select
    pg.id,
    pg.slug,
    pg.title,
    b.name,
    b.slug,
    m.name,
    m.slug,
    pg.reference_number,
    pg.production_year,
    pg.condition::text,
    pg.case_size_mm,
    pg.case_material,
    pg.movement,
    pg.dial_color,
    pg.bracelet_material,
    pg.gender,
    pg.box_and_papers,
    pg.price_cents,
    pg.currency::text,
    pg.price_on_request,
    pg.published_at,
    pg.is_featured,
    img.storage_path,
    img.external_url,
    img.alt_text,
    public.is_product_available(pg.id),
    (select count(*) from filtered)
  from page pg
  left join public.brands b on b.id = pg.brand_id
  left join public.models m on m.id = pg.model_id
  -- The primary image, resolved in one lateral so a product with several images
  -- does not multiply its own row. A primary image wins; otherwise the first by
  -- sort_order. Products with no image return null and the card renders its
  -- labelled placeholder.
  left join lateral (
    select pi.storage_path, pi.external_url, pi.alt_text
      from public.product_images pi
     where pi.product_id = pg.id
     order by pi.is_primary desc, pi.sort_order asc, pi.id
     limit 1
  ) img on true
  -- Restore the ordering after the joins. The page was selected in order, but a
  -- join is free to reorder its input, so the order is reasserted here.
  order by pg.row_number;
$$;

comment on function public.catalogue_search(text, text, text, text[], text[], text[], text[], text[], text[], text[], text[], text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text, text, integer, integer) is
  'One page of catalogue results plus the total match count. The page size is '
  'clamped inside the function so the whole catalogue cannot be requested. '
  'Returns an explicit column list that excludes cost and merchandising fields.';

-- -----------------------------------------------------------------------------
-- catalogue_facets — the filter sidebar in one round trip
--
-- Returns a single jsonb document rather than one row per facet value. The
-- alternative — several queries, or a UNION with a discriminator column —
-- either multiplies round trips or pushes the aggregation into the client,
-- which is the pattern this migration exists to avoid.
--
-- Each dimension is aggregated over the set filtered by *every* dimension, so
-- the counts describe what the visitor would actually see. The selected values
-- inside a dimension remain listed because the filter for that dimension admits
-- any of the selected values rather than all of them.
-- -----------------------------------------------------------------------------

create or replace function public.catalogue_facets(
  p_scope          text    default 'all',
  p_scope_slug     text    default null,
  p_query          text    default null,
  p_brands         text[]  default null,
  p_collections    text[]  default null,
  p_models         text[]  default null,
  p_conditions     text[]  default null,
  p_case_materials text[]  default null,
  p_dial_colors    text[]  default null,
  p_movements      text[]  default null,
  p_bracelets      text[]  default null,
  p_genders        text[]  default null,
  p_year_min       integer default null,
  p_year_max       integer default null,
  p_case_min       numeric default null,
  p_case_max       numeric default null,
  p_price_min      bigint  default null,
  p_price_max      bigint  default null,
  p_price_mode     text    default 'any',
  p_box_and_papers boolean default null,
  p_availability   text    default 'any'
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- Every dimension is counted against the active filters EXCEPT its own, so a
  -- facet list stays multi-select. Counting a dimension against its own filter
  -- would zero every unselected value the moment one was chosen, and a visitor
  -- could never add a second brand.
  --
  -- The `total` is the one exception: it describes the whole filtered set, so it
  -- uses every filter including each dimension's own.
  with filtered as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability
    )
  ),
  -- One pass per dimension, each skipping its own filter.
  for_brand as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'brand'
    )
  ),
  for_collection as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'collection'
    )
  ),
  for_model as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'model'
    )
  ),
  for_condition as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'condition'
    )
  ),
  for_case_material as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'caseMaterial'
    )
  ),
  for_dial_color as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'dialColor'
    )
  ),
  for_movement as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'movement'
    )
  ),
  for_bracelet as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'bracelet'
    )
  ),
  for_gender as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'gender'
    )
  ),
  for_box as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'boxAndPapers'
    )
  ),
  for_availability as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'availability'
    )
  ),
  for_price as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'price'
    )
  ),
  for_year as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'year'
    )
  ),
  for_case as materialized (
    select * from public.catalogue_filtered(
      p_scope, p_scope_slug, p_query, p_brands, p_collections, p_models,
      p_conditions, p_case_materials, p_dial_colors, p_movements, p_bracelets,
      p_genders, p_year_min, p_year_max, p_case_min, p_case_max,
      p_price_min, p_price_max, p_price_mode, p_box_and_papers,
      p_availability, 'case'
    )
  ),
  by_brand as (
    select b.slug as value, b.name as label, count(*) as n
      from for_brand f
      join public.brands b on b.id = f.brand_id
     where b.is_active
     group by b.slug, b.name
  ),
  by_collection as (
    select c.slug as value, c.title as label, count(*) as n
      from for_collection f
      join public.collection_products cp on cp.product_id = f.id
      join public.collections c on c.id = cp.collection_id
     where c.is_active
     group by c.slug, c.title
  ),
  by_model as (
    select m.slug as value, m.name as label, count(*) as n
      from for_model f
      join public.models m on m.id = f.model_id
     where m.is_active
     group by m.slug, m.name
  ),
  by_condition as (
    select f.condition::text as value, count(*) as n
      from for_condition f
     where f.condition is not null
     group by f.condition
  ),
  by_case_material as (
    select f.case_material as value, count(*) as n
      from for_case_material f
     where f.case_material is not null
     group by f.case_material
  ),
  by_dial_color as (
    select f.dial_color as value, count(*) as n
      from for_dial_color f
     where f.dial_color is not null
     group by f.dial_color
  ),
  by_movement as (
    select f.movement as value, count(*) as n
      from for_movement f
     where f.movement is not null
     group by f.movement
  ),
  by_bracelet as (
    select f.bracelet_material as value, count(*) as n
      from for_bracelet f
     where f.bracelet_material is not null
     group by f.bracelet_material
  ),
  by_gender as (
    select f.gender as value, count(*) as n
      from for_gender f
     where f.gender is not null
     group by f.gender
  ),
  by_box as (
    select f.box_and_papers::text as value, count(*) as n
      from for_box f
     where f.box_and_papers is not null
     group by f.box_and_papers
  ),
  by_availability as (
    select case when public.is_product_available(f.id) then 'available' else 'reserved' end as value,
           count(*) as n
      from for_availability f
     group by public.is_product_available(f.id)
  ),
  -- The price range describes the set with the other filters applied but not the
  -- price filter itself, so the control can be re-bounded after a price filter
  -- is set without collapsing to the current selection. Priced products only:
  -- including price-on-request pieces (which have a null price) would make the
  -- range meaningless.
  price_range as (
    select min(f.price_cents) as min_price,
           max(f.price_cents) as max_price,
           count(f.price_cents) as priced_count
      from for_price f
     where not f.price_on_request
  ),
  years as (
    select min(f.production_year) as min_year, max(f.production_year) as max_year
      from for_year f
  ),
  cases as (
    select min(f.case_size_mm) as min_case, max(f.case_size_mm) as max_case
      from for_case f
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'brand',        coalesce((select jsonb_agg(jsonb_build_object('value', value, 'label', label, 'count', n) order by n desc, label) from by_brand), '[]'::jsonb),
    'collection',   coalesce((select jsonb_agg(jsonb_build_object('value', value, 'label', label, 'count', n) order by n desc, label) from by_collection), '[]'::jsonb),
    'model',        coalesce((select jsonb_agg(jsonb_build_object('value', value, 'label', label, 'count', n) order by n desc, label) from by_model), '[]'::jsonb),
    'condition',    coalesce((select jsonb_agg(jsonb_build_object('value', value, 'label', public.catalogue_condition_label(value), 'count', n) order by value) from by_condition), '[]'::jsonb),
    'caseMaterial', coalesce((select jsonb_agg(jsonb_build_object('value', value, 'label', value, 'count', n) order by n desc, value) from by_case_material), '[]'::jsonb),
    'dialColor',    coalesce((select jsonb_agg(jsonb_build_object('value', value, 'label', value, 'count', n) order by n desc, value) from by_dial_color), '[]'::jsonb),
    'movement',     coalesce((select jsonb_agg(jsonb_build_object('value', value, 'label', value, 'count', n) order by n desc, value) from by_movement), '[]'::jsonb),
    'bracelet',     coalesce((select jsonb_agg(jsonb_build_object('value', value, 'label', value, 'count', n) order by n desc, value) from by_bracelet), '[]'::jsonb),
    'gender',       coalesce((select jsonb_agg(jsonb_build_object('value', value, 'label', value, 'count', n) order by n desc, value) from by_gender), '[]'::jsonb),
    'boxAndPapers', coalesce((select jsonb_agg(jsonb_build_object('value', value, 'label', case when value = 'true' then 'Box & papers' else 'No box & papers' end, 'count', n) order by value) from by_box), '[]'::jsonb),
    'availability', coalesce((select jsonb_agg(jsonb_build_object('value', value, 'label', case when value = 'available' then 'Available' else 'Reserved' end, 'count', n) order by value) from by_availability), '[]'::jsonb),
    'priceRange', jsonb_build_object(
      'min', (select min_price from price_range),
      'max', (select max_price from price_range),
      'pricedCount', (select priced_count from price_range)
    ),
    'yearRange', jsonb_build_object(
      'min', (select min_year from years),
      'max', (select max_year from years)
    ),
    'caseSizeRange', jsonb_build_object(
      'min', (select min_case from cases),
      'max', (select max_case from cases)
    )
  );
$$;

comment on function public.catalogue_facets(text, text, text, text[], text[], text[], text[], text[], text[], text[], text[], text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text) is
  'Facet values with counts for the filtered catalogue, plus the total match '
  'count and the real price/year/case ranges, as a single jsonb document.';

-- -----------------------------------------------------------------------------
-- catalogue_suggest — autocomplete across products, brands, models, collections
--
-- Kept separate from `catalogue_search` because it answers a different question
-- ("what could they mean?") with a different shape (a label and a destination),
-- and because it must stay cheap enough to run on every keystroke.
--
-- A model has no page of its own, so a model suggestion points at its brand's
-- listing filtered by that model. Pointing it at `/collections/<model-slug>`
-- would invent a route that does not exist.
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
    select 'brand'::text as kind, b.name as label, count(p.id)::text || ' pieces' as detail,
           '/brands/' || b.slug as href, 1 as rank
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
    select 'collection'::text as kind, c.title as label, null::text as detail,
           '/collections/' || c.slug as href, 1 as rank
      from public.collections c
     where (select q from needle) is not null
       and c.is_active
       and c.title ilike public.catalogue_like_pattern((select q from needle)) escape '\'
     order by c.sort_order
     limit (select n from bounded)
  ),
  model_hits as (
    select 'model'::text as kind, m.name as label, b.name as detail,
           '/brands/' || b.slug || '?model=' || m.slug as href, 1 as rank
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
  'Typeahead suggestions across published products, active brands, active '
  'models and active collections. Bounded, and safe on every keystroke.';

-- Callable by the public API roles. `security definer` changes whose privileges
-- the body runs with, not who may call it, so the grant is still required.
--
-- `catalogue_filtered` is the exception, and the REVOKE is load-bearing:
-- Postgres grants EXECUTE on a new function to PUBLIC by default, so simply
-- omitting a grant is not enough. It returns whole `products` rows — including
-- `cost_cents`, the business's margin — so it must be unreachable from the API.
-- `security definer` callers run as the owner and are unaffected by the revoke.
grant execute on function public.catalogue_like_pattern(text) to anon, authenticated;
grant execute on function public.catalogue_condition_label(text) to anon, authenticated;
grant execute on function public.catalogue_search(text, text, text, text[], text[], text[], text[], text[], text[], text[], text[], text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text, text, integer, integer) to anon, authenticated;
grant execute on function public.catalogue_facets(text, text, text, text[], text[], text[], text[], text[], text[], text[], text[], text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text) to anon, authenticated;
grant execute on function public.catalogue_suggest(text, integer) to anon, authenticated;

revoke execute on function public.catalogue_filtered(text, text, text, text[], text[], text[], text[], text[], text[], text[], text[], text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text, text) from public;
revoke execute on function public.catalogue_filtered(text, text, text, text[], text[], text[], text[], text[], text[], text[], text[], text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text, text) from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Supporting indexes
--
-- The existing indexes cover brand, model, condition, price, case size, year and
-- full-text search (0003). Two gaps remain for catalogue browsing:
--
--   1. Facet grouping and filtering on the free-text spec columns
--      (case_material, dial_color, movement, bracelet_material, gender). These
--      are low-cardinality, so a plain btree is the right shape — it serves both
--      the equality filter and the GROUP BY.
--   2. Default ordering by publication recency within a brand, and ordering by
--      title, which the A–Z sort uses.
--
-- Both are partial on `status = 'published'`, because the public catalogue never
-- reads a draft and a partial index is a fraction of the size.
-- -----------------------------------------------------------------------------

create index if not exists products_published_case_material_idx
  on public.products (case_material) where status = 'published';
create index if not exists products_published_dial_color_idx
  on public.products (dial_color) where status = 'published';
create index if not exists products_published_movement_idx
  on public.products (movement) where status = 'published';
create index if not exists products_published_bracelet_idx
  on public.products (bracelet_material) where status = 'published';
create index if not exists products_published_gender_idx
  on public.products (gender) where status = 'published';
create index if not exists products_published_brand_recent_idx
  on public.products (brand_id, published_at desc) where status = 'published';
create index if not exists products_published_title_idx
  on public.products (title) where status = 'published';

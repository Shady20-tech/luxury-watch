-- =============================================================================
-- 0034 — "Newest first" now sorts by date, not by the editor's manual order
--
-- -----------------------------------------------------------------------------
-- THE DEFECT
-- -----------------------------------------------------------------------------
--
-- `catalogue_search` builds one `row_number()` ordering that switches on
-- `p_sort`. The featured branch is a `case` that applies whenever the sort is
-- *not* one of the explicit orderings:
--
--     case when p_sort not in ('price_asc','price_desc','oldest','title_asc',
--                              'title_desc','reference_asc')
--          then f.is_featured end desc,
--     case when p_sort not in (...) then f.sort_order end asc,
--     f.published_at desc nulls last,
--
-- `'newest'` was missing from that exclusion list, so "Newest first" fell into
-- the featured branch. `sort_order` is unique per product and the seed happens
-- to set it in publication order, so `sort_order asc` won before
-- `published_at desc` was ever consulted — the sort returned oldest first. The
-- two orderings only agreed by accident on data where `sort_order` matched the
-- dates, which is exactly what the seed looked like.
--
-- The fix is one word: add `'newest'` to both exclusion lists. `'featured'` is
-- the default and keeps the manual ordering; `'newest'` now reaches its own
-- `published_at desc` term with nothing ahead of it.
--
-- -----------------------------------------------------------------------------
-- WHY THIS IS A NEW MIGRATION AND NOT AN EDIT TO 0029
-- -----------------------------------------------------------------------------
--
-- 0029 has been applied. Editing an applied migration changes what a fresh
-- database gets without changing what an existing one has, so the two diverge
-- silently. The body below is a faithful copy of 0029 with only the two
-- exclusion lists changed, so this migration cannot drift from the definition it
-- replaces.
--
-- The drop-then-create is required: `create or replace` cannot change a
-- function's OUT parameters, and re-issuing the grant is required because
-- dropping the function takes its privileges with it.
-- =============================================================================

drop function if exists public.catalogue_search(
  text, text, text, text[], text[], text[], text[], text[], text[], text[], text[],
  text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text,
  text, integer, integer
);

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
  -- The attribution for the image the card is about to show. Null for a piece
  -- with no photograph and for one whose photo predates 0028, which is why the
  -- card renders the credit only when it is present.
  image_credit      text,
  image_licence     text,
  image_licence_url text,
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
               -- Default and 'featured'. Both honour the manual sort_order,
               -- which is the only ordering an editor controls directly.
               -- 'newest' is deliberately absent: it must reach its own
               -- published_at term, or sort_order decides before the date does.
               case when p_sort not in ('newest','price_asc','price_desc','oldest','title_asc','title_desc','reference_asc')
                    then f.is_featured end desc,
               case when p_sort not in ('newest','price_asc','price_desc','oldest','title_asc','title_desc','reference_asc')
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
    img.credit,
    img.licence,
    img.licence_url,
    public.is_product_available(pg.id),
    (select count(*) from filtered)
  from page pg
  left join public.brands b on b.id = pg.brand_id
  left join public.models m on m.id = pg.model_id
  -- The primary image, resolved in one lateral so a product with several images
  -- does not multiply its own row. A primary image wins; otherwise the first by
  -- sort_order. Products with no image return null and the card renders its
  -- labelled placeholder. The credit columns come from this same row, so the
  -- attribution always belongs to the photograph the card displays.
  left join lateral (
    select pi.storage_path, pi.external_url, pi.alt_text,
           pi.credit, pi.licence, pi.licence_url
      from public.product_images pi
     where pi.product_id = pg.id
     order by pi.is_primary desc, pi.sort_order asc, pi.id
     limit 1
  ) img on true
  -- Restore the ordering after the joins. The page was selected in order, but a
  -- join is free to reorder its input, so the order is reasserted here.
  order by pg.row_number;
$$;

-- Re-issued because the drop above took the old grants with it.
grant execute on function public.catalogue_search(
  text, text, text, text[], text[], text[], text[], text[], text[], text[], text[],
  text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text,
  text, integer, integer
) to anon, authenticated;

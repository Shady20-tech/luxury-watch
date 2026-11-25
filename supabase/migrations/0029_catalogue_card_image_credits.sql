-- =============================================================================
-- 0029 — Catalogue cards carry the photograph's attribution
--
-- -----------------------------------------------------------------------------
-- THE DEFECT
-- -----------------------------------------------------------------------------
--
-- 0028 gave `product_images` a `credit`, `licence` and `licence_url` column and
-- the product detail gallery renders them. The catalogue card did not, because
-- `catalogue_search` — the one RPC behind `/shop`, `/collections/[slug]`,
-- `/brands/[slug]`, `/brands/[slug]/models/[model]` and `/search` — returns only
-- `image_storage_path`, `image_external_url` and `image_alt`. So the seed
-- photography appeared on every listing with no attribution at all.
--
-- That is a licensing defect, not a cosmetic one. The seed photographs are
-- Wikimedia Commons files under CC BY 4.0 and CC BY-SA 4.0. Both require
-- attribution wherever the work is displayed, and CC BY-SA additionally requires
-- the licence to be named. A card is a display. A listing page shows up to 48
-- cards, so the busiest surface on the site was the one that never credited the
-- photographer.
--
-- -----------------------------------------------------------------------------
-- WHY THE COLUMNS GO ON THE RPC RATHER THAN A SECOND QUERY
-- -----------------------------------------------------------------------------
--
-- The alternative was a follow-up query for the visible page's image rows. That
-- would be a second round trip per listing, and it would have to re-derive
-- "which image is the card showing" — the same `is_primary desc, sort_order,
-- id` ordering the lateral already applies — in the application. Two places
-- deciding which image is primary is how a card ends up crediting one
-- photograph while showing another. The lateral already selects exactly the row
-- the card displays, so its credit columns are the only correct source.
--
-- -----------------------------------------------------------------------------
-- WHY THIS IS A DROP AND NOT A `create or replace`
-- -----------------------------------------------------------------------------
--
-- Adding columns to a function's `returns table` changes its row type, and
-- `create or replace function` cannot do that:
--
--   ERROR: cannot change return type of existing function
--
-- So the function is dropped and recreated. That loses its grants, which is why
-- they are re-issued at the bottom of this migration with the *new* signature.
-- The argument list is unchanged, so the only thing that moves is the return
-- type; every caller passes arguments by name from `catalogue-repository.ts` and
-- is unaffected.
--
-- `catalogue_filtered` is untouched. It returns whole `products` rows and knows
-- nothing about images.
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

-- -----------------------------------------------------------------------------
-- The wishlist shows the same cards, so it needs the same columns.
--
-- `/wishlist` renders `CatalogueCard` from `catalogue_by_ids`, which is the same
-- row shape as `catalogue_search` minus `total_count`. Leaving it alone would
-- mean the one listing a signed-in visitor curates for themselves was also the
-- one that showed a photographer's work uncredited — and `WishlistProductRow` is
-- `Omit<CatalogueSearchRow, 'total_count'>`, so the two shapes are meant to
-- match. Dropped for the same return-type reason as above.
-- -----------------------------------------------------------------------------

drop function if exists public.catalogue_by_ids(uuid[]);

create or replace function public.catalogue_by_ids(p_product_ids uuid[])
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
  image_credit      text,
  image_licence     text,
  image_licence_url text,
  is_available      boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.slug,
    p.title,
    b.name,
    b.slug,
    m.name,
    m.slug,
    p.reference_number,
    p.production_year,
    p.condition::text,
    p.case_size_mm,
    p.case_material,
    p.movement,
    p.dial_color,
    p.bracelet_material,
    p.gender,
    p.box_and_papers,
    p.price_cents,
    p.currency::text,
    p.price_on_request,
    p.published_at,
    p.is_featured,
    img.storage_path,
    img.external_url,
    img.alt_text,
    img.credit,
    img.licence,
    img.licence_url,
    public.is_product_available(p.id)
  from public.products p
  -- An inactive brand or model is excluded, exactly as the catalogue's own
  -- active-taxonomy gate does, so a wishlist cannot surface a product the shop
  -- grid would hide.
  left join public.brands b on b.id = p.brand_id and b.is_active
  left join public.models m on m.id = p.model_id and m.is_active
  left join lateral (
    select pi.storage_path, pi.external_url, pi.alt_text,
           pi.credit, pi.licence, pi.licence_url
      from public.product_images pi
     where pi.product_id = p.id
     order by pi.is_primary desc, pi.sort_order asc, pi.id
     limit 1
  ) img on true
  where p.id = any (p_product_ids)
    and p.status = 'published'
    and (p.brand_id is null or b.id is not null)
    and (p.model_id is null or m.id is not null)
  order by p.published_at desc nulls last, p.id;
$$;

revoke all on function public.catalogue_by_ids(uuid[]) from public;
grant execute on function public.catalogue_by_ids(uuid[]) to anon, authenticated;

comment on function public.catalogue_by_ids(uuid[]) is
  'Published product card rows for a set of saved ids, re-applying the publication and active-taxonomy gates. Carries the attribution of the image it selects, because the wishlist renders the same cards as the catalogue.';

-- -----------------------------------------------------------------------------
-- The related rail on a product page has the same defect.
--
-- `/products/[slug]` renders "Related timepieces" with `CatalogueGrid`, i.e. the
-- same `CatalogueCard`, fed by `catalogue_similar`. So the product page credited
-- the large gallery photograph and then showed up to eight related cards with
-- photographs and no attribution at all — verified on the live preview: 34 image
-- references in the related section and zero credits.
--
-- `catalogue_similar` returns `catalogue_search`'s columns plus `match_reason`,
-- and `fetchSimilarProducts` casts its rows to the shared type, so leaving it
-- behind would also make that cast a lie. Same drop-for-return-type reason.
-- -----------------------------------------------------------------------------

drop function if exists public.catalogue_similar(uuid, integer);

create or replace function public.catalogue_similar(
  p_product_id uuid,
  p_limit      integer default 8
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
  image_credit      text,
  image_licence     text,
  image_licence_url text,
  is_available      boolean,
  match_reason      text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with anchor as (
    -- The anchor is read directly rather than passed in, so the caller cannot
    -- ask for "products related to <a draft>" and use the response as an oracle
    -- for whether that draft exists. A non-published id yields no anchor, and
    -- therefore no rows.
    select p.id, p.brand_id, p.model_id, p.case_material, p.dial_color, p.movement
      from public.products p
     where p.id = p_product_id
       and p.status = 'published'
  ),
  scored as (
    select
      c.*,
      case
        when c.model_id is not null and c.model_id = a.model_id then 'model'
        when c.brand_id is not null and c.brand_id = a.brand_id then 'brand'
        else 'attribute'
      end as reason,
      -- Weights are the ranking, not decoration: a same-model sibling is a far
      -- stronger match than a shared dial colour. Ties break on publication
      -- order so the result is stable across requests.
      (
        case when c.model_id is not null and c.model_id = a.model_id then 8 else 0 end
        + case when c.brand_id is not null and c.brand_id = a.brand_id then 4 else 0 end
        + case when a.case_material is not null and c.case_material = a.case_material then 2 else 0 end
        + case when a.dial_color    is not null and c.dial_color    = a.dial_color    then 2 else 0 end
        + case when a.movement      is not null and c.movement      = a.movement      then 1 else 0 end
      ) as score
    from public.catalogue_filtered(
      'all', null, null, null, null, null, null, null, null, null, null, null,
      null, null, null, null, null, null, 'any', null, 'any'
    ) c
    cross join anchor a
    where c.id <> a.id
      -- Only genuine attribute overlaps. Without this a product sharing nothing
      -- would still match on the brand weight of zero and pad the grid with
      -- unrelated watches.
      and (
        (c.model_id is not null and c.model_id = a.model_id)
        or (c.brand_id is not null and c.brand_id = a.brand_id)
        or (a.case_material is not null and c.case_material = a.case_material)
        or (a.dial_color    is not null and c.dial_color    = a.dial_color)
        or (a.movement      is not null and c.movement      = a.movement)
      )
  ),
  ranked as (
    select s.*,
           row_number() over (
             order by s.score desc, s.published_at desc nulls last, s.id
           ) as rn
      from scored s
  )
  select
    r.id,
    r.slug,
    r.title,
    b.name,
    b.slug,
    m.name,
    m.slug,
    r.reference_number,
    r.production_year,
    r.condition::text,
    r.case_size_mm,
    r.case_material,
    r.movement,
    r.dial_color,
    r.bracelet_material,
    r.gender,
    r.box_and_papers,
    r.price_cents,
    r.currency::text,
    r.price_on_request,
    r.published_at,
    r.is_featured,
    img.storage_path,
    img.external_url,
    img.alt_text,
    img.credit,
    img.licence,
    img.licence_url,
    public.is_product_available(r.id),
    r.reason
  from ranked r
  left join public.brands b on b.id = r.brand_id
  left join public.models m on m.id = r.model_id
  left join lateral (
    select pi.storage_path, pi.external_url, pi.alt_text,
           pi.credit, pi.licence, pi.licence_url
      from public.product_images pi
     where pi.product_id = r.id
     order by pi.is_primary desc, pi.sort_order asc, pi.id
     limit 1
  ) img on true
  where r.rn <= least(greatest(coalesce(p_limit, 8), 1), 24)
  order by r.score desc, r.published_at desc nulls last, r.id;
$$;

comment on function public.catalogue_similar(uuid, integer) is
  'Related published products for a product, ranked by shared attributes. Re-applies the publication gate across its definer boundary and carries the attribution of the image each card selects.';

comment on function public.catalogue_search(
  text, text, text, text[], text[], text[], text[], text[], text[], text[], text[],
  text[], integer, integer, numeric, numeric, bigint, bigint, text, boolean, text,
  text, integer, integer
) is
  'Paged catalogue query for the public listings. Returns the display surface only — never cost_cents, compare_at_cents or sort_order — plus the attribution of the image it selects, so a listing card can credit the photograph it shows.';

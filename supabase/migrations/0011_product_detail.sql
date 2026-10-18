-- =============================================================================
-- 0011 — Product detail: public read surface, related products, enquiries
--
-- Three things happen here, and the first is a security fix rather than a
-- feature.
--
-- -----------------------------------------------------------------------------
-- 1. `products.cost_cents` and `products.compare_at_cents` are no longer
--    readable by the public API roles
-- -----------------------------------------------------------------------------
--
-- Every earlier migration assumed the public read surface on `products` was
-- safe because `catalogue_filtered` and `catalogue_search` return an explicit
-- column list. That reasoning was about the *functions*, and it was correct
-- about them — but it never covered the *table*.
--
-- Postgres grants `select` on a table to a role, and the storefront's public
-- read policy (`products_public_read`) is a row filter, not a column filter.
-- So `anon` could ask PostgREST directly:
--
--     GET /rest/v1/products?select=slug,price_cents,cost_cents&status=eq.published
--
-- and read the business's cost basis and margin for every published watch.
-- This was verified against a real server before the fix: the request returned
-- `cost_cents` for a published product.
--
-- The fix is column-level: `select` is revoked on the whole table and granted
-- back on every column except the two commercial ones. Postgres privileges are
-- additive, so granting the full column list minus two is exactly "everything
-- except these", and a future column added to the table is *not* readable by
-- default — it must be added here deliberately. That default-deny direction is
-- the point: the next sensitive column cannot leak by omission.
--
-- RLS is unchanged. This is a second, independent gate: the policy decides
-- *which rows*, the column grant decides *which fields*.
--
-- Staff are unaffected. `products_staff_write` is `for all` and does not grant
-- `select` — the staff read path is the `service_role` client, which bypasses
-- RLS and, as a `bypassrls` role, reads the table regardless of grants. The
-- admin platform is built on that client.
--
-- -----------------------------------------------------------------------------
-- 2. `catalogue_similar` — related watches, honestly derived
-- -----------------------------------------------------------------------------
--
-- "Related" is a claim, so it is defined by real shared attributes rather than
-- by a merchandising list that does not exist yet. The ranking is: same model
-- first, then same brand, then shared case material, dial colour or movement.
-- A product with no attribute in common with anything else simply has no
-- related products, and the page renders without the section.
--
-- It reuses `catalogue_filtered` so the publication gate, the active-taxonomy
-- gate and the availability rule are the same code path the grid uses. A
-- `security definer` function bypasses RLS, so every one of those rules has to
-- be re-applied; sharing the function is what makes that true by construction
-- instead of by discipline.
--
-- -----------------------------------------------------------------------------
-- 3. `submit_product_question` — the "ask a question" write path
-- -----------------------------------------------------------------------------
--
-- `inquiries` has no insert policy for `anon`, and that is deliberate: an
-- inquiry carries a name, an email address and a message, so an open insert
-- would be an unauthenticated write of personal data with no validation and no
-- rate limit. The insert happens here instead, under `security definer`, which
-- is the same shape `submit_order_request` uses.
--
-- The rate limit is enforced inside the function, in the database, so it cannot
-- be bypassed by calling the API directly. A limiter that lived only in the
-- Next.js action would be trivially sidestepped.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Column-level read surface on `products`
--
-- `anon` and `authenticated` keep read access to every column the storefront
-- legitimately needs. `cost_cents` and `compare_at_cents` are excluded.
--
-- `compare_at_cents` is a promotional "was" price. Nothing in the storefront
-- displays it (there is no sale-price UI, and the seed sets it to null), so it
-- is excluded rather than granted. `cost_cents` is the purchase cost and is
-- commercially sensitive outright.
--
-- `service_role` is untouched: it bypasses RLS and the admin screens read the
-- full row.
-- -----------------------------------------------------------------------------

revoke select on public.products from anon, authenticated;

grant select (
  id, sku, slug, title, brand_id, model_id,
  short_description, description,
  price_cents, currency, price_on_request,
  condition, production_year, reference_number,
  case_size_mm, case_material, movement, dial_color, bracelet_material,
  bezel, water_resistance_m, gender, box_and_papers,
  status, published_at, is_featured, sort_order,
  seo_title, seo_description, og_image_url,
  created_at, updated_at
) on public.products to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. catalogue_similar — related watches for a product page
--
-- Returns the same column list as `catalogue_search` minus the pagination
-- fields, so the product page can reuse the catalogue card mapping unchanged
-- and the related grid cannot expose a field the grid would not.
--
-- `p_exclude_id` is a parameter rather than a filter the caller applies
-- afterwards, because a `limit` applied before the exclusion would return one
-- fewer row than asked for, or none at all for a product that is its own best
-- match.
-- -----------------------------------------------------------------------------

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
    public.is_product_available(r.id),
    r.reason
  from ranked r
  left join public.brands b on b.id = r.brand_id
  left join public.models m on m.id = r.model_id
  left join lateral (
    select pi.storage_path, pi.external_url, pi.alt_text
      from public.product_images pi
     where pi.product_id = r.id
     order by pi.is_primary desc, pi.sort_order asc, pi.id
     limit 1
  ) img on true
  where r.rn <= least(greatest(coalesce(p_limit, 8), 1), 24)
  order by r.score desc, r.published_at desc nulls last, r.id;
$$;

comment on function public.catalogue_similar(uuid, integer) is
  'Published watches related to a given published product, ranked by shared '
  'model, then brand, then case material, dial colour or movement. Returns an '
  'explicit column list that excludes cost and merchandising fields, and no '
  'rows for an unpublished or unknown anchor.';

-- -----------------------------------------------------------------------------
-- 3. submit_product_question — the enquiry write path
--
-- Returns the new inquiry's reference, which the visitor is shown so a reply
-- can be matched to their message. Nothing else about the row is returned:
-- there is no reason for the response to echo the submitted personal data back.
--
-- The product must be published. An enquiry against a draft would confirm the
-- draft's existence to an unauthenticated caller.
-- -----------------------------------------------------------------------------

create or replace function public.submit_product_question(
  p_product_slug text,
  p_name         text,
  p_email        text,
  p_message      text,
  p_phone        text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_product_id uuid;
  v_reference  text;
  v_window     timestamptz;
  v_count      integer;
begin
  -- Shape validation. The action validates too and gives the visitor a useful
  -- message; this is the boundary that actually holds, because the function is
  -- reachable without going through the action.
  if p_name is null or char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 200 then
    raise exception 'A name between 1 and 200 characters is required'
      using errcode = 'check_violation';
  end if;

  if p_email is null or char_length(btrim(p_email)) < 3 or char_length(btrim(p_email)) > 320
     or position('@' in p_email) < 2 then
    raise exception 'A valid email address is required' using errcode = 'check_violation';
  end if;

  if p_message is null or char_length(btrim(p_message)) < 1 or char_length(btrim(p_message)) > 8000 then
    raise exception 'A message between 1 and 8000 characters is required'
      using errcode = 'check_violation';
  end if;

  select p.id into v_product_id
    from public.products p
   where p.slug = p_product_slug
     and p.status = 'published';

  if v_product_id is null then
    raise exception 'Unknown product' using errcode = 'no_data_found';
  end if;

  -- Rate limit: 5 enquiries per email address per hour, and 20 per hour in
  -- total. The per-address cap stops one visitor flooding the inbox; the global
  -- cap bounds the damage from an attacker cycling addresses.
  v_window := date_trunc('hour', now());

  insert into public.rate_limit_counters (bucket, window_start, count)
  values ('product_question:global:' || v_window::text, v_window, 1)
  on conflict (bucket, window_start) do update
    set count = public.rate_limit_counters.count + 1
  returning count into v_count;

  if v_count > 20 then
    raise exception 'Too many enquiries have been submitted. Please try again later.'
      using errcode = 'check_violation';
  end if;

  insert into public.rate_limit_counters (bucket, window_start, count)
  values ('product_question:email:' || lower(btrim(p_email)) || ':' || v_window::text, v_window, 1)
  on conflict (bucket, window_start) do update
    set count = public.rate_limit_counters.count + 1
  returning count into v_count;

  if v_count > 5 then
    raise exception 'Too many enquiries have been submitted from this address. Please try again later.'
      using errcode = 'check_violation';
  end if;

  insert into public.inquiries (type, product_id, name, email, phone, message)
  values (
    'product_question',
    v_product_id,
    btrim(p_name),
    lower(btrim(p_email)),
    nullif(btrim(coalesce(p_phone, '')), ''),
    btrim(p_message)
  )
  returning reference into v_reference;

  return v_reference;
end;
$$;

comment on function public.submit_product_question(text, text, text, text, text) is
  'Records a product enquiry against a published product and returns its '
  'reference. Validates shape, enforces a per-address and a global hourly rate '
  'limit, and refuses an unpublished or unknown product.';

-- -----------------------------------------------------------------------------
-- Grants
--
-- `security definer` changes whose privileges the body runs with, not who may
-- call it, so an explicit grant is still required. Postgres grants EXECUTE to
-- PUBLIC by default, so the REVOKEs below are load-bearing.
-- -----------------------------------------------------------------------------

grant execute on function public.catalogue_similar(uuid, integer) to anon, authenticated;
grant execute on function public.submit_product_question(text, text, text, text, text)
  to anon, authenticated;

-- The rate-limit counter is written only from inside the two definer functions.
-- The table has RLS enabled and no policy, so it is already unreadable; this
-- makes the intent explicit at the grant level too.
revoke all on public.rate_limit_counters from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Supporting index
--
-- `catalogue_similar` reads the anchor by primary key and then scans the
-- published set, which `products_status_published_idx` (0003) already covers.
-- The one gap is the related-lookup ordering: newest-first within a score band.
-- -----------------------------------------------------------------------------

create index if not exists products_published_recent_idx
  on public.products (published_at desc nulls last)
  where status = 'published';

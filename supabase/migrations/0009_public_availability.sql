-- =============================================================================
-- 0009 — Public product availability
--
-- The storefront must be able to show whether a watch is available without
-- being able to read stock levels. This migration adds exactly that: a
-- boolean, computed inside the database, with no way to read the underlying
-- numbers.
--
-- -----------------------------------------------------------------------------
-- WHY A FUNCTION RATHER THAN A POLICY ON `inventory`
-- -----------------------------------------------------------------------------
--
-- `inventory` deliberately has no anonymous read policy. Row Level Security in
-- Postgres is row-level, not column-level: a policy that let `anon` read a row
-- would also let it read `quantity`, `reserved_quantity` and `location`. Exact
-- stock counts and storage locations are commercially sensitive — a competitor
-- could poll the catalogue API and reconstruct the business's inventory
-- position. Hiding those columns in the application would not help, because the
-- API is reachable directly with the public anon key.
--
-- A `security definer` function reads the row internally and returns a single
-- boolean. The caller never sees the numbers, and there is no policy to
-- accidentally widen later.
--
-- -----------------------------------------------------------------------------
-- WHY IT CHECKS `products.status` AS WELL
-- -----------------------------------------------------------------------------
--
-- A `security definer` function bypasses RLS, so it must re-apply the
-- publication gate itself. Without the `status = 'published'` clause this
-- function would become an oracle that reveals whether a draft or archived
-- product has stock, which is exactly the leak the public read policy on
-- `products` exists to prevent.
--
-- A product with no `inventory` row is treated as unavailable. That is the
-- honest default: the row is created when stock is received, so its absence
-- means no stock has been recorded, not that stock is unknown.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- product_availability — the set version, which is what the storefront uses
--
-- A grid of product cards needs availability for several products at once. One
-- call returning one row per requested product keeps the homepage to a single
-- round trip instead of one per card.
--
-- A row is returned only for a product that is published, so the result cannot
-- be used to probe for the existence of a draft. A caller asking about an
-- unpublished or unknown id simply gets no row, which the application reads as
-- "not available".
-- -----------------------------------------------------------------------------

create or replace function public.product_availability(p_product_ids uuid[])
returns table (product_id uuid, is_available boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id,
         exists (
           select 1
             from public.inventory i
            where i.product_id = p.id
              and i.quantity - i.reserved_quantity > 0
         )
    from public.products p
   where p.id = any (p_product_ids)
     and p.status = 'published';
$$;

comment on function public.product_availability(uuid[]) is
  'Availability for a set of product ids, one row per PUBLISHED product. '
  'Returns booleans only; stock counts and locations are never exposed.';

grant execute on function public.product_availability(uuid[]) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- is_product_available — the single-product convenience wrapper
--
-- Shares the implementation above rather than repeating the logic, so the
-- publication gate and the reservation arithmetic exist in exactly one place.
-- -----------------------------------------------------------------------------

create or replace function public.is_product_available(p_product_id uuid)
returns boolean
language sql
stable
security definer
-- Pinned so a caller cannot change what the function resolves to by mutating
-- the search path.
set search_path = public, pg_temp
as $$
  select coalesce(
    (select a.is_available
       from public.product_availability(array[p_product_id]) a),
    false
  );
$$;

comment on function public.is_product_available(uuid) is
  'True when a published product has unreserved stock. Returns a boolean only; '
  'stock counts and locations are never exposed. Treats a missing inventory row '
  'as unavailable.';

-- Callable by the public API roles. The grant is required: `security definer`
-- changes whose privileges the body runs with, not who may call it.
grant execute on function public.is_product_available(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- published_product_counts — how many pieces a brand has on the site
--
-- The brand showcase shows a count per brand. Counting client-side would mean
-- selecting every published product's `brand_id`, which is exactly the
-- "read the whole catalogue to render a homepage" pattern this phase forbids.
-- PostgREST has no GROUP BY, so the aggregation happens here, in one round trip,
-- and only the totals cross the wire.
-- -----------------------------------------------------------------------------

create or replace function public.published_product_counts()
returns table (brand_id uuid, product_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.brand_id, count(*)
    from public.products p
   where p.status = 'published'
     and p.brand_id is not null
   group by p.brand_id;
$$;

comment on function public.published_product_counts() is
  'Published product totals per brand, for the storefront brand showcase. '
  'Aggregated in the database so the client never reads the catalogue.';

grant execute on function public.published_product_counts() to anon, authenticated;

-- The lookup is by primary key on `inventory.product_id`, which already has a
-- unique index (`inventory_product_key`), so no additional index is needed.

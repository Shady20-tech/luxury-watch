-- =============================================================================
-- 40 — Dashboard metrics the console can chart
--
-- The console needs a few shapes the plain counts cannot express: how the
-- catalogue is distributed across brands, and how much stock sits in each
-- inventory state. Both are aggregations, and PostgREST has no GROUP BY, so
-- without these functions the page would have to select every row and count in
-- TypeScript — which is exactly the "read the whole catalogue to draw a bar" the
-- catalogue phase forbids, and it would grow with the catalogue rather than with
-- the chart.
--
-- -----------------------------------------------------------------------------
-- WHY THESE ARE PERMISSION-GUARDED IN THE DATABASE
-- -----------------------------------------------------------------------------
--
-- The dashboard already runs its counts through the service-role client, which
-- bypasses RLS. That is safe only because the page checks permissions first, and
-- the check lives in the page, not the database. These two functions are callable
-- by `authenticated`, so they must not rely on that: each one refuses a caller
-- without the permission its numbers belong to. A function that answers a
-- question the caller may not ask is a leak regardless of who calls it.
--
-- `has_permission()` derives the caller from `auth.uid()` inside the database and
-- takes no argument, so there is nothing here a caller could forge. It fails
-- closed for an anonymous caller.
--
-- -----------------------------------------------------------------------------
-- WHY THE NUMBERS ARE WHAT THEY ARE
-- -----------------------------------------------------------------------------
--
-- `admin_catalogue_by_brand` counts every product, not just published ones,
-- because it is an inventory-shape chart on an internal screen: a brand with
-- 2,497 rows and six published pieces is a fact the buyer should see. The
-- storefront's own counts (`published_product_counts`) stay published-only.
--
-- `admin_inventory_by_state` reads `inventory_stock_state`, the same view the
-- dashboard's low-stock figure uses, so the bar and the tile cannot disagree.
-- =============================================================================

create or replace function public.admin_catalogue_by_brand(p_limit integer default 8)
returns table (brand_id uuid, brand_name text, product_count bigint, published_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('catalog.read') then
    raise exception 'You do not have permission to read the catalogue'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select b.id,
           b.name,
           count(p.id)                                   as product_count,
           count(p.id) filter (where p.status = 'published') as published_count
      from public.brands b
      join public.products p on p.brand_id = b.id
     group by b.id, b.name
     order by count(p.id) desc, b.name asc
     limit greatest(least(coalesce(p_limit, 8), 20), 1);
end;
$$;

comment on function public.admin_catalogue_by_brand(integer) is
  'Product totals per brand for the admin dashboard, published and overall. '
  'Requires catalog.read and refuses the caller without it.';

revoke all on function public.admin_catalogue_by_brand(integer) from public;
grant execute on function public.admin_catalogue_by_brand(integer)
  to authenticated, service_role;

-- -----------------------------------------------------------------------------

create or replace function public.admin_inventory_by_state()
returns table (state text, item_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('inventory.read') then
    raise exception 'You do not have permission to read inventory'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select case
             when s.available_quantity is null or s.available_quantity <= 0 then 'out'
             when s.is_low_stock then 'low'
             else 'healthy'
           end                as state,
           count(*)           as item_count
      from public.inventory_stock_state s
     group by 1
     order by 1;
end;
$$;

comment on function public.admin_inventory_by_state() is
  'Stock rows grouped into healthy / low / out for the admin dashboard. '
  'Requires inventory.read and refuses the caller without it.';

revoke all on function public.admin_inventory_by_state() from public;
grant execute on function public.admin_inventory_by_state()
  to authenticated, service_role;

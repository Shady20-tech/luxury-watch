-- =============================================================================
-- 0017 — Published totals per collection
--
-- -----------------------------------------------------------------------------
-- WHY
-- -----------------------------------------------------------------------------
--
-- `published_product_counts()` gives a brand's published total, because the
-- homepage brand showcase needs it. There is no equivalent for collections, so
-- every caller that wants "how many pieces does this collection actually show"
-- has had to read `collection_products` and count client-side — which means
-- reading the join table, and on a large catalogue that is exactly the
-- "load the table to render one number" pattern the query layer forbids.
--
-- Two callers need it, and they must agree:
--
--   * the collections index badge, which already counts through a join;
--   * the sitemap, which must not advertise a collection page that renders
--     nothing. A collection with no published pieces is a real page with an
--     honest empty state, but it is thin content: it should not be in the
--     sitemap, and the page marks itself `noindex`.
--
-- -----------------------------------------------------------------------------
-- WHY IT IS `security definer`
-- -----------------------------------------------------------------------------
--
-- The count must include only published products. `collection_products` has an
-- RLS policy that already restricts reads to published products in active
-- collections, but a definer function bypasses RLS, so the publication gate is
-- re-applied in the body. That keeps the number identical whether the caller is
-- `anon` (where RLS would filter) or a definer context (where it would not).
--
-- A collection with zero published pieces is absent from the result rather than
-- returned as zero. Both readings are correct; absence keeps the payload small
-- and the caller's `?? 0` handles it.
-- =============================================================================

create or replace function public.published_collection_counts()
returns table (collection_id uuid, product_count bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cp.collection_id, count(*)
    from public.collection_products cp
    join public.products p on p.id = cp.product_id
    join public.collections c on c.id = cp.collection_id
   where p.status = 'published'
     and c.is_active
   group by cp.collection_id;
$$;

comment on function public.published_collection_counts() is
  'Published product totals per active collection. Aggregated in the database '
  'so neither the collections index nor the sitemap reads the join table.';

grant execute on function public.published_collection_counts() to anon, authenticated;

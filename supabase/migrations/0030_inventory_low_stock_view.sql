-- -----------------------------------------------------------------------------
-- "Low stock" is a two-column comparison, and PostgREST cannot express one
--
-- The admin dashboard and the inventory list both asked PostgREST to compare
-- `quantity` against `low_stock_threshold` with
--
--   .filter('quantity', 'lte', 'low_stock_threshold')
--
-- PostgREST reads the right-hand side of a filter as a literal, not a column
-- reference. So the generated query was `quantity=lte.low_stock_threshold`,
-- which Postgres tried to cast to integer and rejected:
--
--   22P02 invalid input syntax for type integer: "low_stock_threshold"
--
-- Both call sites swallowed the error. `countRows` reports a failed count as
-- zero, and `listInventory` logs and returns an empty page. The visible effect
-- was a dashboard tile permanently reading **0 LOW STOCK** and a "Low stock
-- only" filter that returned no products at all, on a database where every row
-- qualifies. A silent zero is worse than a visible failure: staff read it as
-- "nothing needs reordering".
--
-- There is no PostgREST filter syntax for a column-to-column comparison, so the
-- comparison has to live in the database. This view does it once, and both
-- callers filter on `is_low_stock` instead of trying to express the comparison
-- in a URL.
--
-- The view is `security_invoker`, so it applies the caller's own RLS policies
-- rather than the view owner's. Without that a view over `inventory` would be a
-- privilege-escalation hole: any role the view is granted to would read every
-- row regardless of the `inventory_staff_read` policy.
--
-- Grants are deliberately restricted to `service_role`. The admin area reads
-- through the service-role client and does its own permission check before it
-- gets here; `anon` and `authenticated` have no business seeing stock levels at
-- all, and `authenticated` is every signed-in customer.
-- -----------------------------------------------------------------------------

create or replace view public.inventory_stock_state
with (security_invoker = true) as
select
  i.product_id,
  i.quantity,
  i.reserved_quantity,
  i.low_stock_threshold,
  i.quantity - i.reserved_quantity as available_quantity,
  i.quantity <= i.low_stock_threshold as is_low_stock
from public.inventory i;

comment on view public.inventory_stock_state is
  'Per-product stock with the two-column low-stock comparison evaluated in SQL, because PostgREST filters compare against literals only.';

revoke all on public.inventory_stock_state from anon, authenticated;
grant select on public.inventory_stock_state to service_role;

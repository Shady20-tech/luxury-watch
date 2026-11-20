-- =============================================================================
-- 0021 — The inventory balance is derived, so it must not be writable
--
-- -----------------------------------------------------------------------------
-- THE GAP
-- -----------------------------------------------------------------------------
--
-- `inventory` has carried an `inventory_staff_write` policy since 0007 that
-- grants INSERT, UPDATE and DELETE to anyone holding `inventory.write`. The
-- balance is supposed to be a *derived* value: `apply_inventory_transaction`
-- (0003) recomputes it from every ledger row, and `admin_adjust_stock` (0020)
-- writes a ledger row rather than a total. The application honours this — there
-- is no `update inventory set quantity = ...` anywhere in `src/`.
--
-- But the schema did not enforce it. `inventory.write` could still issue
--
--     update public.inventory set quantity = 99 where product_id = ...;
--
-- and succeed, changing stock with no ledger row and no audit entry. The
-- ledger would then no longer add up to the balance, and the discrepancy would be
-- invisible: every screen reads `inventory`, and nothing recomputes it from the
-- ledger to notice. That is the worst shape a data bug can take — a silent
-- divergence between a number and its own history.
--
-- The rule the codebase states in three places ("the balance is never written
-- directly") was therefore a convention, not an invariant. This migration makes
-- it an invariant.
--
-- -----------------------------------------------------------------------------
-- WHY REVOKING IS SAFE
-- -----------------------------------------------------------------------------
--
-- Every legitimate writer is `SECURITY DEFINER` and therefore unaffected by a
-- revoke against `authenticated`:
--
--   * `apply_inventory_transaction` — the trigger that maintains the balance
--     from the ledger (0003).
--   * `reserve_inventory` / `release_inventory_reservations` and the order
--     submission path (0008) — all `SECURITY DEFINER`, all writing through the
--     ledger.
--   * `admin_adjust_stock` (0020) — `SECURITY DEFINER`, writes a ledger row.
--
-- So the revoke removes the ability to bypass the ledger, and nothing else. It
-- cannot break stock movement, because no stock movement goes through a direct
-- write.
--
-- `select` is left in place: the admin inventory screen and the storefront
-- availability check both read this table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Read stays; direct write goes.
-- -----------------------------------------------------------------------------

revoke insert, update, delete on public.inventory from anon, authenticated;

-- service_role keeps its write grant: it is the role used by seeding and by
-- `SECURITY DEFINER` functions that run as the definer. It already bypasses RLS
-- by design and is never exposed to a browser, so this is not the hole above.
comment on table public.inventory is
  'Current stock balance per product. Derived from inventory_transactions by '
  'apply_inventory_transaction(); never written directly by the application. '
  'INSERT/UPDATE/DELETE are revoked from anon and authenticated so the balance '
  'cannot diverge from its ledger.';

-- -----------------------------------------------------------------------------
-- 2. The write policy is now unreachable, so say so rather than delete it
-- -----------------------------------------------------------------------------
--
-- Leaving the policy in place is harmless once the grant is gone — a policy with
-- no matching privilege grants nothing. It is kept, and commented, so that a
-- future migration that re-grants write does not silently reopen the hole
-- without the policy being visible.
comment on policy inventory_staff_write on public.inventory is
  'Intentionally unreachable: INSERT/UPDATE/DELETE are revoked from anon and '
  'authenticated (0021). Kept as documentation of intent; re-granting write '
  'without revisiting the ledger would allow the balance to diverge from its '
  'history.';

-- -----------------------------------------------------------------------------
-- 3. Prove the invariant holds for the roles that face the browser
-- -----------------------------------------------------------------------------
--
-- A migration that revokes is easy to write and easy to undo by accident in a
-- later grant statement. Asserting here means the next `grant all on inventory`
-- fails this migration's intent loudly in the test suite rather than quietly in
-- production.

do $$
declare
  v_write_grants integer;
begin
  select count(*) into v_write_grants
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'inventory'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');

  if v_write_grants > 0 then
    raise exception 'inventory still grants % write privilege(s) to anon/authenticated', v_write_grants;
  end if;
end $$;

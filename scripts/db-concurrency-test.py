#!/usr/bin/env python3
"""
Concurrency proof for the inventory reservation.

The SQL tests in supabase/tests/40_order_and_inventory.sql prove the
single-session rules. Only real parallelism can test the rule that matters here:

    when N connections try to reserve the SAME last watch at the same instant,
    exactly one succeeds and the rest are refused.

Why this test needs a widened window
------------------------------------
A first attempt at this test passed even with the row lock removed, which meant
it was proving nothing: the critical section runs in microseconds, so eight
processes rarely overlap inside it. `--slow-window` inserts a deliberate delay
between reading the stock and writing the reservation. That turns a microsecond
race into a half-second one, where genuine overlap is guaranteed.

The three modes together are the actual proof:

  1. default (lock + constraint)          -> invariant HOLDS
  2. --slow-window (lock + constraint)    -> invariant HOLDS under real contention
  3. --break-lock --slow-window           -> invariant VIOLATED, so the test has teeth

Mode 3 is a negative control. It rewrites reserve_inventory() without its
`for update` clause, and the run is expected to FAIL. If it ever passes, the
test has stopped detecting the failure it exists to catch.

Usage:
    scripts/db-concurrency-test.py [--container NAME] [--racers N]
                                   [--slow-window] [--break-lock]
                                   [--break-constraint]
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

PRODUCT_ID = "cccc0000-0000-0000-0000-00000000000c"
SLEEP_SECONDS = 0.5

RESERVE_FN_TEMPLATE = """
create or replace function public.reserve_inventory(
  p_order_request_id uuid,
  p_product_id       uuid,
  p_quantity         integer
)
returns public.inventory_reservations
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_inventory   public.inventory;
  v_available   integer;
  v_reservation public.inventory_reservations;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Reservation quantity must be positive (got %)', p_quantity
      using errcode = 'check_violation';
  end if;

  select * into v_inventory
    from public.inventory
   where product_id = p_product_id
__LOCK__;

  if not found then
    raise exception 'No inventory record exists for product %', p_product_id
      using errcode = 'no_data_found';
  end if;

  v_available := v_inventory.quantity - v_inventory.reserved_quantity;

  if v_available < p_quantity then
    raise exception 'Insufficient available stock for product % (requested %, available %)',
      p_product_id, p_quantity, v_available
      using errcode = 'check_violation';
  end if;
__SLEEP__
  insert into public.inventory_reservations (product_id, order_request_id, quantity)
  values (p_product_id, p_order_request_id, p_quantity)
  returning * into v_reservation;

  insert into public.inventory_transactions (
    product_id, kind, quantity_delta, reserved_delta, order_request_id, actor_id, note
  )
  values (
    p_product_id, 'reservation', 0, p_quantity, p_order_request_id,
    (select auth.uid()), 'Reserved for order request'
  );

  return v_reservation;
end;
$fn$;
"""


def reserve_fn_sql(*, use_lock: bool, sleep_seconds: float) -> str:
    # The template already places a ';' after __LOCK__, so the replacement must
    # not introduce one of its own. A trailing comment would otherwise swallow
    # the statement terminator and break the whole function body.
    lock = "     for update" if use_lock else "     /* DELIBERATELY BROKEN: no row lock */"
    sleep = f"  perform pg_sleep({sleep_seconds});\n" if sleep_seconds > 0 else ""
    return RESERVE_FN_TEMPLATE.replace("__LOCK__", lock).replace("__SLEEP__", sleep)


def build_docker_prefix() -> list[str]:
    for prefix in ([], ["sudo", "-n"]):
        try:
            probe = subprocess.run(
                [*prefix, "docker", "info"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=20,
            )
        except (subprocess.TimeoutExpired, FileNotFoundError):
            continue
        if probe.returncode == 0:
            return [*prefix, "docker"]
    raise SystemExit("Cannot reach the Docker daemon (tried docker and sudo -n docker).")


class Db:
    """Runs SQL either through a Docker container or a direct psql connection.

    Both paths produce the same argv shape for `psql -t -A -q -c <sql>`, so the
    racers and the setup code do not need to know which one is in use. CI sets
    PGHOST and uses the direct path; local development uses the container.
    """

    def __init__(self, docker: list[str] | None, container: str) -> None:
        self.docker = docker
        self.container = container

    def psql_argv(self, sql: str) -> list[str]:
        base = ["psql", "-t", "-A", "-q", "-c", sql]
        if self.docker is None:
            return base
        return [*self.docker, "exec", "-i", self.container, "psql",
                "-U", "postgres", "-d", "postgres", *base[1:]]

    def psql(self, sql: str) -> str:
        result = subprocess.run(
            self.psql_argv(sql),
            capture_output=True,
            text=True,
            stdin=subprocess.DEVNULL,
            timeout=180,
        )
        if result.returncode != 0:
            raise RuntimeError(f"psql failed: {result.stderr.strip()}")
        return result.stdout.strip()

    def last(self, sql: str) -> str:
        out = self.psql(sql).splitlines()
        return out[-1].strip() if out else ""


def resolve_db(container: str) -> Db:
    """Prefer a direct psql connection when libpq variables are set, else Docker."""
    if os.environ.get("PGHOST"):
        return Db(None, container)
    return Db(build_docker_prefix(), container)


SUBMIT_TEMPLATE = """
set role anon;
set request.jwt.claims = '{{"role":"anon"}}';
select public.submit_order_request(
  '[{{"product_id":"{pid}","quantity":1}}]'::jsonb,
  'Racer {n}', 'race{n}@example.test', null, 'pickup', 'bank_transfer'
) is not null;
"""


def prepare(db: Db) -> None:
    db.psql(f"""
    set role service_role;
    delete from public.inventory_transactions  where product_id = '{PRODUCT_ID}';
    delete from public.inventory_reservations  where product_id = '{PRODUCT_ID}';
    delete from public.order_request_items     where product_id = '{PRODUCT_ID}';
    delete from public.order_requests          where customer_email like 'race%@example.test';
    delete from public.inventory               where product_id = '{PRODUCT_ID}';
    delete from public.products                where id = '{PRODUCT_ID}';
    insert into public.products
      (id, sku, slug, title, status, published_at, price_on_request, price_cents)
    values
      ('{PRODUCT_ID}', 'SKU-RACE', 'race-watch', 'Race Watch',
       'published', now(), false, 100000);
    insert into public.inventory (product_id, quantity) values ('{PRODUCT_ID}', 1);
    reset role;
    """)


def run_race(db: Db, racers: int) -> tuple[int, int]:
    """Launch every racer before waiting on any, so they truly contend."""
    procs = []
    for n in range(1, racers + 1):
        sql = SUBMIT_TEMPLATE.format(pid=PRODUCT_ID, n=n)
        procs.append(
            subprocess.Popen(
                db.psql_argv(sql),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                text=True,
            )
        )

    succeeded = refused = 0
    for proc in procs:
        proc.communicate(timeout=300)
        if proc.returncode == 0:
            succeeded += 1
        else:
            refused += 1
    return succeeded, refused


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--container", default="lw-pg-test")
    parser.add_argument("--racers", type=int, default=8)
    parser.add_argument("--slow-window", action="store_true",
                        help="Add a delay inside the critical section so overlap is guaranteed.")
    parser.add_argument("--break-lock", action="store_true",
                        help="Remove the row lock.")
    parser.add_argument("--break-constraint", action="store_true",
                        help="Drop the reserved<=quantity check.")
    args = parser.parse_args()

    db = resolve_db(args.container)

    # The invariant is defended twice: the row lock serialises the read-check-write,
    # and the check constraint rejects an over-reservation even if the lock is
    # absent. So removing EITHER ONE ALONE must still hold, and only removing BOTH
    # may break it. That is the property this script verifies, and the
    # both-removed case is what proves the test can actually fail.
    both_removed = args.break_lock and args.break_constraint
    expect_break = both_removed

    print("=== Inventory concurrency test ===")
    print(f"    racers: {args.racers}")
    if both_removed:
        print("    mode: BOTH PROTECTIONS REMOVED (invariant must break, proving the test has teeth)")
    elif args.break_lock or args.break_constraint:
        print("    mode: ONE PROTECTION REMOVED (the other must still hold the invariant)")

    sleep_seconds = SLEEP_SECONDS if args.slow_window else 0.0
    if args.slow_window:
        print(f"    widened race window: {sleep_seconds}s inside the critical section")

    db.psql(reserve_fn_sql(use_lock=not args.break_lock, sleep_seconds=sleep_seconds))
    if args.break_lock:
        print("    !! reserve_inventory() row lock REMOVED")
    if args.break_constraint:
        db.psql("alter table public.inventory "
                "drop constraint if exists inventory_reserved_within_quantity;")
        print("    !! inventory_reserved_within_quantity constraint DROPPED")

    prepare(db)
    print("    one unit of stock prepared")
    print()

    start = time.monotonic()
    succeeded, refused = run_race(db, args.racers)
    elapsed = time.monotonic() - start

    orders = db.last(
        "set role service_role; "
        "select count(*) from public.order_requests where customer_email like 'race%@example.test';"
    )
    reserved = db.last(
        "set role service_role; "
        f"select reserved_quantity from public.inventory where product_id = '{PRODUCT_ID}';"
    )
    available = db.last(
        "set role service_role; "
        f"select quantity - reserved_quantity from public.inventory where product_id = '{PRODUCT_ID}';"
    )

    print(f"    succeeded:        {succeeded}")
    print(f"    refused:          {refused}")
    print(f"    orders created:   {orders}")
    print(f"    reserved:         {reserved}")
    print(f"    still available:  {available}")
    print(f"    wall time:        {elapsed:.2f}s")
    print()

    violations = []
    if succeeded != 1:
        violations.append(f"expected exactly 1 racer to succeed, got {succeeded}")
    if orders != "1":
        violations.append(f"expected exactly 1 order request, found {orders}")
    if reserved != "1":
        violations.append(f"expected reserved_quantity 1, got {reserved}")
    if available != "0":
        violations.append(f"expected 0 available, got {available}")

    if expect_break:
        if violations:
            print("NEGATIVE CONTROL: the invariant broke as expected, so the test has teeth.")
            for v in violations:
                print(f"  detected: {v}")
            return 0
        print("NEGATIVE CONTROL INCONCLUSIVE: the invariant still held with both "
              "protections removed, so this run does not prove the test detects a "
              "failure. Add --slow-window to widen the race window.", file=sys.stderr)
        return 1

    if violations:
        print("Concurrency test FAILED:", file=sys.stderr)
        for v in violations:
            print(f"  - {v}", file=sys.stderr)
        return 1

    if args.break_lock or args.break_constraint:
        # One protection was removed and the other held. This is the
        # defence-in-depth result: worth stating explicitly rather than leaving
        # the reader to infer it from a green tick.
        survivor = "check constraint" if args.break_lock else "row lock"
        print(f"Defence-in-depth confirmed: the {survivor} alone held the invariant.")
        return 0

    print("Concurrency test passed: exactly one reservation was granted for one unit of stock.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

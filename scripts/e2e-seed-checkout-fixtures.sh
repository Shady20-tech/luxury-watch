#!/usr/bin/env bash
#
# Enable one offline settlement method and one delivery option, so the E2E
# suite can exercise a real order submission.
#
# The seed deliberately leaves both tables empty (KNOWN_ISSUES F1 is still
# open: which manual payment methods the owner wants at launch is a business
# decision). An empty table is not a bug — /checkout degrades honestly and says
# so — but it means the submit path cannot be reached at all, which is the one
# flow worth an end-to-end test.
#
# This writes fixtures to the *local preview database only*. It is idempotent
# and safe to re-run. Nothing here is applied to Supabase.
#
#   ./scripts/e2e-seed-checkout-fixtures.sh
set -u

PG_HOST="${PGHOST:-127.0.0.1}"
PG_PORT="${PGPORT:-55432}"
PG_PASSWORD="${PGPASSWORD:-postgres}"
PG_DATABASE="${PGDATABASE:-postgres}"

run_psql() {
  PGPASSWORD="$PG_PASSWORD" psql -v ON_ERROR_STOP=1 \
    -h "$PG_HOST" -p "$PG_PORT" -U postgres -d "$PG_DATABASE" "$@"
}

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found; cannot seed checkout fixtures." >&2
  exit 1
fi

run_psql <<'SQL'
-- Release stock held by earlier E2E submissions. The suite places real order
-- requests, and each one reserves a piece; without this the 12 published seed
-- pieces would be exhausted after a dozen runs and the suite would start
-- failing for a reason that has nothing to do with the code under test.
-- Releasing marks the reservation inactive and returns it to sale, which is the
-- same path an administrator's "reject" takes.
do $$
declare r record;
begin
  for r in
    select reservation.order_request_id, reservation.product_id
      from public.inventory_reservations reservation
      join public.order_requests ord on ord.id = reservation.order_request_id
     where reservation.is_active
       and ord.customer_email like 'qa-tester%@example.test'
  loop
    perform public.release_reservation(
      r.order_request_id, r.product_id, 'E2E teardown'
    );
  end loop;
end
$$;

insert into public.payment_methods (code, label, description, is_enabled, sort_order)
values (
  'bank_transfer',
  'Bank transfer',
  'We will send transfer details once the request is confirmed.',
  true,
  10
)
on conflict (code) do update set is_enabled = true;

insert into public.delivery_options (code, label, description, fee_cents, is_enabled, sort_order)
values (
  'insured_delivery',
  'Insured delivery',
  'Fully insured, signature required.',
  0,
  true,
  10
)
on conflict (code) do update set is_enabled = true;
SQL

echo "Checkout fixtures enabled (bank_transfer, insured_delivery)."

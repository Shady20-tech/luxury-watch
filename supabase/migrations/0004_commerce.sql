-- =============================================================================
-- 0004 — Commerce without payments: carts, order requests, offline methods
--
-- There is no payment gateway anywhere in this schema. What exists instead is a
-- record of which offline method the customer chose, and an administrator-
-- controlled list of the methods that are offered.
-- payment-guard:allow — the next line names card fields only in order to forbid them.
-- No column can hold a card number, a CVV, an expiry date or a payment token.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- payment_methods — administrator-controlled list of OFFLINE options
--
-- These are instructions, not a payment integration: "bank transfer to account
-- X", "pay cash on collection". Nothing here processes anything.
-- -----------------------------------------------------------------------------

create table public.payment_methods (
  id           uuid primary key default gen_random_uuid(),
  code         text not null,
  label        text not null,
  description  text,
  instructions text,
  is_enabled   boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint payment_methods_code_format check (code ~ '^[a-z0-9_]{2,40}$'),
  constraint payment_methods_label_length check (char_length(trim(label)) between 1 and 120)
);

comment on table public.payment_methods is
  'Offline settlement options shown to the customer. No online payment is processed.';

create unique index payment_methods_code_key on public.payment_methods (code);
create index payment_methods_enabled_sort_idx on public.payment_methods (is_enabled, sort_order);

create trigger payment_methods_set_updated_at
  before update on public.payment_methods
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- delivery_options
-- -----------------------------------------------------------------------------

create table public.delivery_options (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  label       text not null,
  description text,
  fee_cents   bigint not null default 0,
  is_enabled  boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint delivery_options_code_format check (code ~ '^[a-z0-9_]{2,40}$'),
  constraint delivery_options_label_length check (char_length(trim(label)) between 1 and 120),
  constraint delivery_options_fee_non_negative check (fee_cents >= 0)
);

create unique index delivery_options_code_key on public.delivery_options (code);

create trigger delivery_options_set_updated_at
  before update on public.delivery_options
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- carts and cart_items
--
-- A cart may belong to a signed-in user or to an anonymous session. The
-- `session_token` is a server-generated random value stored in an httpOnly
-- cookie; it is not guessable and is never exposed in a URL.
-- -----------------------------------------------------------------------------

create table public.carts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete cascade,
  session_token text,
  currency      char(3) not null default 'USD',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint carts_owner_present check (user_id is not null or session_token is not null),
  constraint carts_session_token_format check (session_token is null or session_token ~ '^[a-f0-9]{32,128}$'),
  constraint carts_currency_format check (currency ~ '^[A-Z]{3}$')
);

comment on table public.carts is
  'Persisted cart. Owned by a user or by an anonymous session token, never by nothing.';

-- One open cart per user, and one per session token.
create unique index carts_user_key on public.carts (user_id) where user_id is not null;
create unique index carts_session_key on public.carts (session_token) where session_token is not null;

create trigger carts_set_updated_at
  before update on public.carts
  for each row execute function public.set_updated_at();

create table public.cart_items (
  id               uuid primary key default gen_random_uuid(),
  cart_id          uuid not null references public.carts (id) on delete cascade,
  product_id       uuid not null references public.products (id) on delete cascade,
  quantity         integer not null default 1,
  -- Snapshot for display only. The order request recomputes the real total from
  -- current product prices, so a tampered snapshot cannot change what is charged.
  unit_price_cents bigint,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint cart_items_quantity_positive check (quantity > 0 and quantity <= 99),
  constraint cart_items_unit_price_non_negative check (unit_price_cents is null or unit_price_cents >= 0)
);

create unique index cart_items_cart_product_key on public.cart_items (cart_id, product_id);
create index cart_items_cart_idx on public.cart_items (cart_id);

create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- order_requests
--
-- Named "requests" deliberately: this is a request for an administrator to
-- review and settle offline, not a paid order. The confirmation copy in the
-- storefront must match that meaning.
--
-- No column stores card data. `payment_method_code` records the customer's
-- chosen OFFLINE method.
-- -----------------------------------------------------------------------------

create table public.order_requests (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null default public.generate_order_reference(),
  user_id             uuid references auth.users (id) on delete set null,

  customer_name       text not null,
  customer_email      extensions.citext not null,
  customer_phone      text,

  fulfilment_type     public.fulfilment_type not null,
  delivery_address    jsonb,
  pickup_location     text,

  payment_method_code text references public.payment_methods (code) on delete restrict,
  customer_note       text,
  admin_note          text,

  -- Money is stored in minor units as integers. Floating point is never used
  -- for currency. These are recomputed server-side from product prices.
  subtotal_cents      bigint not null default 0,
  delivery_fee_cents  bigint not null default 0,
  total_cents         bigint not null default 0,
  currency            char(3) not null default 'USD',

  status              public.order_status not null default 'submitted',

  -- Audit of the offline settlement, recorded by an administrator only.
  settled_offline_at  timestamptz,
  settled_offline_by  uuid references auth.users (id) on delete set null,

  -- Spam mitigation evidence, retained for review rather than trusted.
  ip_hash             text,
  user_agent          text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint order_requests_customer_name_length check (char_length(trim(customer_name)) between 1 and 200),
  constraint order_requests_email_length check (char_length(customer_email::text) between 3 and 320),
  constraint order_requests_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint order_requests_amounts_non_negative check (
    subtotal_cents >= 0 and delivery_fee_cents >= 0 and total_cents >= 0
  ),
  -- The stored total must equal its parts, so a bad write cannot create an
  -- order whose arithmetic does not add up.
  constraint order_requests_total_matches_parts check (
    total_cents = subtotal_cents + delivery_fee_cents
  ),
  -- Pickup needs no address; delivery needs one.
  constraint order_requests_fulfilment_details check (
    (fulfilment_type = 'delivery' and delivery_address is not null)
    or (fulfilment_type = 'pickup')
  ),
  -- Offline settlement must be attributed and timestamped together.
  constraint order_requests_settlement_complete check (
    (settled_offline_at is null and settled_offline_by is null)
    or (settled_offline_at is not null and settled_offline_by is not null)
  )
);

comment on table public.order_requests is
  'Customer order request reviewed and settled offline by an administrator. No payment is processed.';

create unique index order_requests_reference_key on public.order_requests (reference);
create index order_requests_user_idx on public.order_requests (user_id, created_at desc);
create index order_requests_status_idx on public.order_requests (status, created_at desc);
create index order_requests_email_idx on public.order_requests (customer_email);
create index order_requests_created_idx on public.order_requests (created_at desc);

create trigger order_requests_set_updated_at
  before update on public.order_requests
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- order_request_items
--
-- product_id is ON DELETE SET NULL and the descriptive fields are snapshots, so
-- deleting a product later never rewrites the history of what was requested.
-- -----------------------------------------------------------------------------

create table public.order_request_items (
  id                    uuid primary key default gen_random_uuid(),
  order_request_id      uuid not null references public.order_requests (id) on delete cascade,
  product_id            uuid references public.products (id) on delete set null,

  product_title_snapshot text not null,
  sku_snapshot           text not null,
  slug_snapshot          text,
  image_url_snapshot     text,

  unit_price_cents      bigint,
  quantity              integer not null default 1,
  line_total_cents      bigint not null default 0,

  created_at            timestamptz not null default now(),

  constraint order_request_items_quantity_positive check (quantity > 0 and quantity <= 99),
  constraint order_request_items_title_length check (char_length(trim(product_title_snapshot)) between 1 and 300),
  constraint order_request_items_line_total_consistent check (
    line_total_cents = coalesce(unit_price_cents, 0) * quantity
  )
);

create index order_request_items_order_idx on public.order_request_items (order_request_id);
create index order_request_items_product_idx on public.order_request_items (product_id);

-- -----------------------------------------------------------------------------
-- order_request_events — immutable status history
-- -----------------------------------------------------------------------------

create table public.order_request_events (
  id               uuid primary key default gen_random_uuid(),
  order_request_id uuid not null references public.order_requests (id) on delete cascade,
  from_status      public.order_status,
  to_status        public.order_status not null,
  note             text,
  -- Null actor means the transition was performed by the system (for example the
  -- customer submitting the request), not by a person.
  actor_id         uuid references auth.users (id) on delete set null,
  actor_label      text,
  created_at       timestamptz not null default now()
);

comment on table public.order_request_events is
  'Append-only order status history. Every transition is attributable.';

create index order_request_events_order_idx on public.order_request_events (order_request_id, created_at);

-- -----------------------------------------------------------------------------
-- orders table removed from the design
--
-- The phase brief mentions "orders, order_items, order status history". Those
-- exist here as order_requests, order_request_items and order_request_events.
-- A separate `orders` table was deliberately NOT created: two tables that both
-- describe a purchase invite a split-brain state where one says paid and the
-- other says pending, and nothing in this application can legitimately mark
-- anything paid online.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Reservation bookkeeping
--
-- A reservation ties an order request to the stock it is holding. Keeping it in
-- its own table means "what is this reservation for?" is answerable, and the
-- release-on-reject rule has somewhere explicit to act.
-- -----------------------------------------------------------------------------

create table public.inventory_reservations (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.products (id) on delete cascade,
  order_request_id uuid not null references public.order_requests (id) on delete cascade,
  quantity         integer not null default 1,
  is_active        boolean not null default true,
  released_at      timestamptz,
  release_reason   text,
  created_at       timestamptz not null default now(),

  constraint inventory_reservations_quantity_positive check (quantity > 0),
  -- A released reservation must say when and why.
  constraint inventory_reservations_release_complete check (
    (is_active and released_at is null)
    or (not is_active and released_at is not null)
  )
);

comment on table public.inventory_reservations is
  'Stock held for an order request. Released when the request is rejected or cancelled.';

-- At most one active reservation per product per order request.
create unique index inventory_reservations_active_key
  on public.inventory_reservations (order_request_id, product_id)
  where is_active;

create index inventory_reservations_product_idx on public.inventory_reservations (product_id) where is_active;
create index inventory_reservations_order_idx on public.inventory_reservations (order_request_id);

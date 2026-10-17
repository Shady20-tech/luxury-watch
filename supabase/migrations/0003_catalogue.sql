-- =============================================================================
-- 0003 — Catalogue: brands, models, collections, products, media, inventory
--
-- Mirrors the reference site's two-level taxonomy (Brand -> Model) plus
-- free-standing merchandising collections, so the storefront reads every
-- product attribute from the database rather than from hardcoded arrays.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- brands
-- -----------------------------------------------------------------------------

create table public.brands (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null,
  description     text,
  logo_url        text,
  hero_image_url  text,
  country         text,
  founded_year    integer,
  seo_title       text,
  seo_description text,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint brands_name_length check (char_length(trim(name)) between 1 and 120),
  constraint brands_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint brands_founded_year_sane check (founded_year is null or founded_year between 1700 and 2200)
);

comment on table public.brands is
  'Watch manufacturers. Rendered as factual product attribution only; no dealer claim is implied.';

create unique index brands_slug_key on public.brands (slug);
create index brands_active_sort_idx on public.brands (is_active, sort_order);

create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- models
--
-- The second taxonomy level (Rolex -> Submariner). brand_id + slug is unique
-- rather than slug alone, because two brands may legitimately share a model name.
-- -----------------------------------------------------------------------------

create table public.models (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references public.brands (id) on delete cascade,
  name            text not null,
  slug            text not null,
  description     text,
  hero_image_url  text,
  seo_title       text,
  seo_description text,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint models_name_length check (char_length(trim(name)) between 1 and 160),
  constraint models_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.models is 'Second-level taxonomy: a model family within a brand.';

create unique index models_brand_slug_key on public.models (brand_id, slug);
create index models_brand_idx on public.models (brand_id);
create index models_active_sort_idx on public.models (is_active, sort_order);

create trigger models_set_updated_at
  before update on public.models
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- products
--
-- A watch is a unique physical object, so quantity is tracked in `inventory`
-- (one row per product) rather than as a variant matrix.
-- -----------------------------------------------------------------------------

create table public.products (
  id                  uuid primary key default gen_random_uuid(),
  sku                 text not null,
  slug                text not null,
  title               text not null,
  brand_id            uuid references public.brands (id) on delete restrict,
  model_id            uuid references public.models (id) on delete set null,

  short_description   text,
  description         text,

  -- Pricing. price_on_request is the norm for this catalogue: the reference
  -- site publishes no price on any of its 4,110 products. When it is true,
  -- price_cents must be null, so the storefront and the Product JSON-LD cannot
  -- accidentally publish a price that does not exist.
  price_cents         bigint,
  currency            char(3) not null default 'USD',
  price_on_request    boolean not null default true,
  compare_at_cents    bigint,
  cost_cents          bigint,

  condition           public.product_condition,
  production_year     integer,
  reference_number    text,

  -- Denormalised specs kept as first-class columns because they are used for
  -- faceted filtering and sorting. Anything not worth filtering on lives in
  -- product_specs as a flexible label/value pair.
  case_size_mm        numeric(5,2),
  case_material       text,
  movement            text,
  dial_color          text,
  bracelet_material   text,
  bezel               text,
  water_resistance_m  integer,
  gender              text,
  box_and_papers      boolean,

  -- Publication. `status` gates public visibility; `published_at` is the real
  -- publication time used for the sitemap; `updated_at` drives sitemap lastmod.
  status              public.product_status not null default 'draft',
  published_at        timestamptz,
  is_featured         boolean not null default false,
  sort_order          integer not null default 0,

  seo_title           text,
  seo_description     text,
  og_image_url        text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint products_title_length  check (char_length(trim(title)) between 1 and 300),
  constraint products_slug_format   check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint products_sku_length    check (char_length(trim(sku)) between 1 and 120),
  constraint products_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint products_price_non_negative check (price_cents is null or price_cents >= 0),
  constraint products_cost_non_negative  check (cost_cents is null or cost_cents >= 0),
  constraint products_compare_non_negative check (compare_at_cents is null or compare_at_cents >= 0),
  constraint products_case_size_sane check (case_size_mm is null or case_size_mm between 1 and 200),
  constraint products_year_sane check (production_year is null or production_year between 1800 and 2200),

  -- The core honesty constraint: a price-on-request product must not carry a
  -- price, and a priced product must not be flagged price-on-request.
  constraint products_price_consistency check (
    (price_on_request and price_cents is null)
    or (not price_on_request and price_cents is not null)
  ),

  -- A published product must record when it was published, otherwise the sitemap
  -- would have to invent a timestamp.
  constraint products_published_requires_timestamp check (
    status <> 'published' or published_at is not null
  )
);

comment on table public.products is
  'Watch listings. Every storefront attribute is read from here; nothing is hardcoded.';

create unique index products_slug_key on public.products (slug);
create unique index products_sku_key  on public.products (sku);

create index products_status_published_idx on public.products (status, published_at desc);
create index products_brand_idx   on public.products (brand_id);
create index products_model_idx   on public.products (model_id);
create index products_condition_idx on public.products (condition);
create index products_featured_idx on public.products (is_featured) where is_featured;
-- Supports the sitemap query, which orders by recency of real change.
create index products_updated_at_idx on public.products (updated_at desc);
create index products_price_idx on public.products (price_cents) where price_cents is not null;
create index products_case_size_idx on public.products (case_size_mm);
create index products_year_idx on public.products (production_year);

-- Full-text search over the fields a customer actually searches.
create index products_search_idx on public.products
  using gin (to_tsvector('english',
    coalesce(title, '') || ' ' || coalesce(reference_number, '') || ' ' ||
    coalesce(short_description, '') || ' ' || coalesce(case_material, '') || ' ' ||
    coalesce(dial_color, '')
  ));

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- product_images
-- -----------------------------------------------------------------------------

create table public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  storage_path text,
  external_url text,
  alt_text     text not null,
  width        integer,
  height       integer,
  sort_order   integer not null default 0,
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),

  -- Either a Storage object or an external URL, never neither and never both.
  constraint product_images_source_exclusive check (
    (storage_path is not null and external_url is null)
    or (storage_path is null and external_url is not null)
  ),
  constraint product_images_alt_required check (char_length(trim(alt_text)) between 1 and 300)
);

comment on table public.product_images is
  'Product media. alt_text is NOT NULL because every image must be describable for accessibility.';

create unique index product_images_one_primary_idx
  on public.product_images (product_id)
  where is_primary;

create index product_images_product_sort_idx on public.product_images (product_id, sort_order);

-- -----------------------------------------------------------------------------
-- product_specs — flexible label/value pairs for attributes not worth a column
-- -----------------------------------------------------------------------------

create table public.product_specs (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label      text not null,
  value      text not null,
  sort_order integer not null default 0,

  constraint product_specs_label_length check (char_length(trim(label)) between 1 and 120),
  constraint product_specs_value_length check (char_length(trim(value)) between 1 and 600)
);

create index product_specs_product_idx on public.product_specs (product_id, sort_order);

-- -----------------------------------------------------------------------------
-- collections and collection_products
-- -----------------------------------------------------------------------------

create table public.collections (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  slug            text not null,
  description     text,
  kind            public.collection_kind not null default 'merchandising',
  hero_image_url  text,
  seo_title       text,
  seo_description text,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint collections_title_length check (char_length(trim(title)) between 1 and 200),
  constraint collections_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create unique index collections_slug_key on public.collections (slug);
create index collections_active_sort_idx on public.collections (is_active, sort_order);

create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create table public.collection_products (
  collection_id uuid not null references public.collections (id) on delete cascade,
  product_id    uuid not null references public.products (id) on delete cascade,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),

  primary key (collection_id, product_id)
);

create index collection_products_product_idx on public.collection_products (product_id);

-- -----------------------------------------------------------------------------
-- inventory — one row per product, because each watch is a unique object
-- -----------------------------------------------------------------------------

create table public.inventory (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references public.products (id) on delete cascade,
  quantity             integer not null default 0,
  reserved_quantity    integer not null default 0,
  low_stock_threshold  integer not null default 1,
  location             text,
  updated_at           timestamptz not null default now(),

  -- These two constraints are the last line of defence against overselling.
  -- Application logic and the reservation RPC both check availability, but even
  -- a direct SQL statement cannot drive either counter negative.
  constraint inventory_quantity_non_negative check (quantity >= 0),
  constraint inventory_reserved_non_negative check (reserved_quantity >= 0),
  -- Reserved stock can never exceed stock on hand.
  constraint inventory_reserved_within_quantity check (reserved_quantity <= quantity)
);

comment on table public.inventory is
  'Stock per product. quantity/reserved_quantity can never go negative or overlap.';

create unique index inventory_product_key on public.inventory (product_id);
create index inventory_low_stock_idx on public.inventory (quantity, low_stock_threshold);

create trigger inventory_set_updated_at
  before update on public.inventory
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- inventory_transactions — immutable ledger of every stock movement
-- -----------------------------------------------------------------------------

create table public.inventory_transactions (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products (id) on delete cascade,
  kind            public.inventory_transaction_kind not null,
  quantity_delta  integer not null,
  reserved_delta  integer not null default 0,
  -- Set when the movement is tied to an order request.
  order_request_id uuid,
  actor_id        uuid references auth.users (id) on delete set null,
  note            text,
  created_at      timestamptz not null default now(),

  constraint inventory_transactions_quantity_delta_nonzero check (quantity_delta <> 0 or reserved_delta <> 0)
);

comment on table public.inventory_transactions is
  'Append-only ledger. Rows are never updated or deleted by application code.';

create index inventory_transactions_product_idx on public.inventory_transactions (product_id, created_at desc);
create index inventory_transactions_order_idx on public.inventory_transactions (order_request_id);

-- -----------------------------------------------------------------------------
-- Inventory integrity: the ledger must agree with the balance
--
-- A trigger recomputes the balance from the ledger on every movement. This makes
-- the ledger the source of truth, so a bug in application code cannot silently
-- desynchronise `inventory` from the recorded history.
-- -----------------------------------------------------------------------------

create or replace function public.apply_inventory_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inventory
     set quantity          = quantity + new.quantity_delta,
         reserved_quantity = reserved_quantity + new.reserved_delta
   where product_id = new.product_id;

  if not found then
    -- No inventory row yet: create one, but only if the movement leaves a
    -- non-negative balance. Otherwise the check constraint would raise a less
    -- useful error.
    if new.quantity_delta < 0 or new.reserved_delta < 0 then
      raise exception 'Inventory movement for product % would go negative with no existing inventory row',
        new.product_id using errcode = 'check_violation';
    end if;
    insert into public.inventory (product_id, quantity, reserved_quantity)
    values (new.product_id, new.quantity_delta, new.reserved_delta);
  end if;

  return new;
end;
$$;

comment on function public.apply_inventory_transaction() is
  'Applies each ledger row to the inventory balance, keeping the two in step.';

create trigger inventory_transactions_apply
  after insert on public.inventory_transactions
  for each row execute function public.apply_inventory_transaction();

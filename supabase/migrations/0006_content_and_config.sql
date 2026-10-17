-- =============================================================================
-- 0006 — Content, CMS and configuration
--
-- Everything an administrator can change without a deployment: pages, FAQs,
-- announcements, testimonials, navigation, homepage sections, media, settings.
-- The reference site hardcodes much of this into its theme; here it is data.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- pages — CMS pages and policies
-- -----------------------------------------------------------------------------

create table public.pages (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null,
  title           text not null,
  -- Stored as structured blocks rather than raw HTML so the renderer controls
  -- what can be emitted and a stored page cannot inject a script tag.
  content         jsonb not null default '[]'::jsonb,
  excerpt         text,
  hero_image_url  text,
  status          public.page_status not null default 'draft',
  published_at    timestamptz,
  seo_title       text,
  seo_description text,
  -- Policies are linked in the footer and must not be removed silently.
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint pages_title_length check (char_length(trim(title)) between 1 and 300),
  constraint pages_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint pages_published_requires_timestamp check (status <> 'published' or published_at is not null)
);

create unique index pages_slug_key on public.pages (slug);
create index pages_status_idx on public.pages (status, published_at desc);

create trigger pages_set_updated_at
  before update on public.pages
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- faqs
-- -----------------------------------------------------------------------------

create table public.faqs (
  id           uuid primary key default gen_random_uuid(),
  question     text not null,
  answer       text not null,
  category     text,
  sort_order   integer not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint faqs_question_length check (char_length(trim(question)) between 1 and 500),
  constraint faqs_answer_length check (char_length(trim(answer)) between 1 and 8000)
);

create index faqs_published_sort_idx on public.faqs (is_published, category, sort_order);

create trigger faqs_set_updated_at
  before update on public.faqs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- announcements — the rotating bar under the header
-- -----------------------------------------------------------------------------

create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  link_label text,
  link_url   text,
  is_active  boolean not null default false,
  sort_order integer not null default 0,
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint announcements_message_length check (char_length(trim(message)) between 1 and 500),
  constraint announcements_window_order check (starts_at is null or ends_at is null or starts_at <= ends_at)
);

create index announcements_active_idx on public.announcements (is_active, sort_order);

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- testimonials
-- -----------------------------------------------------------------------------

create table public.testimonials (
  id           uuid primary key default gen_random_uuid(),
  quote        text not null,
  author       text not null,
  location     text,
  rating       integer,
  is_published boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint testimonials_quote_length check (char_length(trim(quote)) between 1 and 2000),
  constraint testimonials_author_length check (char_length(trim(author)) between 1 and 200),
  constraint testimonials_rating_range check (rating is null or rating between 1 and 5)
);

create index testimonials_published_sort_idx on public.testimonials (is_published, sort_order);

create trigger testimonials_set_updated_at
  before update on public.testimonials
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- navigation_items — header, footer and top-bar menus
--
-- Self-referencing parent_id gives the mega-menu its column structure without a
-- separate table per menu depth.
-- -----------------------------------------------------------------------------

create table public.navigation_items (
  id         uuid primary key default gen_random_uuid(),
  location   public.navigation_location not null,
  parent_id  uuid references public.navigation_items (id) on delete cascade,
  label      text not null,
  href       text not null,
  -- Optional grouping heading inside a mega-menu column.
  group_label text,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint navigation_items_label_length check (char_length(trim(label)) between 1 and 160),
  constraint navigation_items_href_length check (char_length(trim(href)) between 1 and 500),
  -- Only internal paths or https URLs, so a menu cannot be pointed at javascript:.
  constraint navigation_items_href_safe check (
    href ~ '^/' or href ~ '^https://'
  )
);

create index navigation_items_location_idx on public.navigation_items (location, parent_id, sort_order);

create trigger navigation_items_set_updated_at
  before update on public.navigation_items
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- homepage_sections — ordered, editable home page composition
-- -----------------------------------------------------------------------------

create table public.homepage_sections (
  id          uuid primary key default gen_random_uuid(),
  section_key text not null,
  title       text,
  subtitle    text,
  body        text,
  cta_label   text,
  cta_href    text,
  image_url   text,
  -- Section-specific payload, e.g. which collection to render.
  settings    jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint homepage_sections_key_format check (section_key ~ '^[a-z0-9_]{2,60}$'),
  constraint homepage_sections_cta_safe check (
    cta_href is null or cta_href ~ '^/' or cta_href ~ '^https://'
  )
);

create unique index homepage_sections_key_key on public.homepage_sections (section_key);
create index homepage_sections_active_sort_idx on public.homepage_sections (is_active, sort_order);

create trigger homepage_sections_set_updated_at
  before update on public.homepage_sections
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- media — registry of uploaded assets
-- -----------------------------------------------------------------------------

create table public.media (
  id            uuid primary key default gen_random_uuid(),
  storage_bucket text not null default 'media',
  storage_path  text not null,
  file_name     text not null,
  mime_type     text not null,
  size_bytes    bigint,
  width         integer,
  height        integer,
  alt_text      text,
  caption       text,
  uploaded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint media_size_non_negative check (size_bytes is null or size_bytes >= 0),
  -- Only image types are accepted. Uploads are admin-only, but a MIME allowlist
  -- in the database means an SVG carrying a script cannot be registered.
  constraint media_mime_image_only check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif')
  )
);

create unique index media_path_key on public.media (storage_bucket, storage_path);

create trigger media_set_updated_at
  before update on public.media
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- site_settings — singleton row, enforced by a boolean primary key
--
-- A check constraint on a fixed id is the simplest way to guarantee exactly one
-- row: the primary key can only ever hold the value true.
-- -----------------------------------------------------------------------------

create table public.site_settings (
  id                  boolean primary key default true,
  business_name       text not null default 'Luxury Watch',
  tagline             text,
  logo_url            text,
  contact_email       extensions.citext,
  contact_phone       text,
  whatsapp_url        text,
  address_line1       text,
  address_line2       text,
  address_city        text,
  address_region      text,
  address_postal_code text,
  address_country     text,
  social_instagram    text,
  social_facebook     text,
  social_x            text,
  social_youtube      text,
  default_currency    char(3) not null default 'USD',
  age_gate_enabled    boolean not null default true,
  age_gate_minimum_age integer not null default 18,
  -- Shown on the order confirmation, so it must be explicit about the offline step.
  order_confirmation_note text,
  updated_at          timestamptz not null default now(),

  constraint site_settings_singleton check (id),
  constraint site_settings_currency_format check (default_currency ~ '^[A-Z]{3}$'),
  constraint site_settings_age_gate_minimum check (age_gate_minimum_age between 13 and 25)
);

comment on table public.site_settings is
  'Exactly one row (id = true). Public business information only.';

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- newsletter_subscribers
-- -----------------------------------------------------------------------------

create table public.newsletter_subscribers (
  id               uuid primary key default gen_random_uuid(),
  email            extensions.citext not null,
  is_confirmed     boolean not null default false,
  confirmed_at     timestamptz,
  unsubscribed_at  timestamptz,
  -- Opaque token for the confirmation and unsubscribe links. pgcrypto lives in
  -- the `extensions` schema on Supabase, so the call is schema-qualified.
  token            text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  source           text,
  ip_hash          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint newsletter_subscribers_email_length check (char_length(email::text) between 3 and 320),
  constraint newsletter_subscribers_confirmed_complete check (
    (not is_confirmed and confirmed_at is null)
    or (is_confirmed and confirmed_at is not null)
  )
);

create unique index newsletter_subscribers_email_key on public.newsletter_subscribers (email);
create unique index newsletter_subscribers_token_key on public.newsletter_subscribers (token);

create trigger newsletter_subscribers_set_updated_at
  before update on public.newsletter_subscribers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- wishlists
-- -----------------------------------------------------------------------------

create table public.wishlists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null default 'My Wishlist',
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint wishlists_name_length check (char_length(trim(name)) between 1 and 120)
);

create unique index wishlists_one_default_per_user_idx on public.wishlists (user_id) where is_default;
create index wishlists_user_idx on public.wishlists (user_id);

create trigger wishlists_set_updated_at
  before update on public.wishlists
  for each row execute function public.set_updated_at();

create table public.wishlist_items (
  id          uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.wishlists (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  created_at  timestamptz not null default now(),

  constraint wishlist_items_unique unique (wishlist_id, product_id)
);

create index wishlist_items_wishlist_idx on public.wishlist_items (wishlist_id, created_at desc);

-- -----------------------------------------------------------------------------
-- admin_audit_logs — who changed what, and when
--
-- Append-only. There is no update or delete policy for anyone, including
-- SUPER_ADMIN, so an administrator cannot quietly rewrite the audit trail.
-- -----------------------------------------------------------------------------

create table public.admin_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users (id) on delete set null,
  actor_email extensions.citext,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  -- Before/after snapshots, with secrets already excluded by the caller.
  changes     jsonb,
  ip_hash     text,
  created_at  timestamptz not null default now(),

  constraint admin_audit_logs_action_length check (char_length(trim(action)) between 1 and 120),
  constraint admin_audit_logs_entity_length check (char_length(trim(entity_type)) between 1 and 120)
);

comment on table public.admin_audit_logs is
  'Append-only administrative audit trail. No update or delete policy exists.';

create index admin_audit_logs_actor_idx on public.admin_audit_logs (actor_id, created_at desc);
create index admin_audit_logs_entity_idx on public.admin_audit_logs (entity_type, entity_id, created_at desc);
create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);

-- -----------------------------------------------------------------------------
-- rate_limit_counters — Postgres-backed limiter for public mutation endpoints
--
-- Chosen over a third-party service so rate limiting needs no extra dependency
-- and no data leaves Supabase.
-- -----------------------------------------------------------------------------

create table public.rate_limit_counters (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null,
  window_start timestamptz not null,
  count        integer not null default 1,

  constraint rate_limit_counters_bucket_length check (char_length(bucket) between 1 and 200),
  constraint rate_limit_counters_count_positive check (count >= 0)
);

create unique index rate_limit_counters_bucket_window_key
  on public.rate_limit_counters (bucket, window_start);

-- -----------------------------------------------------------------------------
-- Legal and policy content seed
--
-- System pages are created here so the footer never links to a 404. They are
-- deliberately created as DRAFTS with placeholder text: the owner must supply
-- the real policy wording, and publishing invented legal text would be worse
-- than publishing nothing.
-- -----------------------------------------------------------------------------

insert into public.pages (slug, title, content, status, is_system, seo_title, seo_description)
values
  ('privacy-policy', 'Privacy Policy', '[]'::jsonb, 'draft', true, 'Privacy Policy', 'How we collect, use and protect your personal information.'),
  ('terms-of-use', 'Terms of Use', '[]'::jsonb, 'draft', true, 'Terms of Use', 'The terms that govern your use of this website and our services.'),
  ('shipping', 'Shipping & Delivery', '[]'::jsonb, 'draft', true, 'Shipping & Delivery', 'Delivery options, timescales and collection arrangements.'),
  ('warranty', 'Warranty', '[]'::jsonb, 'draft', true, 'Warranty', 'Warranty terms for watches purchased from us.'),
  ('satisfaction-guarantee', 'Satisfaction Guarantee', '[]'::jsonb, 'draft', true, 'Satisfaction Guarantee', 'Our guarantee to you when you buy a watch from us.'),
  ('data-sharing-opt-out', 'Data Sharing Opt-Out', '[]'::jsonb, 'draft', true, 'Data Sharing Opt-Out', 'How to opt out of data sharing.'),
  ('about-us', 'About Us', '[]'::jsonb, 'draft', true, 'About Us', 'Who we are and how we work.'),
  ('contact', 'Contact', '[]'::jsonb, 'draft', true, 'Contact Us', 'How to reach us.'),
  ('faqs', 'Frequently Asked Questions', '[]'::jsonb, 'draft', true, 'FAQs', 'Answers to common questions about buying, selling and repairing.'),
  ('sell-trade-your-watch', 'Sell or Trade Your Watch', '[]'::jsonb, 'draft', true, 'Sell or Trade Your Watch', 'Sell or part-exchange your watch with us.'),
  ('repair-restoration', 'Repair & Restoration', '[]'::jsonb, 'draft', true, 'Repair & Restoration', 'Watch servicing, repair and restoration.'),
  ('watch-sourcing', 'Watch Sourcing', '[]'::jsonb, 'draft', true, 'Watch Sourcing', 'We will source the watch you are looking for.')
on conflict (slug) do nothing;

-- Default settings row. Values are placeholders the owner replaces; they are
-- not presented as real business details anywhere until edited.
insert into public.site_settings (id, business_name, default_currency, age_gate_enabled, order_confirmation_note)
values (
  true,
  'Luxury Watch',
  'USD',
  true,
  'Your request has been received. No payment has been taken. We will contact you to confirm availability and arrange payment offline.'
)
on conflict (id) do nothing;

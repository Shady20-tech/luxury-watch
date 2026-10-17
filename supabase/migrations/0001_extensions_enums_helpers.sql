-- =============================================================================
-- 0001 — Extensions, enums and shared helper functions
--
-- This migration establishes the vocabulary the rest of the schema depends on.
-- Nothing here reads or writes application data, so it is safe to apply to an
-- existing database.
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;

-- citext gives case-insensitive email/slug comparison without lower() indexes.
create extension if not exists "citext" with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
--
-- Enums are used for closed vocabularies that the application branches on. They
-- are deliberately NOT used for values an administrator may extend at runtime
-- (payment methods, delivery options), which are rows in a table instead.
-- -----------------------------------------------------------------------------

-- Staff roles. `customer` is deliberately absent: every authenticated user is a
-- customer by default, and holding no staff role is what makes them one. This
-- means an attacker who gains a write to `profiles` cannot grant themselves
-- `customer`-plus-privileges, because customer is not a privileged value.
create type public.staff_role as enum (
  'SUPER_ADMIN',
  'ADMIN',
  'SALES_MANAGER',
  'INVENTORY_MANAGER',
  'WATCH_EXPERT',
  'CUSTOMER_SUPPORT',
  'CONTENT_MANAGER'
);

create type public.product_condition as enum (
  'new',
  'unworn',
  'pre_owned',
  'vintage'
);

create type public.product_status as enum (
  'draft',
  'published',
  'archived'
);

create type public.collection_kind as enum (
  'taxonomy',
  'merchandising',
  'featured',
  'novelty'
);

-- Order-request lifecycle. There is intentionally NO 'paid' value: an online
-- payment cannot exist in this application, so no state may imply one. The only
-- states that record offline settlement are set by an administrator.
create type public.order_status as enum (
  'submitted',
  'under_review',
  'confirmed',
  'awaiting_payment',
  'paid_offline',
  'fulfilled',
  'cancelled',
  'rejected'
);

create type public.fulfilment_type as enum (
  'delivery',
  'pickup'
);

create type public.inventory_transaction_kind as enum (
  'acquisition',
  'adjustment',
  'reservation',
  'reservation_release',
  'sale',
  'return',
  'correction'
);

create type public.inquiry_type as enum (
  'sell_trade',
  'sourcing',
  'repair',
  'general',
  'product_question'
);

create type public.inquiry_status as enum (
  'new',
  'in_review',
  'responded',
  'closed',
  'spam'
);

create type public.page_status as enum (
  'draft',
  'published',
  'archived'
);

create type public.navigation_location as enum (
  'header',
  'footer',
  'topbar'
);

create type public.appointment_status as enum (
  'requested',
  'confirmed',
  'completed',
  'cancelled'
);

create type public.notification_kind as enum (
  'order_request',
  'inquiry',
  'appointment',
  'system'
);

-- -----------------------------------------------------------------------------
-- updated_at maintenance
--
-- A single trigger function keeps every `updated_at` honest. Product and content
-- sitemap `lastmod` values are derived from these columns, so a missing trigger
-- would produce a sitemap that silently lies about when a page changed.
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger function: stamps updated_at with the current transaction time.';

-- -----------------------------------------------------------------------------
-- Slug normalisation
--
-- Slugs are used in public URLs and in the sitemap, so they must be stable and
-- URL-safe. Normalising in the database means a direct SQL insert cannot create
-- a slug that the application layer would have rejected.
-- -----------------------------------------------------------------------------

create or replace function public.normalize_slug(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'),
      '-{2,}', '-', 'g'
    )
  );
$$;

comment on function public.normalize_slug(text) is
  'Lowercases, replaces non-alphanumerics with hyphens and collapses repeats.';

-- -----------------------------------------------------------------------------
-- Reference-number generation for order requests
--
-- Uses a sequence rather than a random string so references are unique without
-- a retry loop, and human-readable enough to read over the phone.
-- -----------------------------------------------------------------------------

create sequence if not exists public.order_reference_seq start 100001;

create or replace function public.generate_order_reference()
returns text
language sql
volatile
as $$
  select 'LW-' || to_char(now(), 'YY') || '-' || lpad(nextval('public.order_reference_seq')::text, 6, '0');
$$;

comment on function public.generate_order_reference() is
  'Human-readable order-request reference, e.g. LW-26-100001. Unique by sequence.';

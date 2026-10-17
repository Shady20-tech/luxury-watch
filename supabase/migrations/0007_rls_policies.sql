-- =============================================================================
-- 0007 — Authorisation helpers and Row Level Security
--
-- This is the security core of the schema. Two rules govern everything here:
--
--   1. Default deny. RLS is enabled on every table. A table with no policy
--      grants nothing, so forgetting a policy fails closed rather than open.
--
--   2. Authorisation never trusts client-supplied data. Role membership is read
--      from `user_roles` through SECURITY DEFINER functions, not from anything a
--      request can set. `profiles` has no role column at all, so there is
--      nothing on the client-writable side of the schema to forge.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Role helpers
--
-- All are SECURITY DEFINER with `set search_path = ''`:
--   - SECURITY DEFINER lets them read `user_roles` without RLS recursing back
--     into the policy that called them (the classic infinite-recursion trap).
--   - `set search_path = ''` forces every identifier to be schema-qualified, so
--     a caller cannot hijack the lookup by creating an object earlier in the
--     search path.
-- -----------------------------------------------------------------------------

create or replace function public.has_role(required public.staff_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_roles ur
     where ur.user_id = (select auth.uid())
       and (ur.expires_at is null or ur.expires_at > now())
       and (
         ur.role = required
         -- SUPER_ADMIN holds every role. Without this, an owner account would
         -- have to be granted each role individually.
         or ur.role = 'SUPER_ADMIN'
       )
  );
$$;

comment on function public.has_role(public.staff_role) is
  'True when the caller holds the role, or holds SUPER_ADMIN.';

-- Permissions are the unit the application checks, so a new role can be
-- introduced without editing every policy.
create or replace function public.role_permissions(r public.staff_role)
returns text[]
language sql
immutable
as $$
  select case r
    when 'SUPER_ADMIN' then array['*']
    when 'ADMIN' then array[
      'catalog.read','catalog.write',
      'inventory.read','inventory.write',
      'orders.read','orders.write','orders.settle',
      'inquiries.read','inquiries.write',
      'content.read','content.write',
      'customers.read',
      'settings.write',
      'audit.read'
    ]
    when 'SALES_MANAGER' then array[
      'catalog.read',
      'inventory.read',
      'orders.read','orders.write','orders.settle',
      'inquiries.read','inquiries.write',
      'content.read',
      'customers.read'
    ]
    when 'INVENTORY_MANAGER' then array[
      'catalog.read','catalog.write',
      'inventory.read','inventory.write',
      'orders.read'
    ]
    when 'WATCH_EXPERT' then array[
      'catalog.read','catalog.write',
      'inventory.read',
      'orders.read',
      'inquiries.read','inquiries.write'
    ]
    when 'CUSTOMER_SUPPORT' then array[
      'catalog.read',
      'orders.read',
      'inquiries.read','inquiries.write',
      'customers.read'
    ]
    when 'CONTENT_MANAGER' then array[
      'content.read','content.write'
    ]
  end;
$$;

comment on function public.role_permissions(public.staff_role) is
  'Maps a staff role to the permissions it grants. Kept in the database so the application and RLS agree by construction.';

create or replace function public.has_permission(required text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_roles ur
     where ur.user_id = (select auth.uid())
       and (ur.expires_at is null or ur.expires_at > now())
       and (
         '*' = any (public.role_permissions(ur.role))
         or required = any (public.role_permissions(ur.role))
       )
  );
$$;

comment on function public.has_permission(text) is
  'True when any role the caller holds grants the permission, or grants "*".';

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_roles ur
     where ur.user_id = (select auth.uid())
       and (ur.expires_at is null or ur.expires_at > now())
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_roles ur
     where ur.user_id = (select auth.uid())
       and (ur.expires_at is null or ur.expires_at > now())
       and ur.role in ('SUPER_ADMIN', 'ADMIN')
  );
$$;

comment on function public.is_admin() is
  'True only for SUPER_ADMIN or ADMIN. Used for the most sensitive reads.';

-- Only these functions may be called by anonymous and authenticated clients.
-- Everything else stays private to the server.
revoke all on function public.has_role(public.staff_role) from public;
revoke all on function public.has_permission(text) from public;
revoke all on function public.is_staff() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.role_permissions(public.staff_role) from public;

grant execute on function public.has_role(public.staff_role) to anon, authenticated;
grant execute on function public.has_permission(text) to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- =============================================================================
-- Enable RLS everywhere. No table is exempt.
-- =============================================================================

alter table public.profiles                 enable row level security;
alter table public.user_roles               enable row level security;
alter table public.addresses                enable row level security;

alter table public.brands                   enable row level security;
alter table public.models                   enable row level security;
alter table public.products                 enable row level security;
alter table public.product_images           enable row level security;
alter table public.product_specs            enable row level security;
alter table public.collections              enable row level security;
alter table public.collection_products      enable row level security;
alter table public.inventory                enable row level security;
alter table public.inventory_transactions   enable row level security;
alter table public.inventory_reservations   enable row level security;

alter table public.payment_methods          enable row level security;
alter table public.delivery_options         enable row level security;
alter table public.carts                    enable row level security;
alter table public.cart_items               enable row level security;
alter table public.order_requests           enable row level security;
alter table public.order_request_items      enable row level security;
alter table public.order_request_events     enable row level security;

alter table public.inquiries                enable row level security;
alter table public.inquiry_replies          enable row level security;
alter table public.sell_trade_requests      enable row level security;
alter table public.sell_trade_images        enable row level security;
alter table public.sell_trade_offers        enable row level security;
alter table public.sourcing_requests        enable row level security;
alter table public.sourcing_updates         enable row level security;
alter table public.repair_requests          enable row level security;
alter table public.repair_updates           enable row level security;
alter table public.appointments             enable row level security;
alter table public.contact_submissions      enable row level security;
alter table public.product_questions        enable row level security;
alter table public.messages                 enable row level security;
alter table public.notifications            enable row level security;

alter table public.pages                    enable row level security;
alter table public.faqs                     enable row level security;
alter table public.announcements            enable row level security;
alter table public.testimonials             enable row level security;
alter table public.navigation_items         enable row level security;
alter table public.homepage_sections        enable row level security;
alter table public.media                    enable row level security;
alter table public.site_settings            enable row level security;
alter table public.newsletter_subscribers   enable row level security;
alter table public.wishlists                enable row level security;
alter table public.wishlist_items           enable row level security;
alter table public.admin_audit_logs         enable row level security;
alter table public.rate_limit_counters      enable row level security;

-- =============================================================================
-- A. PUBLIC CATALOGUE — readable by anyone, but only when published/active
--
-- Every policy below is restricted to rows that are genuinely meant to be
-- public. A draft, archived or inactive row is invisible to an anonymous
-- visitor, which is what stops an unpublished product leaking through the API.
-- =============================================================================

create policy brands_public_read on public.brands
  for select to anon, authenticated
  using (is_active);

create policy models_public_read on public.models
  for select to anon, authenticated
  using (is_active);

-- The publication gate for the whole storefront.
create policy products_public_read on public.products
  for select to anon, authenticated
  using (status = 'published');

create policy product_images_public_read on public.product_images
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
       where p.id = product_images.product_id
         and p.status = 'published'
    )
  );

create policy product_specs_public_read on public.product_specs
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.products p
       where p.id = product_specs.product_id
         and p.status = 'published'
    )
  );

create policy collections_public_read on public.collections
  for select to anon, authenticated
  using (is_active);

create policy collection_products_public_read on public.collection_products
  for select to anon, authenticated
  using (
    exists (
      select 1
        from public.products p
        join public.collections c on c.id = collection_products.collection_id
       where p.id = collection_products.product_id
         and p.status = 'published'
         and c.is_active
    )
  );

-- Only ENABLED options are visible. A disabled method is not merely hidden in
-- the UI; it cannot be read from the API either.
create policy payment_methods_public_read on public.payment_methods
  for select to anon, authenticated
  using (is_enabled);

create policy delivery_options_public_read on public.delivery_options
  for select to anon, authenticated
  using (is_enabled);

-- =============================================================================
-- B. PUBLIC CONTENT — published rows only
-- =============================================================================

create policy pages_public_read on public.pages
  for select to anon, authenticated
  using (status = 'published');

create policy faqs_public_read on public.faqs
  for select to anon, authenticated
  using (is_published);

-- An announcement must also be inside its scheduling window, so an expired
-- banner cannot keep showing because nobody remembered to switch it off.
create policy announcements_public_read on public.announcements
  for select to anon, authenticated
  using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

create policy testimonials_public_read on public.testimonials
  for select to anon, authenticated
  using (is_published);

create policy navigation_items_public_read on public.navigation_items
  for select to anon, authenticated
  using (is_active);

create policy homepage_sections_public_read on public.homepage_sections
  for select to anon, authenticated
  using (is_active);

-- Public business information only. The table holds no secrets, and this row is
-- what the footer and the Organization structured data are built from.
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated
  using (true);

-- Only questions a staff member has answered AND chosen to publish.
create policy product_questions_public_read on public.product_questions
  for select to anon, authenticated
  using (is_published and answer is not null);

-- =============================================================================
-- C. CUSTOMER-OWNED DATA
-- =============================================================================

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.has_permission('customers.read'));

-- The update policy names no columns, because it does not need to: `profiles`
-- has no `role` column. The WITH CHECK re-states ownership so a row cannot be
-- reassigned to another user.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy addresses_select_own on public.addresses
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('customers.read'));

create policy addresses_insert_own on public.addresses
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy addresses_update_own on public.addresses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy addresses_delete_own on public.addresses
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- A user may see which roles they hold (harmless, and useful for rendering),
-- but nothing here is used as proof of authorisation: RLS reads `user_roles`
-- through SECURITY DEFINER functions, and writes are admin-only.
create policy user_roles_select_own on public.user_roles
  for select to authenticated
  using (user_id = (select auth.uid()) or public.has_permission('customers.read'));

create policy user_roles_admin_write on public.user_roles
  for all to authenticated
  using (public.has_role('SUPER_ADMIN'))
  with check (public.has_role('SUPER_ADMIN'));

-- -----------------------------------------------------------------------------
-- Wishlists
-- -----------------------------------------------------------------------------

create policy wishlists_select_own on public.wishlists
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy wishlists_insert_own on public.wishlists
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy wishlists_update_own on public.wishlists
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy wishlists_delete_own on public.wishlists
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy wishlist_items_select_own on public.wishlist_items
  for select to authenticated
  using (
    exists (
      select 1 from public.wishlists w
       where w.id = wishlist_items.wishlist_id
         and w.user_id = (select auth.uid())
    )
  );

create policy wishlist_items_insert_own on public.wishlist_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.wishlists w
       where w.id = wishlist_items.wishlist_id
         and w.user_id = (select auth.uid())
    )
  );

create policy wishlist_items_delete_own on public.wishlist_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.wishlists w
       where w.id = wishlist_items.wishlist_id
         and w.user_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- Carts
--
-- Signed-in carts are owner-scoped. GUEST carts have no policy at all: an
-- anonymous caller cannot read or write `carts` directly, because there is no
-- way to prove ownership of a guest cart from inside a policy. Guest carts are
-- handled exclusively server-side with the service-role client, where the
-- session token lives in an httpOnly cookie and never appears in a query the
-- browser can influence.
-- -----------------------------------------------------------------------------

create policy carts_select_own on public.carts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy carts_insert_own on public.carts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy carts_update_own on public.carts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy carts_delete_own on public.carts
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy cart_items_select_own on public.cart_items
  for select to authenticated
  using (
    exists (
      select 1 from public.carts c
       where c.id = cart_items.cart_id
         and c.user_id = (select auth.uid())
    )
  );

create policy cart_items_write_own on public.cart_items
  for all to authenticated
  using (
    exists (
      select 1 from public.carts c
       where c.id = cart_items.cart_id
         and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.carts c
       where c.id = cart_items.cart_id
         and c.user_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- Order requests
--
-- A customer reads only their own. There is NO insert policy for clients: order
-- requests are created through `submit_order_request()`, a SECURITY DEFINER
-- function that re-prices every line from the database. Allowing a direct insert
-- would let a caller choose their own totals.
--
-- There is also no update policy for customers. A customer cannot change a
-- status, a total or an admin note on their own request.
-- -----------------------------------------------------------------------------

create policy order_requests_select_own on public.order_requests
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_permission('orders.read')
  );

create policy order_request_items_select_own on public.order_request_items
  for select to authenticated
  using (
    exists (
      select 1 from public.order_requests o
       where o.id = order_request_items.order_request_id
         and (o.user_id = (select auth.uid()) or public.has_permission('orders.read'))
    )
  );

create policy order_request_events_select_own on public.order_request_events
  for select to authenticated
  using (
    exists (
      select 1 from public.order_requests o
       where o.id = order_request_events.order_request_id
         and (o.user_id = (select auth.uid()) or public.has_permission('orders.read'))
    )
  );

-- Staff may move an order through its lifecycle. `orders.write` is required, and
-- the WITH CHECK re-tests it so a row cannot be moved by a caller who only had
-- read permission.
create policy order_requests_staff_update on public.order_requests
  for update to authenticated
  using (public.has_permission('orders.write'))
  with check (public.has_permission('orders.write'));

-- -----------------------------------------------------------------------------
-- Service requests
--
-- Customers read their own submissions. They never see another customer's, and
-- they never see internal notes.
-- -----------------------------------------------------------------------------

create policy inquiries_select_own on public.inquiries
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_permission('inquiries.read')
  );

create policy inquiries_staff_update on public.inquiries
  for update to authenticated
  using (public.has_permission('inquiries.write'))
  with check (public.has_permission('inquiries.write'));

create policy inquiry_replies_select_own on public.inquiry_replies
  for select to authenticated
  using (
    exists (
      select 1 from public.inquiries i
       where i.id = inquiry_replies.inquiry_id
         and (i.user_id = (select auth.uid()) or public.has_permission('inquiries.read'))
    )
    -- Internal notes are staff-only, even on your own inquiry.
    and (not is_internal or public.has_permission('inquiries.read'))
  );

create policy inquiry_replies_staff_write on public.inquiry_replies
  for insert to authenticated
  with check (public.has_permission('inquiries.write'));

create policy sell_trade_requests_select_own on public.sell_trade_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.inquiries i
       where i.id = sell_trade_requests.inquiry_id
         and (i.user_id = (select auth.uid()) or public.has_permission('inquiries.read'))
    )
  );

create policy sell_trade_requests_staff_update on public.sell_trade_requests
  for update to authenticated
  using (public.has_permission('inquiries.write'))
  with check (public.has_permission('inquiries.write'));

-- Customer uploads are private to the customer and to staff. There is no public
-- policy, so a photo of someone's watch cannot be enumerated from the API.
create policy sell_trade_images_select_own on public.sell_trade_images
  for select to authenticated
  using (
    exists (
      select 1
        from public.sell_trade_requests str
        join public.inquiries i on i.id = str.inquiry_id
       where str.id = sell_trade_images.sell_trade_request_id
         and (i.user_id = (select auth.uid()) or public.has_permission('inquiries.read'))
    )
  );

create policy sell_trade_offers_select_own on public.sell_trade_offers
  for select to authenticated
  using (
    exists (
      select 1
        from public.sell_trade_requests str
        join public.inquiries i on i.id = str.inquiry_id
       where str.id = sell_trade_offers.sell_trade_request_id
         and (i.user_id = (select auth.uid()) or public.has_permission('inquiries.read'))
    )
  );

create policy sell_trade_offers_staff_write on public.sell_trade_offers
  for insert to authenticated
  with check (public.has_permission('inquiries.write'));

create policy sourcing_requests_select_own on public.sourcing_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.inquiries i
       where i.id = sourcing_requests.inquiry_id
         and (i.user_id = (select auth.uid()) or public.has_permission('inquiries.read'))
    )
  );

create policy sourcing_requests_staff_update on public.sourcing_requests
  for update to authenticated
  using (public.has_permission('inquiries.write'))
  with check (public.has_permission('inquiries.write'));

-- A customer sees only updates flagged customer-visible. Internal sourcing notes
-- stay internal.
create policy sourcing_updates_select_own on public.sourcing_updates
  for select to authenticated
  using (
    exists (
      select 1
        from public.sourcing_requests sr
        join public.inquiries i on i.id = sr.inquiry_id
       where sr.id = sourcing_updates.sourcing_request_id
         and (i.user_id = (select auth.uid()) or public.has_permission('inquiries.read'))
    )
    and (is_customer_visible or public.has_permission('inquiries.read'))
  );

create policy sourcing_updates_staff_write on public.sourcing_updates
  for insert to authenticated
  with check (public.has_permission('inquiries.write'));

create policy repair_requests_select_own on public.repair_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.inquiries i
       where i.id = repair_requests.inquiry_id
         and (i.user_id = (select auth.uid()) or public.has_permission('inquiries.read'))
    )
  );

create policy repair_requests_staff_update on public.repair_requests
  for update to authenticated
  using (public.has_permission('inquiries.write'))
  with check (public.has_permission('inquiries.write'));

create policy repair_updates_select_own on public.repair_updates
  for select to authenticated
  using (
    exists (
      select 1
        from public.repair_requests rr
        join public.inquiries i on i.id = rr.inquiry_id
       where rr.id = repair_updates.repair_request_id
         and (i.user_id = (select auth.uid()) or public.has_permission('inquiries.read'))
    )
    and (is_customer_visible or public.has_permission('inquiries.read'))
  );

create policy repair_updates_staff_write on public.repair_updates
  for insert to authenticated
  with check (public.has_permission('inquiries.write'));

create policy appointments_select_own on public.appointments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.has_permission('inquiries.read')
  );

create policy appointments_staff_update on public.appointments
  for update to authenticated
  using (public.has_permission('inquiries.write'))
  with check (public.has_permission('inquiries.write'));

-- Contact submissions and product questions are write-only from the public
-- side. An anonymous caller may submit, but may never read back. Reads are
-- staff-only, so a submitted email address cannot be harvested.
create policy contact_submissions_staff_read on public.contact_submissions
  for select to authenticated
  using (public.has_permission('inquiries.read'));

create policy contact_submissions_staff_update on public.contact_submissions
  for update to authenticated
  using (public.has_permission('inquiries.write'))
  with check (public.has_permission('inquiries.write'));

create policy product_questions_staff_read on public.product_questions
  for select to authenticated
  using (public.has_permission('inquiries.read'));

create policy product_questions_staff_update on public.product_questions
  for update to authenticated
  using (public.has_permission('inquiries.write'))
  with check (public.has_permission('inquiries.write'));

-- Internal messaging and notifications are private by definition.
create policy messages_staff_only on public.messages
  for select to authenticated
  using (public.is_staff() and (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()) or public.is_admin()));

create policy messages_staff_insert on public.messages
  for insert to authenticated
  with check (public.is_staff() and sender_id = (select auth.uid()));

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- =============================================================================
-- D. INVENTORY AND THE STOCK LEDGER
--
-- Nothing here is publicly readable. Stock levels are internal: exposing them
-- would let a competitor enumerate the catalogue's true availability.
-- =============================================================================

create policy inventory_staff_read on public.inventory
  for select to authenticated
  using (public.has_permission('inventory.read'));

create policy inventory_staff_write on public.inventory
  for all to authenticated
  using (public.has_permission('inventory.write'))
  with check (public.has_permission('inventory.write'));

create policy inventory_transactions_staff_read on public.inventory_transactions
  for select to authenticated
  using (public.has_permission('inventory.read'));

-- The ledger is append-only: no update or delete policy exists for anyone, so a
-- recorded movement cannot be rewritten.
create policy inventory_transactions_staff_insert on public.inventory_transactions
  for insert to authenticated
  with check (public.has_permission('inventory.write'));

create policy inventory_reservations_staff_read on public.inventory_reservations
  for select to authenticated
  using (public.has_permission('inventory.read') or public.has_permission('orders.read'));

create policy inventory_reservations_staff_write on public.inventory_reservations
  for all to authenticated
  using (public.has_permission('inventory.write'))
  with check (public.has_permission('inventory.write'));

-- =============================================================================
-- E. STAFF-ONLY CONTENT MANAGEMENT
--
-- Catalogue and content writes are granted per permission, not per role, so the
-- mapping in role_permissions() is the single place access is decided.
-- =============================================================================

create policy brands_staff_write on public.brands
  for all to authenticated
  using (public.has_permission('catalog.write'))
  with check (public.has_permission('catalog.write'));

create policy models_staff_write on public.models
  for all to authenticated
  using (public.has_permission('catalog.write'))
  with check (public.has_permission('catalog.write'));

create policy products_staff_write on public.products
  for all to authenticated
  using (public.has_permission('catalog.write'))
  with check (public.has_permission('catalog.write'));

create policy product_images_staff_write on public.product_images
  for all to authenticated
  using (public.has_permission('catalog.write'))
  with check (public.has_permission('catalog.write'));

create policy product_specs_staff_write on public.product_specs
  for all to authenticated
  using (public.has_permission('catalog.write'))
  with check (public.has_permission('catalog.write'));

create policy collections_staff_write on public.collections
  for all to authenticated
  using (public.has_permission('catalog.write'))
  with check (public.has_permission('catalog.write'));

create policy collection_products_staff_write on public.collection_products
  for all to authenticated
  using (public.has_permission('catalog.write'))
  with check (public.has_permission('catalog.write'));

create policy pages_staff_write on public.pages
  for all to authenticated
  using (public.has_permission('content.write'))
  with check (public.has_permission('content.write'));

create policy faqs_staff_write on public.faqs
  for all to authenticated
  using (public.has_permission('content.write'))
  with check (public.has_permission('content.write'));

create policy announcements_staff_write on public.announcements
  for all to authenticated
  using (public.has_permission('content.write'))
  with check (public.has_permission('content.write'));

create policy testimonials_staff_write on public.testimonials
  for all to authenticated
  using (public.has_permission('content.write'))
  with check (public.has_permission('content.write'));

create policy navigation_items_staff_write on public.navigation_items
  for all to authenticated
  using (public.has_permission('content.write'))
  with check (public.has_permission('content.write'));

create policy homepage_sections_staff_write on public.homepage_sections
  for all to authenticated
  using (public.has_permission('content.write'))
  with check (public.has_permission('content.write'));

create policy media_staff_read on public.media
  for select to authenticated
  using (public.is_staff());

create policy media_staff_write on public.media
  for all to authenticated
  using (public.has_permission('content.write') or public.has_permission('catalog.write'))
  with check (public.has_permission('content.write') or public.has_permission('catalog.write'));

-- Settings are public to READ (the footer needs them) but admin-only to write.
create policy site_settings_admin_write on public.site_settings
  for update to authenticated
  using (public.has_permission('settings.write'))
  with check (public.has_permission('settings.write'));

create policy payment_methods_staff_write on public.payment_methods
  for all to authenticated
  using (public.has_permission('settings.write'))
  with check (public.has_permission('settings.write'));

create policy delivery_options_staff_write on public.delivery_options
  for all to authenticated
  using (public.has_permission('settings.write'))
  with check (public.has_permission('settings.write'));

-- =============================================================================
-- F. NEWSLETTER, AUDIT LOG AND RATE LIMITS
-- =============================================================================

-- No select policy for anyone except staff with customers.read: a subscriber
-- list must never be readable from the client.
create policy newsletter_subscribers_staff_read on public.newsletter_subscribers
  for select to authenticated
  using (public.has_permission('customers.read'));

create policy newsletter_subscribers_staff_write on public.newsletter_subscribers
  for all to authenticated
  using (public.has_permission('customers.read'))
  with check (public.has_permission('customers.read'));

-- Audit logs are readable by admins and SUPER_ADMINs, and writable by nobody
-- through RLS. There is deliberately no insert, update or delete policy: rows
-- are written by SECURITY DEFINER triggers, so an administrator cannot forge,
-- alter or erase an audit entry.
create policy admin_audit_logs_admin_read on public.admin_audit_logs
  for select to authenticated
  using (public.has_permission('audit.read'));

-- Rate-limit counters are internal. No client access at all; the limiter runs
-- server-side with the service-role client.
-- (No policies are created, which denies every non-service-role caller.)

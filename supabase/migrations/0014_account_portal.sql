-- =============================================================================
-- 0014 — Customer account portal: column-level read surface
--
-- Design note: RLS restricts ROWS. It says nothing about COLUMNS.
--
-- Phase 6 established this for `products` (0011): a correct row-scoped policy on
-- a table with a table-level `select` grant still lets `anon` read every column
-- of the rows it can see. The same trap applies to every customer-readable table
-- the account portal now reads, and Phase 9 is the first time a customer reads
-- them through the API. This migration closes it.
--
-- -----------------------------------------------------------------------------
-- WHAT WAS ACTUALLY LEAKING
-- -----------------------------------------------------------------------------
--
-- Verified against a real database, as the authenticated owner of the row, not
-- inferred from the policy text:
--
--   order_requests.admin_note           the administrator's private note about
--                                       the customer ("difficult negotiator,
--                                       do not discount below 8%")
--   order_requests.access_token_hash    the guest capability hash
--   order_requests.ip_hash              spam-mitigation evidence
--   order_requests.user_agent           spam-mitigation evidence
--   order_requests.idempotency_key      form-replay key
--   inquiries.ip_hash / user_agent      spam-mitigation evidence
--   appointments.staff_note             the staff note on the customer's own
--                                       appointment
--
-- Every one of those is a column the row policy correctly restricted to the
-- customer's own row, and every one of them is a column the customer has no
-- business reading. The Phase 9 brief names this directly: "avoid displaying
-- sensitive internal admin notes".
--
-- -----------------------------------------------------------------------------
-- WHY COLUMN GRANTS RATHER THAN A POLICY
-- -----------------------------------------------------------------------------
--
-- A policy cannot hide a column; it selects rows. `select *` would still return
-- the note. Revoking the table grant and re-granting the customer-facing columns
-- makes the sensitive ones hard-denied (SQLSTATE 42501) rather than filtered to
-- an empty value, which is the behaviour 0011 chose for `products` and the
-- behaviour the admin screens rely on to notice a mistake.
--
-- `service_role` is untouched throughout: it bypasses RLS and the admin screens
-- read the full row.
--
-- The standing obligation from AGENTS.md applies unchanged: a new column on any
-- of these tables is customer-readable by default until it is either added to a
-- grant list below or deliberately withheld.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. order_requests
--
-- The customer's own order request. They need to see what they asked for, what
-- it costs, how it is being fulfilled and where it has got to. They do not need
-- the administrator's note, the guest capability hash, or the spam telemetry.
--
-- `settled_offline_by` is withheld too: it is the id of the staff member who
-- settled payment, which is internal. `settled_offline_at` is kept, because
-- "payment received" is a fact about the customer's own order.
--
-- `discount_code` is kept: the customer typed it. `discount_cents` is the
-- server-computed amount they were given, so it is theirs to see.
-- -----------------------------------------------------------------------------

revoke select on public.order_requests from anon, authenticated;

grant select (
  id, reference, user_id,
  customer_name, customer_email, customer_phone,
  fulfilment_type, delivery_address, pickup_location,
  payment_method_code, customer_note,
  subtotal_cents, delivery_fee_cents, discount_cents, total_cents, currency,
  discount_code, terms_acknowledged_at,
  status, settled_offline_at,
  created_at, updated_at
) on public.order_requests to authenticated;

-- The guest confirmation page reads through `read_order_request`, a
-- SECURITY DEFINER function that returns a hand-built jsonb document and never
-- includes `admin_note`. `anon` therefore needs no table grant at all, and
-- removing it means an anonymous caller cannot reach the table even if a future
-- policy mistake made a row visible.

-- -----------------------------------------------------------------------------
-- 2. order_request_items
--
-- The line-item snapshots the customer is shown. Nothing here is internal, but
-- the grant is stated explicitly so the read surface is a decision rather than a
-- default, and so a column added later is not silently exposed.
-- -----------------------------------------------------------------------------

revoke select on public.order_request_items from anon, authenticated;

grant select (
  id, order_request_id, product_id,
  product_title_snapshot, sku_snapshot, slug_snapshot, image_url_snapshot,
  unit_price_cents, quantity, line_total_cents,
  created_at
) on public.order_request_items to authenticated;

-- -----------------------------------------------------------------------------
-- 3. order_request_events
--
-- The status timeline. `actor_id` and `actor_label` name the staff member who
-- moved the order, which is internal; the customer sees that the status changed,
-- when, and the customer-facing note. Withheld rather than filtered, so the
-- account timeline cannot display an operator's identity by accident.
-- -----------------------------------------------------------------------------

revoke select on public.order_request_events from anon, authenticated;

grant select (
  id, order_request_id, from_status, to_status, note, created_at
) on public.order_request_events to authenticated;

-- -----------------------------------------------------------------------------
-- 4. inquiries and inquiry_replies
--
-- `ip_hash` and `user_agent` are spam-mitigation evidence and are withheld.
-- `assigned_to` names the staff member handling the enquiry and is withheld.
--
-- `inquiry_replies.is_internal` is retained: the existing policy already filters
-- internal replies out of the customer's view, and the account portal re-states
-- that filter in its own query. Keeping the column readable lets the portal
-- assert the filter rather than depend on the policy alone.
-- -----------------------------------------------------------------------------

revoke select on public.inquiries from anon, authenticated;

grant select (
  id, type, status, user_id, product_id,
  name, email, phone, message, reference,
  created_at, updated_at
) on public.inquiries to authenticated;

revoke select on public.inquiry_replies from anon, authenticated;

grant select (
  id, inquiry_id, author_id, body, is_internal, sent_at, created_at
) on public.inquiry_replies to authenticated;

-- -----------------------------------------------------------------------------
-- 5. appointments
--
-- `staff_note` is the note the team keeps about the customer's own appointment
-- and is withheld. `assigned_to` is withheld for the same reason as above.
-- `customer_note` is kept: the customer wrote it.
-- -----------------------------------------------------------------------------

revoke select on public.appointments from anon, authenticated;

grant select (
  id, user_id, name, email, phone, purpose,
  requested_at, scheduled_at, status, location, customer_note,
  created_at, updated_at
) on public.appointments to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Service-request detail tables
--
-- sell_trade_offers, sourcing_requests and repair_requests carry no internal
-- column today. They are granted explicitly so that "the customer can read this
-- table" is a recorded decision, and so a column added in a later phase is not
-- exposed by inheriting a table-level grant.
--
-- The `_updates` tables already separate customer-visible from internal rows
-- with `is_customer_visible`; the flag is kept readable so the portal can assert
-- the filter itself.
-- -----------------------------------------------------------------------------

revoke select on public.sell_trade_requests from anon, authenticated;
grant select (
  id, inquiry_id, brand_name, model_name, reference_number, production_year,
  condition_notes, has_box, has_papers, asking_price_cents, currency,
  created_at, updated_at
) on public.sell_trade_requests to authenticated;

revoke select on public.sell_trade_offers from anon, authenticated;
grant select (
  id, sell_trade_request_id, amount_cents, currency, offered_by, note, created_at
) on public.sell_trade_offers to authenticated;

revoke select on public.sourcing_requests from anon, authenticated;
grant select (
  id, inquiry_id, brand_name, model_name, reference_number, dial_color,
  case_size_mm, bracelet_type, min_year, max_year, max_budget_cents, currency,
  created_at, updated_at
) on public.sourcing_requests to authenticated;

revoke select on public.sourcing_updates from anon, authenticated;
grant select (
  id, sourcing_request_id, body, is_customer_visible, created_at
) on public.sourcing_updates to authenticated;

revoke select on public.repair_requests from anon, authenticated;
grant select (
  id, inquiry_id, brand_name, model_name, reference_number, service_type,
  issue_summary, is_watch_insured, preferred_contact_method,
  created_at, updated_at
) on public.repair_requests to authenticated;

revoke select on public.repair_updates from anon, authenticated;
grant select (
  id, repair_request_id, body, is_customer_visible, created_at
) on public.repair_updates to authenticated;

-- -----------------------------------------------------------------------------
-- 7. profiles and addresses
--
-- Both are already row-scoped to the owner and carry no internal column, but the
-- grant is stated explicitly for the same reason as the tables above.
-- `profiles` has no role column by design (0002), so there is nothing here that
-- could escalate privilege even if the row were writable.
-- -----------------------------------------------------------------------------

revoke select on public.profiles from anon, authenticated;
grant select (
  id, email, full_name, phone, avatar_url, marketing_opt_in, created_at, updated_at
) on public.profiles to authenticated;

revoke select on public.addresses from anon, authenticated;
grant select (
  id, user_id, label, recipient_name, phone, line1, line2, city, region,
  postal_code, country_code, is_default, created_at, updated_at
) on public.addresses to authenticated;

-- -----------------------------------------------------------------------------
-- 8. notifications
--
-- The customer's own in-app notifications. `user_id` is the owner and is kept so
-- the portal can confirm ownership in its own query rather than relying on the
-- policy alone.
-- -----------------------------------------------------------------------------

revoke select on public.notifications from anon, authenticated;
grant select (
  id, user_id, kind, title, body, link_url, is_read, read_at, created_at
) on public.notifications to authenticated;

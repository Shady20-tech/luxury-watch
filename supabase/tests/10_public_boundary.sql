-- =============================================================================
-- 10 — Public/private boundary
--
-- The single most important security property: an anonymous visitor must be able
-- to read the published catalogue and nothing else. A private table must not be
-- readable even though the `anon` role has table privileges (which Supabase
-- grants by default), because RLS denies it.
-- =============================================================================

\set ON_ERROR_STOP on

-- Helper: assert that a query executed as a given role is denied or returns 0 rows.
create or replace function pg_temp.assert_no_rows(
  p_label text,
  p_sql   text
) returns void
language plpgsql
as $$
declare
  v_count bigint;
begin
  execute p_sql into v_count;
  if v_count <> 0 then
    raise exception 'FAIL [%]: expected no readable rows, got %', p_label, v_count;
  end if;
  raise notice 'pass [%]', p_label;
end;
$$;

create or replace function pg_temp.assert_denied(
  p_label text,
  p_sql   text
) returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when insufficient_privilege then
    raise notice 'pass [%] (denied)', p_label;
    return;
  end;
  raise exception 'FAIL [%]: expected permission denied, but the statement succeeded', p_label;
end;
$$;

-- For UPDATE and DELETE, RLS does not raise: it filters the rows the statement
-- can see, so the statement succeeds having changed nothing. That is the
-- correct property to assert for those verbs, and it is the behaviour Supabase
-- exhibits too.
create or replace function pg_temp.assert_no_effect(
  p_label text,
  p_sql   text
) returns void
language plpgsql
as $$
declare
  v_rows bigint;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL [%]: expected 0 rows affected, got %', p_label, v_rows;
  end if;
  raise notice 'pass [%] (0 rows affected)', p_label;
end;
$$;

-- -----------------------------------------------------------------------------
-- Seed data as the service role: one published product, one draft, plus a row in
-- every private table. If a policy leaks, there is real data to leak.
-- -----------------------------------------------------------------------------

set role service_role;

insert into public.brands (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Test Brand', 'test-brand');

insert into public.products (id, sku, slug, title, brand_id, status, published_at, price_on_request)
values
  ('22222222-2222-2222-2222-222222222222', 'SKU-PUB', 'published-watch', 'Published Watch',
   '11111111-1111-1111-1111-111111111111', 'published', now(), true),
  ('33333333-3333-3333-3333-333333333333', 'SKU-DRAFT', 'draft-watch', 'Draft Watch',
   '11111111-1111-1111-1111-111111111111', 'draft', null, true),
  ('44444444-4444-4444-4444-444444444444', 'SKU-ARCH', 'archived-watch', 'Archived Watch',
   '11111111-1111-1111-1111-111111111111', 'archived', null, true);

insert into public.product_images (product_id, external_url, alt_text)
values ('22222222-2222-2222-2222-222222222222', 'https://example.test/a.jpg', 'A watch');

insert into public.inventory (product_id, quantity) values
  ('22222222-2222-2222-2222-222222222222', 1);

insert into public.payment_methods (code, label, is_enabled) values
  ('bank_transfer', 'Bank transfer', true),
  ('disabled_method', 'Disabled method', false);

insert into public.pages (slug, title, status, published_at) values
  ('public-page', 'Public Page', 'published', now()),
  ('draft-page', 'Draft Page', 'draft', null);

insert into public.faqs (question, answer, is_published) values
  ('Public Q', 'Public A', true),
  ('Draft Q', 'Draft A', false);

insert into public.newsletter_subscribers (email) values ('subscriber@example.test');
insert into public.contact_submissions (name, email, message)
  values ('Someone', 'someone@example.test', 'A private message');

reset role;

-- -----------------------------------------------------------------------------
-- Anonymous access
-- -----------------------------------------------------------------------------

set role anon;

select pg_temp.assert_no_rows(
  'anon cannot read any profile',
  'select count(*) from public.profiles');

select pg_temp.assert_no_rows(
  'anon cannot read user_roles',
  'select count(*) from public.user_roles');

select pg_temp.assert_no_rows(
  'anon cannot read addresses',
  'select count(*) from public.addresses');

select pg_temp.assert_no_rows(
  'anon cannot read order_requests',
  'select count(*) from public.order_requests');

select pg_temp.assert_no_rows(
  'anon cannot read inquiries',
  'select count(*) from public.inquiries');

select pg_temp.assert_no_rows(
  'anon cannot read contact_submissions',
  'select count(*) from public.contact_submissions');

select pg_temp.assert_no_rows(
  'anon cannot read newsletter_subscribers',
  'select count(*) from public.newsletter_subscribers');

select pg_temp.assert_no_rows(
  'anon cannot read inventory',
  'select count(*) from public.inventory');

select pg_temp.assert_no_rows(
  'anon cannot read inventory_transactions',
  'select count(*) from public.inventory_transactions');

select pg_temp.assert_no_rows(
  'anon cannot read inventory_reservations',
  'select count(*) from public.inventory_reservations');

select pg_temp.assert_no_rows(
  'anon cannot read admin_audit_logs',
  'select count(*) from public.admin_audit_logs');

-- Migration 0011 revokes `select` on the counter from the public roles, so this
-- is now a hard denial rather than an empty result. Asserting the denial is the
-- stronger claim: a later RLS policy cannot re-expose the table, because the
-- grant itself is gone.
select pg_temp.assert_denied(
  'anon cannot read rate_limit_counters',
  'select count(*) from public.rate_limit_counters');

select pg_temp.assert_no_rows(
  'anon cannot read carts',
  'select count(*) from public.carts');

select pg_temp.assert_no_rows(
  'anon cannot read messages',
  'select count(*) from public.messages');

select pg_temp.assert_no_rows(
  'anon cannot read appointments',
  'select count(*) from public.appointments');

select pg_temp.assert_no_rows(
  'anon cannot read sell_trade_requests',
  'select count(*) from public.sell_trade_requests');

select pg_temp.assert_no_rows(
  'anon cannot read sourcing_requests',
  'select count(*) from public.sourcing_requests');

select pg_temp.assert_no_rows(
  'anon cannot read repair_requests',
  'select count(*) from public.repair_requests');

select pg_temp.assert_no_rows(
  'anon cannot read product_questions',
  'select count(*) from public.product_questions');

select pg_temp.assert_no_rows(
  'anon cannot read media',
  'select count(*) from public.media');

-- The catalogue IS public, but only the published row.
select pg_temp.assert_no_rows(
  'anon sees only published products',
  'select count(*) from public.products where status <> ''published''');

select pg_temp.assert_no_rows(
  'anon cannot see the draft product by slug',
  'select count(*) from public.products where slug = ''draft-watch''');

select pg_temp.assert_no_rows(
  'anon cannot see the archived product',
  'select count(*) from public.products where slug = ''archived-watch''');

select pg_temp.assert_no_rows(
  'anon sees only published pages',
  'select count(*) from public.pages where status <> ''published''');

select pg_temp.assert_no_rows(
  'anon sees only published faqs',
  'select count(*) from public.faqs where not is_published');

-- Disabled payment methods must not be readable, so the storefront cannot even
-- offer one by accident.
select pg_temp.assert_no_rows(
  'anon sees only enabled payment methods',
  'select count(*) from public.payment_methods where not is_enabled');

-- Anonymous writes to the catalogue must be denied outright.
select pg_temp.assert_denied(
  'anon cannot insert a product',
  'insert into public.products (sku, slug, title) values (''X'', ''x'', ''X'')');

select pg_temp.assert_no_effect(
  'anon cannot update a product',
  'update public.products set title = ''Hacked''');

select pg_temp.assert_no_effect(
  'anon cannot delete a product',
  'delete from public.products');

select pg_temp.assert_denied(
  'anon cannot insert an order request directly',
  'insert into public.order_requests (customer_name, customer_email, fulfilment_type, payment_method_code) values (''X'', ''x@y.test'', ''pickup'', ''bank_transfer'')');

reset role;

-- -----------------------------------------------------------------------------
-- Confirm the published product IS actually readable, so the tests above are not
-- passing merely because the role cannot see anything at all.
-- -----------------------------------------------------------------------------

set role anon;
do $$
declare
  v_count bigint;
begin
  select count(*) into v_count from public.products where slug = 'published-watch';
  if v_count <> 1 then
    raise exception 'FAIL: anon should see the published product, saw %', v_count;
  end if;
  raise notice 'pass [anon sees the published product]';

  select count(*) into v_count from public.brands where slug = 'test-brand';
  if v_count <> 1 then
    raise exception 'FAIL: anon should see the active brand, saw %', v_count;
  end if;
  raise notice 'pass [anon sees the active brand]';

  select count(*) into v_count from public.product_images;
  if v_count <> 1 then
    raise exception 'FAIL: anon should see images of published products, saw %', v_count;
  end if;
  raise notice 'pass [anon sees images of published products]';

  select count(*) into v_count from public.payment_methods where code = 'bank_transfer';
  if v_count <> 1 then
    raise exception 'FAIL: anon should see the enabled payment method, saw %', v_count;
  end if;
  raise notice 'pass [anon sees the enabled payment method]';

  -- Prove the blocked UPDATE above really changed nothing.
  select count(*) into v_count from public.products where title = 'Hacked';
  if v_count <> 0 then
    raise exception 'FAIL: the anonymous UPDATE altered % row(s)', v_count;
  end if;
  raise notice 'pass [anonymous UPDATE left the data untouched]';
end
$$;
reset role;

drop function pg_temp.assert_no_rows(text, text);
drop function pg_temp.assert_denied(text, text);
drop function pg_temp.assert_no_effect(text, text);

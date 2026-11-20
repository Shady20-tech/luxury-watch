-- =============================================================================
-- 64 — In-app notifications and the mail identity
--
-- -----------------------------------------------------------------------------
-- WHAT IS BEING PROVEN
-- -----------------------------------------------------------------------------
--
-- Two tables gained a write path that no policy can express, and both are the
-- kind of thing that looks correct in SQL and leaks in practice:
--
--   notifications  `notify_user` is SECURITY DEFINER and takes a recipient id.
--                  It is only safe if `anon` and `authenticated` cannot execute
--                  it — otherwise any customer can post a notification to any
--                  other customer, with our name on it. The grant is the whole
--                  security model here, so it is asserted, not assumed.
--
--   email_settings No public grant at all. The sending address is an environment
--                  variable precisely so this table can never redirect mail from
--                  a domain the store does not own; the table is asserted to be
--                  unreachable by `anon` and by a signed-in customer.
--
-- -----------------------------------------------------------------------------
-- THE SHAPE OF A DEDUPE TEST
-- -----------------------------------------------------------------------------
--
-- AGENTS.md records the lesson from the service-reference collision: one call in
-- one second is unique by construction, so a single-call test can never see a
-- collision. The dedupe assertions below therefore call the function twice with
-- the same key and assert that the *second* returns NULL and that the row count
-- is one. A single insert would pass against a table with no unique index at all.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.assert_raises(
  p_label    text,
  p_sql      text,
  p_sqlstate text,
  p_like     text default null
) returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception
    when others then
      if sqlstate <> p_sqlstate then
        raise exception 'FAIL [%]: expected SQLSTATE %, got % (%)',
          p_label, p_sqlstate, sqlstate, sqlerrm;
      end if;
      if p_like is not null and sqlerrm not like p_like then
        raise exception 'FAIL [%]: expected message like %, got %',
          p_label, p_like, sqlerrm;
      end if;
      raise notice 'pass [%] (%)', p_label, sqlerrm;
      return;
  end;
  raise exception 'FAIL [%]: expected an exception, but the statement succeeded', p_label;
end;
$$;

create or replace function pg_temp.assert_eq(
  p_label    text,
  p_sql      text,
  p_expected text
) returns void
language plpgsql
as $$
declare
  v_actual text;
begin
  execute p_sql into v_actual;
  if coalesce(v_actual, '<null>') <> coalesce(p_expected, '<null>') then
    raise exception 'FAIL [%]: expected %, got %', p_label, p_expected, v_actual;
  end if;
  raise notice 'pass [%]', p_label;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------

set role service_role;

delete from public.notifications
 where user_id in ('fd640000-0000-0000-0000-0000000000c1',
                   'fd640000-0000-0000-0000-0000000000c2');

insert into auth.users (id, email) values
  ('fd640000-0000-0000-0000-0000000000c1', 'customer-a-64@example.test'),
  ('fd640000-0000-0000-0000-0000000000c2', 'customer-b-64@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, email) values
  ('fd640000-0000-0000-0000-0000000000c1', 'customer-a-64@example.test'),
  ('fd640000-0000-0000-0000-0000000000c2', 'customer-b-64@example.test')
on conflict (id) do nothing;

reset role;

-- -----------------------------------------------------------------------------
-- 1. Only the service role may write a notification
--
-- `notify_user` takes the recipient as an argument, so it can only be safe when
-- the caller is already trusted to name any recipient. These three assertions
-- are the security model: the function exists, and it is unreachable by anyone a
-- request can authenticate as.
-- -----------------------------------------------------------------------------

set role anon;
select pg_temp.assert_raises(
  'notify_user: an anonymous visitor cannot execute it',
  $q$select public.notify_user('fd640000-0000-0000-0000-0000000000c1', 'system', 'Injected')$q$,
  '42501',
  null
);
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"fd640000-0000-0000-0000-0000000000c1","role":"authenticated"}';
select pg_temp.assert_raises(
  'notify_user: a customer cannot notify themselves',
  $q$select public.notify_user('fd640000-0000-0000-0000-0000000000c1', 'system', 'Self-serve')$q$,
  '42501',
  null
);
select pg_temp.assert_raises(
  'notify_user: a customer cannot notify another customer',
  $q$select public.notify_user('fd640000-0000-0000-0000-0000000000c2', 'system', 'Impersonation')$q$,
  '42501',
  null
);
reset role;

-- The service role is the one caller that may. This is the path
-- `notification-service.ts` uses after a committed transition.
set role service_role;
select pg_temp.assert_eq(
  'notify_user: the service role can notify a named recipient',
  $q$select (public.notify_user(
       'fd640000-0000-0000-0000-0000000000c1', 'order_request',
       'Your order is confirmed', 'Reference LW-64-1', '/account/orders', 'order:64:confirmed'
     ) is not null)::text$q$,
  'true'
);
reset role;

-- -----------------------------------------------------------------------------
-- 2. Dedupe is a real constraint, not a convention
--
-- Two calls with the same (recipient, key) must produce one row and a NULL from
-- the second call. A single insert could not tell a unique index from its
-- absence, which is the shape of test AGENTS.md warns about.
-- -----------------------------------------------------------------------------

set role service_role;
select pg_temp.assert_eq(
  'notify_user: a repeated dispatch returns NULL',
  $q$select (public.notify_user(
       'fd640000-0000-0000-0000-0000000000c1', 'order_request',
       'Your order is confirmed', 'Reference LW-64-1', '/account/orders', 'order:64:confirmed'
     ) is null)::text$q$,
  'true'
);

select pg_temp.assert_eq(
  'notify_user: a repeated dispatch leaves exactly one row',
  $q$select count(*)::text from public.notifications
      where user_id = 'fd640000-0000-0000-0000-0000000000c1'
        and dedupe_key = 'order:64:confirmed'$q$,
  '1'
);

-- A different recipient with the same key is a different notification. The
-- uniqueness is per person, not global: two customers whose orders reached the
-- same status must both be told.
select pg_temp.assert_eq(
  'notify_user: the same key for another recipient is a new notification',
  $q$select (public.notify_user(
       'fd640000-0000-0000-0000-0000000000c2', 'order_request',
       'Your order is confirmed', 'Reference LW-64-2', '/account/orders', 'order:64:confirmed'
     ) is not null)::text$q$,
  'true'
);

-- A NULL key is allowed to repeat. That is what the partial index exists for:
-- some notifications are genuinely repeatable, and forcing a key on them would
-- mean inventing one that is not an event identity.
select pg_temp.assert_eq(
  'notify_user: a null key does not deduplicate',
  $q$select (
       public.notify_user('fd640000-0000-0000-0000-0000000000c1', 'system', 'One')
       is not null
       and public.notify_user('fd640000-0000-0000-0000-0000000000c1', 'system', 'Two')
       is not null
     )::text$q$,
  'true'
);
reset role;

-- -----------------------------------------------------------------------------
-- 3. A notification link cannot carry an executable scheme
--
-- `link_url` is rendered as an href in the customer's inbox. A stored
-- `javascript:` there is stored XSS reachable by anyone who can influence the
-- value upstream, so the function refuses it at the boundary rather than trusting
-- every caller to sanitise.
-- -----------------------------------------------------------------------------

set role service_role;
select pg_temp.assert_raises(
  'notify_user: a javascript: link is refused',
  $q$select public.notify_user(
       'fd640000-0000-0000-0000-0000000000c1', 'system', 'Bad link', null,
       'javascript:alert(1)'
     )$q$,
  '23514',
  null
);
select pg_temp.assert_raises(
  'notify_user: a protocol-relative link is refused',
  $q$select public.notify_user(
       'fd640000-0000-0000-0000-0000000000c1', 'system', 'Bad link', null, '//evil.example'
     )$q$,
  '23514',
  null
);
select pg_temp.assert_eq(
  'notify_user: a site-relative link is accepted',
  $q$select (public.notify_user(
       'fd640000-0000-0000-0000-0000000000c1', 'system', 'Good link', null,
       '/account/orders', 'link:relative'
     ) is not null)::text$q$,
  'true'
);
select pg_temp.assert_eq(
  'notify_user: an https link is accepted',
  $q$select (public.notify_user(
       'fd640000-0000-0000-0000-0000000000c1', 'system', 'Good link', null,
       'https://example.com/tracking', 'link:https'
     ) is not null)::text$q$,
  'true'
);
reset role;

-- -----------------------------------------------------------------------------
-- 4. The customer reads and marks read only their own
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"fd640000-0000-0000-0000-0000000000c1","role":"authenticated"}';

-- Five rows exist for this customer: the deduped order notification, the two
-- keyless ones, and the two link checks. The literal is deliberate — asserting a
-- count against a subquery of the same table would prove only that a query
-- returns what it returns.
select pg_temp.assert_eq(
  'notifications: a customer sees all five of their own rows',
  $q$select count(*)::text from public.notifications$q$,
  '5'
);

-- This is the assertion that catches a policy scoped to `true` rather than to
-- `auth.uid()`: the other customer's row exists and must not be visible.
select pg_temp.assert_eq(
  'notifications: another customer''s row is invisible',
  $q$select count(*)::text from public.notifications
      where user_id = 'fd640000-0000-0000-0000-0000000000c2'$q$,
  '0'
);

select pg_temp.assert_eq(
  'mark_notifications_read: marks the caller''s own unread rows',
  $q$select (public.mark_notifications_read() > 0)::text$q$,
  'true'
);

select pg_temp.assert_eq(
  'mark_notifications_read: leaves nothing unread',
  $q$select count(*)::text from public.notifications where not is_read$q$,
  '0'
);

reset role;

-- The other customer's rows are untouched by the call above. A function that
-- forgot its `user_id` predicate would pass the assertion above and fail here.
select pg_temp.assert_eq(
  'mark_notifications_read: does not touch another customer''s rows',
  $q$select count(*)::text from public.notifications
      where user_id = 'fd640000-0000-0000-0000-0000000000c2'
        and not is_read$q$,
  '1'
);

-- -----------------------------------------------------------------------------
-- 5. A customer may change the read state of their row and nothing else
--
-- RLS restricts rows, not columns. The update grant on `notifications` is
-- therefore column-scoped to `is_read` and `read_at`; a customer who could also
-- write `title` or `link_url` could rewrite a notification after the fact.
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"fd640000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select pg_temp.assert_raises(
  'notifications: a customer cannot rewrite a notification title',
  $q$update public.notifications
        set title = 'Something else'
      where user_id = 'fd640000-0000-0000-0000-0000000000c1'$q$,
  '42501',
  null
);

select pg_temp.assert_raises(
  'notifications: a customer cannot reassign a notification',
  $q$update public.notifications
        set user_id = 'fd640000-0000-0000-0000-0000000000c2'
      where user_id = 'fd640000-0000-0000-0000-0000000000c1'$q$,
  '42501',
  null
);

reset role;

-- -----------------------------------------------------------------------------
-- 6. The mail identity is not public
--
-- `email_settings` has no public grant. `anon` must not read it at all, and a
-- signed-in customer must not either: these are the store's own mail settings,
-- and the `from` address they cannot reach is precisely why the sending address
-- stays in the environment rather than in this table.
-- -----------------------------------------------------------------------------

set role anon;
select pg_temp.assert_raises(
  'email_settings: an anonymous visitor cannot read it',
  $q$select from_name from public.email_settings$q$,
  '42501',
  null
);
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"fd640000-0000-0000-0000-0000000000c1","role":"authenticated"}';

-- A signed-in customer holds the SELECT grant because the administrator editor
-- reads this table through the session client, so the refusal is a policy that
-- matches no row rather than a permission error. Asserting the count is the
-- honest form of the claim: a row exists, and they still see none of it. An
-- assertion expecting SQLSTATE 42501 here would fail for the right reason but
-- describe the wrong mechanism.
select pg_temp.assert_eq(
  'email_settings: a customer reads zero rows',
  $q$select count(*)::text from public.email_settings$q$,
  '0'
);
select pg_temp.assert_raises(
  'email_settings: a customer cannot write it',
  $q$update public.email_settings set from_name = 'Hijacked'$q$,
  '42501',
  null
);
reset role;

-- The row exists and is a singleton. A missing row would make every assertion
-- above pass for the wrong reason — an empty table refuses nothing.
set role service_role;
select pg_temp.assert_eq(
  'email_settings: the singleton row exists',
  $q$select count(*)::text from public.email_settings$q$,
  '1'
);
reset role;

-- -----------------------------------------------------------------------------
-- 7. Saving the settings writes an audit row
--
-- A singleton has no uuid to name, and `admin_audit_logs.entity_id` is a `uuid`
-- column. The action used to pass the string 'singleton', which failed the cast
-- inside the RPC; the error was logged as `admin.audit_write_failed` and the save
-- still reported success, so every settings change went unrecorded. The action
-- now passes NULL. This asserts the shape it produces is accepted and recorded,
-- because the failure was invisible from the application side.
-- -----------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('fd640000-0000-0000-0000-0000000000a1', 'settings-admin-64@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, email) values
  ('fd640000-0000-0000-0000-0000000000a1', 'settings-admin-64@example.test')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('fd640000-0000-0000-0000-0000000000a1', 'ADMIN')
on conflict do nothing;

set role authenticated;
set request.jwt.claims = '{"sub":"fd640000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select pg_temp.assert_eq(
  'audit: a settings save is recorded with a null entity id',
  $q$select (public.admin_write_audit_log(
       'email_settings.updated', 'email_settings', null, '{"fromName":"Store"}'::jsonb
     ) is not null)::text$q$,
  'true'
);

-- And the row is findable by entity type, which is how an administrator looks
-- for it. A null id must not make the record unreachable. This asserts existence
-- rather than an exact count, so the suite is re-runnable against a database that
-- has already recorded settings changes.
select pg_temp.assert_eq(
  'audit: the settings record is readable by entity type',
  $q$select exists(
       select 1 from public.admin_audit_logs
        where entity_type = 'email_settings'
          and entity_id is null
          and actor_id = 'fd640000-0000-0000-0000-0000000000a1'
     )::text$q$,
  'true'
);

reset role;

-- -----------------------------------------------------------------------------
-- No teardown
--
-- `db-verify.sh` wraps every suite in `begin; ... rollback;`, so the users and
-- notifications above are discarded when this file finishes.
-- -----------------------------------------------------------------------------

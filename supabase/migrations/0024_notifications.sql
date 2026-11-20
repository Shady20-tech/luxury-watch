-- -----------------------------------------------------------------------------
-- 0024 — in-app notifications: a write path, and the dedupe that makes it safe
--
-- `notifications` has existed since 0005 with a read policy and a column grant,
-- and nothing has ever written a row. The table could not be written through the
-- API by design: there is no insert policy, so a customer cannot post themselves
-- a notification and a hostile caller cannot post one to somebody else.
--
-- That design is right, and it left a gap. The only thing that may write here is
-- a database function running as its owner, called by the server's service-role
-- client after a business event has already committed. This migration adds that
-- function, the dedupe key that stops a retried dispatch producing two identical
-- unread badges, and the index the inbox reads on.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Dedupe key
--
-- A notification is dispatched after a commit, and a dispatch can legitimately
-- run twice: a retried job, or a staff member pressing the same transition twice
-- because the first response was slow. Without a key those produce two identical
-- rows, and an unread badge that says "3" when the customer has one thing to read
-- is worse than no badge at all.
--
-- The key names the *event*, not the moment: for an order status change it is
-- `order:<uuid>:<status>`, so a second dispatch of the same transition collides
-- and is dropped. A NULL key is allowed for a notification that may genuinely
-- repeat.
-- -----------------------------------------------------------------------------

alter table public.notifications
  add column dedupe_key text;

alter table public.notifications
  add constraint notifications_dedupe_key_length
  check (dedupe_key is null or char_length(dedupe_key) between 1 and 200);

-- Partial: NULLs are allowed to repeat, and a plain unique index would permit
-- any number of them, because SQL treats NULLs as distinct. Writing the
-- predicate out is the difference between a rule and a hope.
create unique index notifications_dedupe_key_key
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

comment on column public.notifications.dedupe_key is
  'Event identity for idempotent dispatch. Two notifications for one user with the same key are one notification.';

-- -----------------------------------------------------------------------------
-- notify_user — the only way a notification is written
--
-- Deliberately not `security invoker`: a caller must not be able to choose the
-- recipient. The function takes `p_user_id`, so it can only be safe if it is
-- callable by a role that is already trusted to name any recipient — which is
-- the service role alone. `anon` and `authenticated` are revoked explicitly, so
-- a customer cannot call this to notify another customer, or to fill their own
-- inbox with arbitrary rows.
--
-- Returning the id lets the caller log which notification was created without a
-- second query. A deduplicated call returns NULL rather than raising: a repeat
-- is the normal case the key exists for, not an error.
-- -----------------------------------------------------------------------------

create or replace function public.notify_user(
  p_user_id    uuid,
  p_kind       public.notification_kind,
  p_title      text,
  p_body       text default null,
  p_link_url   text default null,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    raise exception 'A notification needs a recipient'
      using errcode = 'not_null_violation';
  end if;

  -- An inserted notification must not point at a scheme a browser will execute.
  -- `javascript:` in a link_url would be a stored cross-site scripting primitive
  -- on the customer's own inbox, reachable by anyone who can influence the value
  -- upstream. Only a site-relative path or an https URL is accepted.
  if p_link_url is not null
     and p_link_url !~ '^(/[^/]|https://)'
  then
    raise exception 'A notification link must be a site-relative path or an https URL'
      using errcode = 'check_violation';
  end if;

  insert into public.notifications (user_id, kind, title, body, link_url, dedupe_key)
  values (p_user_id, p_kind, p_title, p_body, p_link_url, p_dedupe_key)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.notify_user(uuid, public.notification_kind, text, text, text, text) is
  'Creates one in-app notification for a named recipient. Idempotent on (recipient, dedupe_key). Service role only.';

revoke all on function public.notify_user(uuid, public.notification_kind, text, text, text, text) from public;
revoke all on function public.notify_user(uuid, public.notification_kind, text, text, text, text) from anon;
revoke all on function public.notify_user(uuid, public.notification_kind, text, text, text, text) from authenticated;
grant execute on function public.notify_user(uuid, public.notification_kind, text, text, text, text)
  to service_role;

-- -----------------------------------------------------------------------------
-- mark_notifications_read — the customer's own write, through a function
--
-- The read side has a policy; the write side has none, because a customer
-- updating their own notification row directly would also be able to change its
-- title, its link or its recipient. Marking one read is the only mutation a
-- customer is entitled to make, so it is the only one that exists.
--
-- `security invoker` with an explicit ownership predicate, so RLS still applies
-- underneath: even if this function were called by the wrong person, the row
-- would not match.
-- -----------------------------------------------------------------------------

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_count  integer;
begin
  if v_actor is null then
    raise exception 'Sign in to update notifications'
      using errcode = 'insufficient_privilege';
  end if;

  update public.notifications
     set is_read = true,
         read_at = coalesce(read_at, now())
   where user_id = v_actor
     and not is_read
     and (p_ids is null or id = any (p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.mark_notifications_read(uuid[]) is
  'Marks the caller''s own notifications read. Pass NULL for all, or an array of ids.';

revoke all on function public.mark_notifications_read(uuid[]) from public;
revoke all on function public.mark_notifications_read(uuid[]) from anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- -----------------------------------------------------------------------------
-- notifications: allow the customer to update their own row's read state only
--
-- `notifications_update_own` already exists from 0007 and scopes by `user_id`.
-- What it does not do is restrict *which columns* may change, and RLS restricts
-- rows, not columns — the same gap that once let `anon` read `products.cost_cents`
-- through a correct row policy. A column-level update grant closes it: the
-- customer may set `is_read` and `read_at`, and nothing else.
-- -----------------------------------------------------------------------------

revoke update on public.notifications from authenticated;
grant update (is_read, read_at) on public.notifications to authenticated;

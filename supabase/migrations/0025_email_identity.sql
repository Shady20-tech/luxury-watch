-- -----------------------------------------------------------------------------
-- 0025 — the email identity an administrator may edit
--
-- The sender address itself stays in an environment variable. That is not an
-- oversight: a sending domain must be verified with Resend, and a value an
-- administrator types into a form cannot verify a domain. Worse, an editable
-- `from` address is a phishing surface — anyone who could write it could send
-- mail to customers from a domain the store does not own, riding our reputation.
--
-- What an administrator *can* reasonably control without either problem is how
-- the store presents itself in a message: the display name beside the address,
-- and where a reply should go. Those are content, not credentials, and they
-- change when the business changes its name or its inbox — which should not need
-- a deployment.
--
-- -----------------------------------------------------------------------------
-- WHY THIS IS A TABLE OF ITS OWN RATHER THAN COLUMNS ON `site_settings`
-- -----------------------------------------------------------------------------
--
-- `site_settings` is publicly readable. Columns added to it are readable by
-- `anon` under the table-level grant, and a column-level revoke does not beat a
-- table-level grant — the grant wins. The choice was therefore to re-grant every
-- public column of `site_settings` (a large, fragile list that a future migration
-- would silently re-open) or to keep the mail identity in a table with no public
-- read policy at all.
--
-- The second is the smaller surface and the honest one: these values are used by
-- the mailer and the admin editor, and by nothing a visitor can see.
--
-- -----------------------------------------------------------------------------
-- PRECEDENCE, AND WHY
-- -----------------------------------------------------------------------------
--
--   from address      environment only. Tied to a domain verified with Resend.
--   display name      this table, then RESEND_FROM_NAME.
--   reply-to          this table, then RESEND_REPLY_TO_EMAIL, then nothing. The
--                     header is omitted rather than set to the from address: a
--                     reply that reaches a no-reply mailbox is worse than a
--                     client falling back to the address the reader can see.
--   admin destination environment only. It is where staff notifications go, and
--                     a compromised admin session must not be able to redirect
--                     every internal notification to an address it controls.
-- -----------------------------------------------------------------------------

create table public.email_settings (
  id             boolean primary key default true,
  from_name      text,
  reply_to       extensions.citext,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id) on delete set null,

  constraint email_settings_singleton check (id),
  constraint email_settings_from_name_length
    check (from_name is null or char_length(trim(from_name)) between 1 and 120),
  constraint email_settings_reply_to_length
    check (reply_to is null or char_length(reply_to::text) between 3 and 320)
);

comment on table public.email_settings is
  'Administrator-editable mail presentation. The sending address itself is an environment variable.';

comment on column public.email_settings.from_name is
  'Display name shown beside the sending address. Overrides RESEND_FROM_NAME when set.';
comment on column public.email_settings.reply_to is
  'Where a customer reply should go. Overrides RESEND_REPLY_TO_EMAIL when set.';

insert into public.email_settings (id) values (true) on conflict (id) do nothing;

create trigger email_settings_set_updated_at
  before update on public.email_settings
  for each row execute function public.set_updated_at();

-- Row security must be switched on explicitly. The default privileges in the
-- Supabase shim grant table access to the API roles, and a table with policies
-- but no `enable row level security` has policies that are never consulted — the
-- grants are then the whole access model. This suite caught exactly that: the
-- customer could read the row through the SELECT grant while `is_admin()` sat
-- unused on a disabled table.
alter table public.email_settings enable row level security;

-- No public read policy and no public grant. The storefront never needs these;
-- the mailer reads them with the service role and the editor with the session
-- client under the policy below.
revoke all on public.email_settings from anon;
revoke all on public.email_settings from authenticated;

grant select on public.email_settings to authenticated;

create policy email_settings_admin_read on public.email_settings
  for select to authenticated
  using (public.is_admin());

create policy email_settings_admin_write on public.email_settings
  for update to authenticated
  using (public.has_permission('settings.write'))
  with check (public.has_permission('settings.write'));

-- =============================================================================
-- 0005 — Service flows: inquiries, sell/trade, sourcing, repair, appointments
--
-- All four service flows share one spine (`inquiries`) because they are the same
-- interaction at heart: a customer submits something, staff reply, the item
-- moves through a small set of states. The type-specific detail lives in
-- extension tables keyed by inquiry_id, so a new service flow needs a table, not
-- a redesign.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- inquiries — the shared spine
-- -----------------------------------------------------------------------------

create table public.inquiries (
  id          uuid primary key default gen_random_uuid(),
  type        public.inquiry_type not null,
  status      public.inquiry_status not null default 'new',

  user_id     uuid references auth.users (id) on delete set null,
  product_id  uuid references public.products (id) on delete set null,

  name        text not null,
  email       extensions.citext not null,
  phone       text,
  message     text not null,

  -- Reference so a customer can quote it and staff can find it.
  reference   text not null default public.generate_order_reference(),

  assigned_to uuid references auth.users (id) on delete set null,

  ip_hash     text,
  user_agent  text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint inquiries_name_length check (char_length(trim(name)) between 1 and 200),
  constraint inquiries_email_length check (char_length(email::text) between 3 and 320),
  constraint inquiries_message_length check (char_length(trim(message)) between 1 and 8000)
);

comment on table public.inquiries is
  'Shared spine for every customer service submission. Private: never publicly readable.';

create unique index inquiries_reference_key on public.inquiries (reference);
create index inquiries_type_status_idx on public.inquiries (type, status, created_at desc);
create index inquiries_user_idx on public.inquiries (user_id, created_at desc);
create index inquiries_assigned_idx on public.inquiries (assigned_to) where assigned_to is not null;

create trigger inquiries_set_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- inquiry_replies
-- -----------------------------------------------------------------------------

create table public.inquiry_replies (
  id          uuid primary key default gen_random_uuid(),
  inquiry_id  uuid not null references public.inquiries (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null,
  body        text not null,
  -- Distinguishes staff replies from customer follow-ups in one thread.
  is_internal boolean not null default false,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),

  constraint inquiry_replies_body_length check (char_length(trim(body)) between 1 and 8000)
);

create index inquiry_replies_inquiry_idx on public.inquiry_replies (inquiry_id, created_at);

-- -----------------------------------------------------------------------------
-- sell_trade_requests — an inquiry of type 'sell_trade', with watch detail
-- -----------------------------------------------------------------------------

create table public.sell_trade_requests (
  id                  uuid primary key default gen_random_uuid(),
  inquiry_id          uuid not null references public.inquiries (id) on delete cascade,
  brand_name          text,
  model_name          text,
  reference_number    text,
  production_year     integer,
  condition_notes     text,
  has_box             boolean,
  has_papers          boolean,
  -- What the customer is asking for. Null means they have not stated one.
  asking_price_cents  bigint,
  currency            char(3) not null default 'USD',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint sell_trade_requests_price_non_negative check (asking_price_cents is null or asking_price_cents >= 0),
  constraint sell_trade_requests_year_sane check (production_year is null or production_year between 1800 and 2200),
  constraint sell_trade_requests_currency_format check (currency ~ '^[A-Z]{3}$')
);

create unique index sell_trade_requests_inquiry_key on public.sell_trade_requests (inquiry_id);

create trigger sell_trade_requests_set_updated_at
  before update on public.sell_trade_requests
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- sell_trade_images — customer uploads for a sell/trade request
-- -----------------------------------------------------------------------------

create table public.sell_trade_images (
  id                    uuid primary key default gen_random_uuid(),
  sell_trade_request_id uuid not null references public.sell_trade_requests (id) on delete cascade,
  storage_path          text not null,
  alt_text              text,
  width                 integer,
  height                integer,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now()
);

comment on table public.sell_trade_images is
  'Customer-uploaded photos. Stored in a private bucket; readable by staff only.';

create index sell_trade_images_request_idx on public.sell_trade_images (sell_trade_request_id, sort_order);

-- -----------------------------------------------------------------------------
-- sell_trade_offers — offer history, newest last
--
-- A table rather than a column so every counter-offer is preserved and the
-- negotiation is auditable.
-- -----------------------------------------------------------------------------

create table public.sell_trade_offers (
  id                    uuid primary key default gen_random_uuid(),
  sell_trade_request_id uuid not null references public.sell_trade_requests (id) on delete cascade,
  amount_cents          bigint not null,
  currency              char(3) not null default 'USD',
  -- 'staff' means we made the offer; 'customer' means they countered.
  offered_by            text not null,
  note                  text,
  status                text not null default 'pending',
  created_by            uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),

  constraint sell_trade_offers_amount_non_negative check (amount_cents >= 0),
  constraint sell_trade_offers_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint sell_trade_offers_party check (offered_by in ('staff', 'customer')),
  constraint sell_trade_offers_status check (status in ('pending', 'accepted', 'declined', 'withdrawn'))
);

create index sell_trade_offers_request_idx on public.sell_trade_offers (sell_trade_request_id, created_at);

-- -----------------------------------------------------------------------------
-- sourcing_requests — a customer asking us to find a watch
-- -----------------------------------------------------------------------------

create table public.sourcing_requests (
  id               uuid primary key default gen_random_uuid(),
  inquiry_id       uuid not null references public.inquiries (id) on delete cascade,
  brand_name       text,
  model_name       text,
  reference_number text,
  dial_color       text,
  case_size_mm     numeric(5,2),
  bracelet_type    text,
  min_year         integer,
  max_year         integer,
  max_budget_cents bigint,
  currency         char(3) not null default 'USD',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint sourcing_requests_budget_non_negative check (max_budget_cents is null or max_budget_cents >= 0),
  constraint sourcing_requests_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint sourcing_requests_years_sane check (
    (min_year is null or min_year between 1800 and 2200)
    and (max_year is null or max_year between 1800 and 2200)
  ),
  constraint sourcing_requests_year_order check (min_year is null or max_year is null or min_year <= max_year)
);

create unique index sourcing_requests_inquiry_key on public.sourcing_requests (inquiry_id);

create trigger sourcing_requests_set_updated_at
  before update on public.sourcing_requests
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- sourcing_updates — progress notes shown to the customer
-- -----------------------------------------------------------------------------

create table public.sourcing_updates (
  id                  uuid primary key default gen_random_uuid(),
  sourcing_request_id uuid not null references public.sourcing_requests (id) on delete cascade,
  body                text not null,
  -- A private update is a staff note the customer must not see.
  is_customer_visible boolean not null default true,
  author_id           uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),

  constraint sourcing_updates_body_length check (char_length(trim(body)) between 1 and 4000)
);

create index sourcing_updates_request_idx on public.sourcing_updates (sourcing_request_id, created_at);

-- -----------------------------------------------------------------------------
-- repair_requests
-- -----------------------------------------------------------------------------

create table public.repair_requests (
  id              uuid primary key default gen_random_uuid(),
  inquiry_id      uuid not null references public.inquiries (id) on delete cascade,
  brand_name      text,
  model_name      text,
  reference_number text,
  service_type    text,
  issue_summary   text,
  is_watch_insured boolean,
  preferred_contact_method text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index repair_requests_inquiry_key on public.repair_requests (inquiry_id);

create trigger repair_requests_set_updated_at
  before update on public.repair_requests
  for each row execute function public.set_updated_at();

create table public.repair_updates (
  id                 uuid primary key default gen_random_uuid(),
  repair_request_id  uuid not null references public.repair_requests (id) on delete cascade,
  body               text not null,
  is_customer_visible boolean not null default true,
  author_id          uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),

  constraint repair_updates_body_length check (char_length(trim(body)) between 1 and 4000)
);

create index repair_updates_request_idx on public.repair_updates (repair_request_id, created_at);

-- -----------------------------------------------------------------------------
-- appointments
-- -----------------------------------------------------------------------------

create table public.appointments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users (id) on delete set null,
  name           text not null,
  email          extensions.citext not null,
  phone          text,
  purpose        text,
  requested_at   timestamptz not null,
  scheduled_at   timestamptz,
  status         public.appointment_status not null default 'requested',
  location       text,
  staff_note     text,
  customer_note  text,
  assigned_to    uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint appointments_name_length check (char_length(trim(name)) between 1 and 200),
  constraint appointments_email_length check (char_length(email::text) between 3 and 320)
);

create index appointments_requested_idx on public.appointments (requested_at desc);
create index appointments_status_idx on public.appointments (status, scheduled_at);
create index appointments_user_idx on public.appointments (user_id);

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- contact_submissions — general contact form, kept separate from inquiries
-- because it has no lifecycle and no assignee.
-- -----------------------------------------------------------------------------

create table public.contact_submissions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      extensions.citext not null,
  phone      text,
  subject    text,
  message    text not null,
  is_handled boolean not null default false,
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  ip_hash    text,
  user_agent text,
  created_at timestamptz not null default now(),

  constraint contact_submissions_name_length check (char_length(trim(name)) between 1 and 200),
  constraint contact_submissions_email_length check (char_length(email::text) between 3 and 320),
  constraint contact_submissions_message_length check (char_length(trim(message)) between 1 and 8000),
  constraint contact_submissions_handled_complete check (
    (not is_handled and handled_at is null)
    or (is_handled and handled_at is not null)
  )
);

create index contact_submissions_created_idx on public.contact_submissions (created_at desc);
create index contact_submissions_unhandled_idx on public.contact_submissions (is_handled) where not is_handled;

-- -----------------------------------------------------------------------------
-- product_questions — customer question attached to a product
-- -----------------------------------------------------------------------------

create table public.product_questions (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  name        text not null,
  email       extensions.citext not null,
  question    text not null,
  answer      text,
  answered_by uuid references auth.users (id) on delete set null,
  answered_at timestamptz,
  -- A question is published only when a staff member has answered it AND chosen
  -- to publish, so a customer cannot put arbitrary text on a product page.
  is_published boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint product_questions_name_length check (char_length(trim(name)) between 1 and 200),
  constraint product_questions_email_length check (char_length(email::text) between 3 and 320),
  constraint product_questions_question_length check (char_length(trim(question)) between 1 and 2000),
  constraint product_questions_answer_complete check (
    (answer is null and answered_at is null)
    or (answer is not null and answered_at is not null)
  ),
  -- Nothing may be published without an answer.
  constraint product_questions_published_requires_answer check (not is_published or answer is not null)
);

create index product_questions_product_idx on public.product_questions (product_id, created_at desc);
create index product_questions_published_idx on public.product_questions (product_id) where is_published;

create trigger product_questions_set_updated_at
  before update on public.product_questions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- messages — internal staff notes tied to a customer or entity
-- -----------------------------------------------------------------------------

create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  -- Loose reference to whatever the message is about, so the table does not
  -- need a nullable FK per entity type.
  entity_type   text,
  entity_id     uuid,
  sender_id     uuid references auth.users (id) on delete set null,
  recipient_id  uuid references auth.users (id) on delete set null,
  body          text not null,
  is_read       boolean not null default false,
  read_at       timestamptz,
  created_at    timestamptz not null default now(),

  constraint messages_body_length check (char_length(trim(body)) between 1 and 8000),
  constraint messages_entity_pair check (
    (entity_type is null and entity_id is null) or (entity_type is not null and entity_id is not null)
  )
);

comment on table public.messages is
  'Internal staff messaging. Never readable by a customer.';

create index messages_recipient_idx on public.messages (recipient_id, is_read, created_at desc);
create index messages_entity_idx on public.messages (entity_type, entity_id, created_at desc);

-- -----------------------------------------------------------------------------
-- notifications — in-app notifications for staff and customers
-- -----------------------------------------------------------------------------

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       public.notification_kind not null,
  title      text not null,
  body       text,
  link_url   text,
  is_read    boolean not null default false,
  read_at    timestamptz,
  created_at timestamptz not null default now(),

  constraint notifications_title_length check (char_length(trim(title)) between 1 and 200)
);

create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

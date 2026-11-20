-- =============================================================================
-- 62 — CMS and media, as the admin actually writes them
--
-- This suite pins four things the content phase depends on, each of which is a
-- policy rather than application code and so cannot be proved from TypeScript:
--
--   1. `content.write` is the gate on every content table, and a customer who
--      holds no staff role cannot write any of them even though `authenticated`
--      holds the table grant.
--   2. A draft or unpublished row is invisible to `anon` — the public site and
--      the sitemap read as `anon`, so this is the same check that keeps a draft
--      out of both.
--   3. The media table is staff-only. A customer cannot enumerate it, which is
--      what stops a private customer document from appearing in a public media
--      listing even if one were ever filed there.
--   4. A system page cannot be unpublished by a content editor, because it backs
--      a fixed route and a footer link.
--
-- Everything runs against real policies with real JWTs. Nothing here mocks.
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

delete from public.media where id in (
  'fa000000-0000-0000-0000-0000000000c1',
  'fa000000-0000-0000-0000-0000000000c2'
);
delete from public.pages where slug like 'cms62-%';
delete from public.faqs where question like 'CMS62 %';
delete from public.testimonials where author like 'CMS62 %';
delete from public.navigation_items where href like '/cms62-%';
delete from public.homepage_sections where section_key like 'cms62_%';
delete from public.announcements where message like 'CMS62 %';

insert into auth.users (id, email) values
  ('fc100000-0000-0000-0000-0000000000a1', 'editor-cms62@example.test'),
  ('fc100000-0000-0000-0000-0000000000a2', 'admin-cms62@example.test'),
  ('fc100000-0000-0000-0000-0000000000a3', 'customer-cms62@example.test')
on conflict (id) do nothing;

insert into public.profiles (id, email) values
  ('fc100000-0000-0000-0000-0000000000a1', 'editor-cms62@example.test'),
  ('fc100000-0000-0000-0000-0000000000a2', 'admin-cms62@example.test'),
  ('fc100000-0000-0000-0000-0000000000a3', 'customer-cms62@example.test')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role) values
  ('fc100000-0000-0000-0000-0000000000a1', 'CONTENT_MANAGER'),
  ('fc100000-0000-0000-0000-0000000000a2', 'ADMIN')
on conflict do nothing;

-- A system page and a normal page, both drafted, to prove the trigger and the
-- public filter independently.
insert into public.pages (id, slug, title, content, status, published_at, is_system) values
  ('fb000000-0000-0000-0000-0000000000a1', 'cms62-system', 'CMS62 System',
   '[{"type":"paragraph","text":"system"}]'::jsonb, 'published', now(), true),
  ('fb000000-0000-0000-0000-0000000000a2', 'cms62-draft', 'CMS62 Draft',
   '[{"type":"paragraph","text":"draft"}]'::jsonb, 'draft', null, false)
on conflict (id) do nothing;

reset role;

-- -----------------------------------------------------------------------------
-- 1. A content editor may write content, and only content
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claims = '{"sub":"fc100000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select pg_temp.assert_eq(
  'content: an editor can insert a FAQ',
  $q$with i as (
       insert into public.faqs (question, answer, category, is_published)
       values ('CMS62 question', 'CMS62 answer', 'buying', false)
       returning 1
     ) select count(*)::text from i$q$,
  '1'
);

select pg_temp.assert_eq(
  'content: an editor can insert a testimonial (unpublished)',
  $q$with i as (
       insert into public.testimonials (quote, author, is_published)
       values ('CMS62 quote', 'CMS62 author', false)
       returning 1
     ) select count(*)::text from i$q$,
  '1'
);

select pg_temp.assert_eq(
  'content: an editor can insert a navigation item',
  $q$with i as (
       insert into public.navigation_items (location, label, href, is_active)
       values ('footer', 'CMS62 link', '/cms62-link', true)
       returning 1
     ) select count(*)::text from i$q$,
  '1'
);

select pg_temp.assert_eq(
  'content: an editor can insert a homepage section',
  $q$with i as (
       insert into public.homepage_sections (section_key, title, is_active)
       values ('cms62_hero', 'CMS62 hero', false)
       returning 1
     ) select count(*)::text from i$q$,
  '1'
);

-- The separation that matters: content.write must not reach site settings.
--
-- This asserts the *row count*, not an exception, and the distinction is the
-- lesson: a policy's `using` clause filters the rows an UPDATE may see, so an
-- unauthorised update is not an error — it silently matches zero rows and
-- reports success. A test written as `assert_raises` here passes for the wrong
-- reason or fails outright, and either way it does not prove what it claims.
-- The value check afterwards is what makes the row count meaningful.
select pg_temp.assert_eq(
  'content: an editor''s settings update matches no rows',
  $q$with u as (
       update public.site_settings set business_name = 'hijacked' returning 1
     ) select count(*)::text from u$q$,
  '0'
);

select pg_temp.assert_eq(
  'content: site settings are unchanged after the attempt',
  $q$select (business_name <> 'hijacked')::text from public.site_settings limit 1$q$,
  'true'
);

-- -----------------------------------------------------------------------------
-- 2. A customer with no staff role cannot write content
-- -----------------------------------------------------------------------------

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"fc100000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select pg_temp.assert_raises(
  'content: a customer cannot insert a FAQ',
  $q$insert into public.faqs (question, answer) values ('CMS62 nope', 'nope')$q$,
  '42501'
);

select pg_temp.assert_raises(
  'content: a customer cannot insert a navigation item',
  $q$insert into public.navigation_items (location, label, href)
     values ('header', 'CMS62 nope', '/cms62-nope')$q$,
  '42501'
);

select pg_temp.assert_eq(
  'content: a customer sees no draft page',
  $q$select count(*)::text from public.pages where slug = 'cms62-draft'$q$,
  '0'
);

-- -----------------------------------------------------------------------------
-- 3. Drafts and unpublished rows are invisible to the public reader
-- -----------------------------------------------------------------------------

reset role;
set role anon;

select pg_temp.assert_eq(
  'public: a draft page is not readable',
  $q$select count(*)::text from public.pages where slug = 'cms62-draft'$q$,
  '0'
);

select pg_temp.assert_eq(
  'public: an unpublished FAQ is not readable',
  $q$select count(*)::text from public.faqs where question = 'CMS62 question'$q$,
  '0'
);

select pg_temp.assert_eq(
  'public: an unpublished testimonial is not readable',
  $q$select count(*)::text from public.testimonials where author = 'CMS62 author'$q$,
  '0'
);

select pg_temp.assert_eq(
  'public: an inactive homepage section is not readable',
  $q$select count(*)::text from public.homepage_sections where section_key = 'cms62_hero'$q$,
  '0'
);

-- The media table is staff-only. `anon` sees nothing at all, which is what stops
-- a customer document from ever appearing in a public listing.
select pg_temp.assert_eq(
  'public: the media library is not readable by a visitor',
  $q$select count(*)::text from public.media$q$,
  '0'
);

reset role;

-- -----------------------------------------------------------------------------
-- 4. Media rows: staff can read, and the category exists on the row
-- -----------------------------------------------------------------------------

set role service_role;
insert into public.media (id, storage_bucket, storage_path, file_name, mime_type, category, alt_text)
values
  ('fa000000-0000-0000-0000-0000000000c1', 'media', 'cms62/hero.jpg',
   'hero.jpg', 'image/jpeg', 'editorial', 'A watch on a dark surface'),
  ('fa000000-0000-0000-0000-0000000000c2', 'media', 'cms62/dial.webp',
   'dial.webp', 'image/webp', 'product', 'A close view of the dial');
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"fc100000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select pg_temp.assert_eq(
  'media: staff can read the library',
  $q$select count(*)::text from public.media where storage_path like 'cms62/%'$q$,
  '2'
);

select pg_temp.assert_eq(
  'media: an image records what it is for',
  $q$select count(*)::text from public.media
     where storage_path like 'cms62/%' and category = 'product'$q$,
  '1'
);

-- The library is images only, enforced by a check constraint rather than by
-- application code. This is the guarantee that a private customer document
-- cannot be filed here and then listed publicly: it cannot be filed at all.
select pg_temp.assert_raises(
  'media: a non-image cannot be stored in the library',
  $q$insert into public.media (storage_bucket, storage_path, file_name, mime_type, category)
     values ('media', 'cms62/doc.pdf', 'doc.pdf', 'application/pdf', 'editorial')$q$,
  '23514',
  '%media_mime_image_only%'
);

-- -----------------------------------------------------------------------------
-- 5. A system page cannot be unpublished by a content editor
-- -----------------------------------------------------------------------------

select pg_temp.assert_raises(
  'pages: an editor cannot unpublish a system page',
  $q$update public.pages set status = 'archived' where slug = 'cms62-system'$q$,
  '42501',
  '%system page%'
);

-- ...but an administrator, who holds settings.write, can.
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"fc100000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select pg_temp.assert_eq(
  'pages: an administrator may unpublish a system page',
  $q$with u as (
       update public.pages set status = 'archived' where slug = 'cms62-system'
       returning 1
     ) select count(*)::text from u$q$,
  '1'
);

-- Put it back so the suite is repeatable and does not leave a system page
-- archived for the next run.
reset role;
set role service_role;
update public.pages set status = 'published', published_at = coalesce(published_at, now())
 where slug = 'cms62-system';
reset role;

-- -----------------------------------------------------------------------------
-- 6. A watch photograph records which part of the watch it shows
-- -----------------------------------------------------------------------------

set role service_role;
select pg_temp.assert_eq(
  'watch imagery: the category defaults to gallery',
  $q$select (column_default = '''gallery''::watch_image_category')::text
       from information_schema.columns
      where table_schema = 'public' and table_name = 'product_images'
        and column_name = 'category'$q$,
  'true'
);
reset role;

-- -----------------------------------------------------------------------------
-- Cleanup, so a second run sees the same starting point
-- -----------------------------------------------------------------------------

set role service_role;
delete from public.media where storage_path like 'cms62/%';
delete from public.faqs where question like 'CMS62 %';
delete from public.testimonials where author like 'CMS62 %';
delete from public.navigation_items where href like '/cms62-%';
delete from public.homepage_sections where section_key like 'cms62_%';
delete from public.pages where slug like 'cms62-%';
delete from public.user_roles where user_id in (
  'fc100000-0000-0000-0000-0000000000a1',
  'fc100000-0000-0000-0000-0000000000a2'
);
delete from public.profiles where id in (
  'fc100000-0000-0000-0000-0000000000a1',
  'fc100000-0000-0000-0000-0000000000a2',
  'fc100000-0000-0000-0000-0000000000a3'
);
delete from auth.users where id in (
  'fc100000-0000-0000-0000-0000000000a1',
  'fc100000-0000-0000-0000-0000000000a2',
  'fc100000-0000-0000-0000-0000000000a3'
);
reset role;

\echo '62_cms_media: all assertions passed'

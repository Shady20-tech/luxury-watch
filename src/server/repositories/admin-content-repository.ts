import 'server-only';

import { logger } from '@/lib/logger';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Administrative reads for content, settings and media.
 *
 * -----------------------------------------------------------------------------
 * WHY THESE READS USE THE SESSION CLIENT
 * -----------------------------------------------------------------------------
 *
 * Unlike the catalogue and order repositories, nothing here is withheld from
 * `authenticated` by a column grant. Every column of `pages`, `faqs`,
 * `testimonials`, `homepage_sections`, `navigation_items`, `announcements`,
 * `site_settings`, `payment_methods`, `delivery_options` and `media` is readable
 * by a staff role, so the session client sees exactly what the admin needs and
 * the policies are the only filter. Using the service-role client here would
 * bypass a check that already gives the right answer for no benefit.
 *
 * The exception is `media`: its read policy is `is_staff()`, which is broader
 * than `content.read`. A caller reaches these functions only after the page has
 * called `requirePermission`, so the extra breadth is never the deciding check.
 *
 * Every function degrades to an empty result and logs, rather than throwing. An
 * admin list that 500s because one table is momentarily unreachable is worse than
 * one that says "nothing to show" — the editor can still act on the other lists.
 */

export type AdminPageRow = {
  id: string;
  slug: string;
  title: string;
  status: 'draft' | 'published' | 'archived';
  isSystem: boolean;
  publishedAt: string | null;
  updatedAt: string;
  seoTitle: string | null;
  seoDescription: string | null;
  excerpt: string | null;
  heroImageUrl: string | null;
  /** The raw `jsonb` body, serialised for the editor's textarea. */
  bodyText: string;
};

function logFailure(event: string, error: { message: string }) {
  logger.warn(event, { message: error.message });
}

export async function fetchAdminPages(): Promise<AdminPageRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('pages')
    .select(
      'id, slug, title, status, is_system, published_at, updated_at, seo_title, seo_description, excerpt, hero_image_url, content',
    )
    .order('is_system', { ascending: false })
    .order('slug');

  if (error) {
    logFailure('admin.pages_load_failed', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status as AdminPageRow['status'],
    isSystem: row.is_system,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    excerpt: row.excerpt,
    heroImageUrl: row.hero_image_url,
    bodyText: JSON.stringify(row.content ?? [], null, 2),
  }));
}

export async function fetchAdminPage(id: string): Promise<AdminPageRow | null> {
  const pages = await fetchAdminPages();
  return pages.find((page) => page.id === id) ?? null;
}

export type AdminFaqRow = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  sortOrder: number;
  isPublished: boolean;
};

export async function fetchAdminFaqs(): Promise<AdminFaqRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('faqs')
    .select('id, question, answer, category, sort_order, is_published')
    .order('category')
    .order('sort_order');

  if (error) {
    logFailure('admin.faqs_load_failed', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    category: row.category,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
  }));
}

export type AdminTestimonialRow = {
  id: string;
  quote: string;
  author: string;
  location: string | null;
  rating: number | null;
  sortOrder: number;
  isPublished: boolean;
};

export async function fetchAdminTestimonials(): Promise<AdminTestimonialRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('testimonials')
    .select('id, quote, author, location, rating, sort_order, is_published')
    .order('sort_order');

  if (error) {
    logFailure('admin.testimonials_load_failed', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    quote: row.quote,
    author: row.author,
    location: row.location,
    rating: row.rating,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
  }));
}

export type AdminHomepageSectionRow = {
  id: string;
  sectionKey: string;
  title: string | null;
  subtitle: string | null;
  body: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
};

export async function fetchAdminHomepageSections(): Promise<AdminHomepageSectionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('homepage_sections')
    .select(
      'id, section_key, title, subtitle, body, cta_label, cta_href, image_url, is_active, sort_order',
    )
    .order('sort_order');

  if (error) {
    logFailure('admin.homepage_load_failed', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    sectionKey: row.section_key,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    imageUrl: row.image_url,
    isActive: row.is_active,
    sortOrder: row.sort_order,
  }));
}

export type AdminNavigationRow = {
  id: string;
  location: 'header' | 'footer' | 'topbar';
  parentId: string | null;
  label: string;
  href: string;
  groupLabel: string | null;
  sortOrder: number;
  isActive: boolean;
};

export async function fetchAdminNavigation(): Promise<AdminNavigationRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('navigation_items')
    .select('id, location, parent_id, label, href, group_label, sort_order, is_active')
    .order('location')
    .order('sort_order');

  if (error) {
    logFailure('admin.navigation_load_failed', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    location: row.location as AdminNavigationRow['location'],
    parentId: row.parent_id,
    label: row.label,
    href: row.href,
    groupLabel: row.group_label,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
}

export type AdminAnnouncementRow = {
  id: string;
  message: string;
  linkLabel: string | null;
  linkUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
};

export async function fetchAdminAnnouncements(): Promise<AdminAnnouncementRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('announcements')
    .select('id, message, link_label, link_url, is_active, sort_order, starts_at, ends_at')
    .order('sort_order');

  if (error) {
    logFailure('admin.announcements_load_failed', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    message: row.message,
    linkLabel: row.link_label,
    linkUrl: row.link_url,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }));
}

export type AdminSiteSettings = {
  businessName: string;
  tagline: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressRegion: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  socialInstagram: string | null;
  socialFacebook: string | null;
  socialX: string | null;
  socialYoutube: string | null;
  ageGateEnabled: boolean;
  ageGateMinimumAge: number;
  orderConfirmationNote: string | null;
};

export async function fetchAdminSiteSettings(): Promise<AdminSiteSettings | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('site_settings')
    .select(
      'business_name, tagline, logo_url, contact_email, contact_phone, whatsapp_url, address_line1, address_line2, address_city, address_region, address_postal_code, address_country, social_instagram, social_facebook, social_x, social_youtube, age_gate_enabled, age_gate_minimum_age, order_confirmation_note',
    )
    .maybeSingle();

  if (error) {
    logFailure('admin.settings_load_failed', error);
    return null;
  }
  if (!data) return null;

  return {
    businessName: data.business_name,
    tagline: data.tagline,
    logoUrl: data.logo_url,
    contactEmail: data.contact_email,
    contactPhone: data.contact_phone,
    whatsappUrl: data.whatsapp_url,
    addressLine1: data.address_line1,
    addressLine2: data.address_line2,
    addressCity: data.address_city,
    addressRegion: data.address_region,
    addressPostalCode: data.address_postal_code,
    addressCountry: data.address_country,
    socialInstagram: data.social_instagram,
    socialFacebook: data.social_facebook,
    socialX: data.social_x,
    socialYoutube: data.social_youtube,
    ageGateEnabled: data.age_gate_enabled,
    ageGateMinimumAge: data.age_gate_minimum_age,
    orderConfirmationNote: data.order_confirmation_note,
  };
}

export type AdminEmailSettings = {
  fromName: string | null;
  replyTo: string | null;
};

/**
 * The administrator-editable half of the mail identity.
 *
 * Read with the session client: `email_settings` has an admin-only read policy
 * and no public grant, so a non-admin caller gets an empty result rather than a
 * row. The sending address itself is deliberately absent — it is an environment
 * variable tied to a domain verified with Resend, and an editable `from` address
 * would be a phishing surface.
 */
export async function fetchAdminEmailSettings(): Promise<AdminEmailSettings> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('email_settings')
    .select('from_name, reply_to')
    .maybeSingle();

  if (error) {
    logFailure('admin.email_settings_load_failed', error);
    return { fromName: null, replyTo: null };
  }

  return {
    fromName: data?.from_name ?? null,
    replyTo: data?.reply_to ?? null,
  };
}

export type AdminPaymentMethod = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  instructions: string | null;
  isEnabled: boolean;
  sortOrder: number;
};

export async function fetchAdminPaymentMethods(): Promise<AdminPaymentMethod[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('payment_methods')
    .select('id, code, label, description, instructions, is_enabled, sort_order')
    .order('sort_order');

  if (error) {
    logFailure('admin.payment_methods_load_failed', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    description: row.description,
    instructions: row.instructions,
    isEnabled: row.is_enabled,
    sortOrder: row.sort_order,
  }));
}

export type AdminDeliveryOption = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  feeCents: number;
  isEnabled: boolean;
  sortOrder: number;
};

export async function fetchAdminDeliveryOptions(): Promise<AdminDeliveryOption[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('delivery_options')
    .select('id, code, label, description, fee_cents, is_enabled, sort_order')
    .order('sort_order');

  if (error) {
    logFailure('admin.delivery_options_load_failed', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    description: row.description,
    feeCents: row.fee_cents,
    isEnabled: row.is_enabled,
    sortOrder: row.sort_order,
  }));
}

// -----------------------------------------------------------------------------
// Media
// -----------------------------------------------------------------------------

export type AdminMediaRow = {
  id: string;
  storageBucket: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  altText: string | null;
  caption: string | null;
  title: string | null;
  category: 'product' | 'editorial' | 'brand';
  createdAt: string;
};

export type MediaFilter = {
  search?: string;
  category?: 'product' | 'editorial' | 'brand';
  limit?: number;
};

/**
 * The media library, newest first.
 *
 * `search` matches the file name, the title and the alt text, because an editor
 * looking for "submariner" may have named the file anything. The term is escaped
 * for PostgREST's `or` syntax rather than interpolated raw: a comma or a
 * parenthesis in a search term would otherwise change the filter's structure.
 */
export async function fetchAdminMedia(filter: MediaFilter = {}): Promise<AdminMediaRow[]> {
  const supabase = await createSupabaseServerClient();
  const limit = Math.min(Math.max(filter.limit ?? 60, 1), 200);

  let query = supabase
    .from('media')
    .select(
      'id, storage_bucket, storage_path, file_name, mime_type, size_bytes, width, height, alt_text, caption, title, category, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (filter.category) query = query.eq('category', filter.category);

  if (filter.search) {
    const term = escapePostgrestTerm(filter.search.trim());
    if (term) {
      query = query.or(`file_name.ilike.%${term}%,title.ilike.%${term}%,alt_text.ilike.%${term}%`);
    }
  }

  const { data, error } = await query;
  if (error) {
    logFailure('admin.media_load_failed', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    altText: row.alt_text,
    caption: row.caption,
    title: row.title,
    category: row.category as AdminMediaRow['category'],
    createdAt: row.created_at,
  }));
}

/**
 * Strip the characters PostgREST reads as structure from a search term.
 *
 * `,` separates the members of an `or`, `(` and `)` group them, and `*` is a
 * wildcard. Leaving any of them in lets a search box change the shape of the
 * query rather than the value of a match. `%` is kept because it is the ILIKE
 * wildcard the caller may legitimately want, and `_` likewise.
 */
function escapePostgrestTerm(term: string): string {
  return term.replace(/[,()*\\]/g, '').slice(0, 100);
}

'use server';

import { revalidatePath } from 'next/cache';

import {
  announcementFormSchema,
  deliveryOptionFormSchema,
  faqFormSchema,
  homepageSectionFormSchema,
  mediaMetadataSchema,
  navigationItemFormSchema,
  pageFormSchema,
  parseOptionalDate,
  emailSettingsFormSchema,
  paymentMethodFormSchema,
  siteSettingsFormSchema,
  testimonialFormSchema,
} from '@/lib/admin/content-validation';
import {
  collectMediaReferences,
  describeReferences,
  referencesFor,
} from '@/lib/admin/media-references';
import { adminFieldErrors, type AdminFormState } from '@/lib/admin/validation';
import { logger } from '@/lib/logger';
import { SITEMAP_PATH } from '@/lib/seo/sitemap';
import { createSupabaseServerClientWritable } from '@/lib/supabase/server';
import { AdminPermissionError, requirePermission } from '@/server/services/admin-authorization';

/**
 * Content-management server actions.
 *
 * The five-step order documented in `admin-actions.ts` applies unchanged:
 * authorise, parse, write, audit, revalidate. The reasoning lives there rather
 * than here.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS DIFFERENT FROM THE CATALOGUE ACTIONS
 * -----------------------------------------------------------------------------
 *
 * There is no status-transition function for content, so a publish is a plain
 * column update. That is acceptable because a page's `published_at` is not
 * constrained the way a product's is: `pages_published_requires_timestamp` needs
 * the timestamp only when the status is already `published`, and a page that
 * goes straight from draft to published can carry both in one statement.
 *
 * Every content write revalidates the layout as well as the page. The public
 * chrome (header, footer, announcement bar) is rendered from a cached layout with
 * `revalidate = 300`, so a navigation edit would otherwise take up to five
 * minutes to appear. `revalidatePath('/', 'layout')` is what makes the editor see
 * their change immediately — it is the documented obligation in AGENTS.md and the
 * reason it is called here rather than left to chance.
 */

function refusal(): AdminFormState {
  return {
    status: 'error',
    message: 'You do not have permission to perform that action.',
  };
}

function databaseMessage(error: { code?: string; message: string }, fallback: string): string {
  // `P0001` is a raise from one of our functions, written for a person. `23505`
  // is a unique violation, which for a slug means "that address is taken" and is
  // worth saying; everything else stays generic.
  if (error.code === 'P0001') return error.message;
  if (error.code === '23505') return 'That address is already in use. Choose another slug.';
  return fallback;
}

/**
 * Write an audit row for a content change.
 *
 * `entityId` is a `uuid` in `admin_audit_logs`, and a singleton settings row has
 * no uuid to name. Passing the string `'singleton'` used to be attempted, and it
 * failed at the RPC with `invalid input syntax for type uuid` — the error was
 * logged as `admin.audit_write_failed` and the save reported success, so every
 * settings change went unrecorded. `null` is the honest value: the constraint on
 * `admin_audit_logs` pairs a null `entity_id` with the `entity_type`, which still
 * names what changed, and the actor and action are recorded.
 */
async function writeAudit(
  action: string,
  entityType: string,
  entityId: string | null,
  changes?: Record<string, unknown>,
): Promise<void> {
  const supabase = await createSupabaseServerClientWritable();
  const { error } = await supabase.rpc('admin_write_audit_log', {
    p_action: action,
    p_entity_type: entityType,
    // The generated types declare `p_entity_id` as a non-null string because it
    // is a `uuid` parameter, but a `uuid` argument is nullable at runtime and the
    // table's own constraint allows a null id alongside a non-null entity type.
    p_entity_id: entityId as string,
    p_changes: (changes ?? null) as never,
  });
  if (error) {
    logger.error('admin.audit_write_failed', { action, entityType, message: error.message });
  }
}

/** Revalidate the public chrome and the pages a content change can reach. */
function revalidateContent(...paths: string[]) {
  revalidatePath('/', 'layout');
  revalidatePath('/admin/settings');
  for (const path of paths) revalidatePath(path);
}

/** Read the form as a plain object, so absent fields stay absent. */
function formValues(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData);
}

// -----------------------------------------------------------------------------
// FAQs
// -----------------------------------------------------------------------------

export async function saveFaqAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const parsed = faqFormSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const supabase = await createSupabaseServerClientWritable();

  const row = {
    question: values.question,
    answer: values.answer,
    category: values.category,
    sort_order: values.sortOrder ?? 0,
    is_published: values.isPublished,
  };

  const { data, error } = values.id
    ? await supabase.from('faqs').update(row).eq('id', values.id).select('id').maybeSingle()
    : await supabase.from('faqs').insert(row).select('id').single();

  if (error || !data) {
    logger.error('admin.faq_save_failed', { message: error?.message ?? 'no row returned' });
    return {
      status: 'error',
      message: databaseMessage(error ?? { message: '' }, 'The question could not be saved.'),
    };
  }

  await writeAudit(values.id ? 'faq.updated' : 'faq.created', 'faq', data.id, {
    question: values.question,
    published: values.isPublished,
  });
  revalidateContent('/pages/faq', '/admin/settings/faqs');

  return { status: 'success', message: values.id ? 'Question saved.' : 'Question added.' };
}

export async function deleteFaqAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { status: 'error', message: 'No question was selected.' };

  const supabase = await createSupabaseServerClientWritable();
  const { error } = await supabase.from('faqs').delete().eq('id', id);

  if (error) {
    logger.error('admin.faq_delete_failed', { message: error.message });
    return { status: 'error', message: 'The question could not be removed.' };
  }

  await writeAudit('faq.deleted', 'faq', id);
  revalidateContent('/pages/faq', '/admin/settings/faqs');
  return { status: 'success', message: 'Question removed.' };
}

// -----------------------------------------------------------------------------
// Testimonials
// -----------------------------------------------------------------------------

export async function saveTestimonialAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const parsed = testimonialFormSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const supabase = await createSupabaseServerClientWritable();

  const row = {
    quote: values.quote,
    author: values.author,
    location: values.location ?? null,
    rating: values.rating ?? null,
    sort_order: values.sortOrder ?? 0,
    is_published: values.isPublished,
  };

  const { data, error } = values.id
    ? await supabase.from('testimonials').update(row).eq('id', values.id).select('id').maybeSingle()
    : await supabase.from('testimonials').insert(row).select('id').single();

  if (error || !data) {
    logger.error('admin.testimonial_save_failed', { message: error?.message ?? 'no row returned' });
    return { status: 'error', message: 'The testimonial could not be saved.' };
  }

  await writeAudit(
    values.id ? 'testimonial.updated' : 'testimonial.created',
    'testimonial',
    data.id,
    {
      published: values.isPublished,
    },
  );
  revalidateContent('/', '/admin/settings/testimonials');

  return { status: 'success', message: values.id ? 'Testimonial saved.' : 'Testimonial added.' };
}

export async function deleteTestimonialAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { status: 'error', message: 'No testimonial was selected.' };

  const supabase = await createSupabaseServerClientWritable();
  const { error } = await supabase.from('testimonials').delete().eq('id', id);

  if (error) {
    logger.error('admin.testimonial_delete_failed', { message: error.message });
    return { status: 'error', message: 'The testimonial could not be removed.' };
  }

  await writeAudit('testimonial.deleted', 'testimonial', id);
  revalidateContent('/', '/admin/settings/testimonials');
  return { status: 'success', message: 'Testimonial removed.' };
}

// -----------------------------------------------------------------------------
// Pages
// -----------------------------------------------------------------------------

export async function savePageAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const parsed = pageFormSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const supabase = await createSupabaseServerClientWritable();

  // A page that becomes published for the first time needs a timestamp; a page
  // that stays published keeps the one it had, so its position in a "recently
  // updated" list does not jump every time a typo is fixed.
  const base = {
    slug: values.slug,
    title: values.title,
    excerpt: values.excerpt ?? null,
    hero_image_url: values.heroImageUrl ?? null,
    content: values.body as never,
    status: values.status,
    seo_title: values.seoTitle ?? null,
    seo_description: values.seoDescription ?? null,
  };

  if (values.id) {
    const { data: existing } = await supabase
      .from('pages')
      .select('published_at')
      .eq('id', values.id)
      .maybeSingle();

    const publishedAt =
      values.status === 'published' ? (existing?.published_at ?? new Date().toISOString()) : null;

    const { error } = await supabase
      .from('pages')
      .update({ ...base, published_at: publishedAt })
      .eq('id', values.id);

    if (error) {
      logger.error('admin.page_update_failed', { message: error.message });
      return { status: 'error', message: databaseMessage(error, 'The page could not be saved.') };
    }

    await writeAudit('page.updated', 'page', values.id, {
      slug: values.slug,
      status: values.status,
    });
  } else {
    const { data, error } = await supabase
      .from('pages')
      .insert({
        ...base,
        published_at: values.status === 'published' ? new Date().toISOString() : null,
      })
      .select('id')
      .single();

    if (error || !data) {
      logger.error('admin.page_create_failed', { message: error?.message ?? 'no row returned' });
      return {
        status: 'error',
        message: databaseMessage(error ?? { message: '' }, 'The page could not be created.'),
      };
    }

    await writeAudit('page.created', 'page', data.id, { slug: values.slug });
  }

  revalidateContent('/pages', `/pages/${values.slug}`, '/admin/settings/pages');
  // A published page is a sitemap entry, so saving one can add, move or remove
  // a URL there. FAQ and testimonial edits do not change sitemap membership and
  // deliberately do not pay for this.
  revalidatePath(SITEMAP_PATH);
  return { status: 'success', message: 'Page saved.' };
}

export async function deletePageAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { status: 'error', message: 'No page was selected.' };

  const supabase = await createSupabaseServerClientWritable();
  const { data: page } = await supabase
    .from('pages')
    .select('slug, is_system')
    .eq('id', id)
    .maybeSingle();

  if (page?.is_system) {
    // A system page backs a fixed route. Removing it would break a footer link
    // and a URL a customer may have bookmarked. Archiving is the supported
    // action, and it needs `settings.write` (see the trigger in migration 0022).
    return {
      status: 'error',
      message: 'This page backs a fixed route and cannot be deleted. Archive it instead.',
    };
  }

  const { error } = await supabase.from('pages').delete().eq('id', id);
  if (error) {
    logger.error('admin.page_delete_failed', { message: error.message });
    return { status: 'error', message: 'The page could not be removed.' };
  }

  await writeAudit('page.deleted', 'page', id);
  revalidateContent('/pages', '/admin/settings/pages');
  // A deleted page must stop being advertised immediately, not at the next
  // hourly window — otherwise the sitemap lists a URL that now 404s.
  revalidatePath(SITEMAP_PATH);
  return { status: 'success', message: 'Page removed.' };
}

// -----------------------------------------------------------------------------
// Homepage sections
// -----------------------------------------------------------------------------

export async function saveHomepageSectionAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const parsed = homepageSectionFormSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const supabase = await createSupabaseServerClientWritable();

  const { error } = await supabase
    .from('homepage_sections')
    .update({
      title: values.title ?? null,
      subtitle: values.subtitle ?? null,
      body: values.body ?? null,
      cta_label: values.ctaLabel ?? null,
      cta_href: values.ctaHref ?? null,
      image_url: values.imageUrl ?? null,
      is_active: values.isActive,
      sort_order: values.sortOrder ?? 0,
    })
    .eq('id', values.id);

  if (error) {
    logger.error('admin.homepage_section_save_failed', { message: error.message });
    return { status: 'error', message: 'The section could not be saved.' };
  }

  await writeAudit('homepage_section.updated', 'homepage_section', values.id, {
    isActive: values.isActive,
  });
  revalidateContent('/', '/admin/settings/homepage');
  return { status: 'success', message: 'Section saved.' };
}

// -----------------------------------------------------------------------------
// Navigation
// -----------------------------------------------------------------------------

export async function saveNavigationItemAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const parsed = navigationItemFormSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const supabase = await createSupabaseServerClientWritable();

  const row = {
    location: values.location,
    label: values.label,
    href: values.href,
    group_label: values.groupLabel ?? null,
    sort_order: values.sortOrder ?? 0,
    is_active: values.isActive,
  };

  const { data, error } = values.id
    ? await supabase
        .from('navigation_items')
        .update(row)
        .eq('id', values.id)
        .select('id')
        .maybeSingle()
    : await supabase.from('navigation_items').insert(row).select('id').single();

  if (error || !data) {
    logger.error('admin.navigation_save_failed', { message: error?.message ?? 'no row returned' });
    return { status: 'error', message: 'The link could not be saved.' };
  }

  await writeAudit(
    values.id ? 'navigation.updated' : 'navigation.created',
    'navigation_item',
    data.id,
    {
      label: values.label,
      location: values.location,
    },
  );
  revalidateContent('/admin/settings/navigation');
  return { status: 'success', message: 'Link saved.' };
}

export async function deleteNavigationItemAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { status: 'error', message: 'No link was selected.' };

  const supabase = await createSupabaseServerClientWritable();
  const { error } = await supabase.from('navigation_items').delete().eq('id', id);

  if (error) {
    logger.error('admin.navigation_delete_failed', { message: error.message });
    return { status: 'error', message: 'The link could not be removed.' };
  }

  await writeAudit('navigation.deleted', 'navigation_item', id);
  revalidateContent('/admin/settings/navigation');
  return { status: 'success', message: 'Link removed.' };
}

// -----------------------------------------------------------------------------
// Announcements
// -----------------------------------------------------------------------------

export async function saveAnnouncementAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const parsed = announcementFormSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const values = parsed.data;

  let startsAt: Date | null;
  let endsAt: Date | null;
  try {
    startsAt = parseOptionalDate(values.startsAt, 'The start time');
    endsAt = parseOptionalDate(values.endsAt, 'The end time');
  } catch (error) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: { endsAt: (error as Error).message },
    };
  }

  if (startsAt && endsAt && endsAt <= startsAt) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: { endsAt: 'The end time must be after the start time.' },
    };
  }

  const supabase = await createSupabaseServerClientWritable();
  const row = {
    message: values.message,
    link_label: values.linkLabel ?? null,
    link_url: values.linkUrl ?? null,
    is_active: values.isActive,
    sort_order: values.sortOrder ?? 0,
    starts_at: startsAt?.toISOString() ?? null,
    ends_at: endsAt?.toISOString() ?? null,
  };

  const { data, error } = values.id
    ? await supabase
        .from('announcements')
        .update(row)
        .eq('id', values.id)
        .select('id')
        .maybeSingle()
    : await supabase.from('announcements').insert(row).select('id').single();

  if (error || !data) {
    logger.error('admin.announcement_save_failed', {
      message: error?.message ?? 'no row returned',
    });
    return { status: 'error', message: 'The announcement could not be saved.' };
  }

  await writeAudit(
    values.id ? 'announcement.updated' : 'announcement.created',
    'announcement',
    data.id,
    { isActive: values.isActive },
  );
  revalidateContent('/admin/settings/announcements');
  return { status: 'success', message: 'Announcement saved.' };
}

export async function deleteAnnouncementAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { status: 'error', message: 'No announcement was selected.' };

  const supabase = await createSupabaseServerClientWritable();
  const { error } = await supabase.from('announcements').delete().eq('id', id);

  if (error) {
    logger.error('admin.announcement_delete_failed', { message: error.message });
    return { status: 'error', message: 'The announcement could not be removed.' };
  }

  await writeAudit('announcement.deleted', 'announcement', id);
  revalidateContent('/admin/settings/announcements');
  return { status: 'success', message: 'Announcement removed.' };
}

// -----------------------------------------------------------------------------
// Settings, payment methods and delivery options
//
// These require `settings.write`, which `CONTENT_MANAGER` deliberately does not
// hold. A content manager edits what the site says; an administrator edits how
// the business takes payment and where it ships. The policies in 0007 enforce the
// same split, so this guard and the database agree.
// -----------------------------------------------------------------------------

export async function saveSiteSettingsAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('settings.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const parsed = siteSettingsFormSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const supabase = await createSupabaseServerClientWritable();

  const { data, error } = await supabase
    .from('site_settings')
    .update({
      business_name: values.businessName,
      tagline: values.tagline ?? null,
      logo_url: values.logoUrl ?? null,
      contact_email: values.contactEmail ?? null,
      contact_phone: values.contactPhone ?? null,
      whatsapp_url: values.whatsappUrl ?? null,
      address_line1: values.addressLine1 ?? null,
      address_line2: values.addressLine2 ?? null,
      address_city: values.addressCity ?? null,
      address_region: values.addressRegion ?? null,
      address_postal_code: values.addressPostalCode ?? null,
      address_country: values.addressCountry ?? null,
      social_instagram: values.socialInstagram ?? null,
      social_facebook: values.socialFacebook ?? null,
      social_x: values.socialX ?? null,
      social_youtube: values.socialYoutube ?? null,
      age_gate_enabled: values.ageGateEnabled,
      age_gate_minimum_age: values.ageGateMinimumAge ?? 18,
      order_confirmation_note: values.orderConfirmationNote ?? null,
    })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    logger.error('admin.settings_save_failed', { message: error?.message ?? 'no row returned' });
    return { status: 'error', message: 'The settings could not be saved.' };
  }

  // `site_settings` is a singleton keyed by a boolean `id`, so there is no row id
  // to name in the audit. The constant is the entity's identity for the trail.
  await writeAudit('site_settings.updated', 'site_settings', null, {
    businessName: values.businessName,
  });
  revalidateContent('/admin/settings');
  return { status: 'success', message: 'Settings saved.' };
}

/**
 * Save the administrator-editable mail identity.
 *
 * `settings.write`, the same permission the other settings editors require, and
 * the same permission the `email_settings` policies demand — so a caller who
 * reaches this action without it is refused here and again by the database.
 *
 * No sender address is accepted. It is an environment variable tied to a domain
 * verified with Resend, and accepting one here would let an administrator send
 * mail from a domain the store does not own.
 */
export async function saveEmailSettingsAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('settings.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const parsed = emailSettingsFormSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const supabase = await createSupabaseServerClientWritable();

  const { data, error } = await supabase
    .from('email_settings')
    .update({
      from_name: values.fromName ?? null,
      reply_to: values.replyTo ?? null,
    })
    .eq('id', true)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    logger.error('admin.email_settings_save_failed', {
      message: error?.message ?? 'no row returned',
    });
    return { status: 'error', message: 'The email settings could not be saved.' };
  }

  await writeAudit('email_settings.updated', 'email_settings', null, {
    fromName: values.fromName ?? null,
    hasReplyTo: Boolean(values.replyTo),
  });
  revalidateContent('/admin/settings');
  return { status: 'success', message: 'Email settings saved.' };
}

export async function savePaymentMethodAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('settings.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const parsed = paymentMethodFormSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const supabase = await createSupabaseServerClientWritable();

  const { error } = await supabase
    .from('payment_methods')
    .update({
      label: values.label,
      description: values.description ?? null,
      instructions: values.instructions ?? null,
      is_enabled: values.isEnabled,
      sort_order: values.sortOrder ?? 0,
    })
    .eq('id', values.id);

  if (error) {
    logger.error('admin.payment_method_save_failed', { message: error.message });
    return { status: 'error', message: 'The payment method could not be saved.' };
  }

  await writeAudit('payment_method.updated', 'payment_method', values.id, {
    isEnabled: values.isEnabled,
  });
  revalidateContent('/checkout', '/admin/settings/payments');
  return { status: 'success', message: 'Payment method saved.' };
}

export async function saveDeliveryOptionAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('settings.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const parsed = deliveryOptionFormSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const supabase = await createSupabaseServerClientWritable();

  // The form takes whole currency units; the column is cents. Rounding here is
  // deliberate: `Math.round(19.99 * 100)` is 1999, while a bare multiply can
  // produce 1998.9999999999998 and store the wrong number.
  const feeCents = Math.round(values.feeMajor * 100);

  const { error } = await supabase
    .from('delivery_options')
    .update({
      label: values.label,
      description: values.description ?? null,
      fee_cents: feeCents,
      is_enabled: values.isEnabled,
      sort_order: values.sortOrder ?? 0,
    })
    .eq('id', values.id);

  if (error) {
    logger.error('admin.delivery_option_save_failed', { message: error.message });
    return { status: 'error', message: 'The delivery option could not be saved.' };
  }

  await writeAudit('delivery_option.updated', 'delivery_option', values.id, {
    isEnabled: values.isEnabled,
  });
  revalidateContent('/checkout', '/admin/settings/delivery');
  return { status: 'success', message: 'Delivery option saved.' };
}

// -----------------------------------------------------------------------------
// Media
// -----------------------------------------------------------------------------

/**
 * Delete an image, unless something still points at it.
 *
 * The reference check runs before the storage delete, and the storage delete runs
 * before the row delete. That order matters: if the row were removed first and
 * the storage delete failed, the library would lose the only record of an object
 * that still exists, and it could never be cleaned up. Deleting the object first
 * leaves a row pointing at nothing if the second step fails, which the next load
 * shows as a broken thumbnail the editor can re-upload — recoverable, unlike the
 * reverse.
 */
export async function deleteMediaAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const id = String(formData.get('id') ?? '');
  if (!id) return { status: 'error', message: 'No image was selected.' };

  const supabase = await createSupabaseServerClientWritable();

  const { data: asset, error: loadError } = await supabase
    .from('media')
    .select('id, storage_bucket, storage_path')
    .eq('id', id)
    .maybeSingle();

  if (loadError || !asset) {
    return { status: 'error', message: 'That image could not be found.' };
  }

  // Gather every stored reference. Reading four tables on a delete is cheap and
  // happens once per click; the alternative is a broken image on a live page.
  const [products, pages, sections, settings] = await Promise.all([
    supabase.from('products').select('title, og_image_url').not('og_image_url', 'is', null),
    supabase.from('pages').select('title, hero_image_url, content'),
    supabase
      .from('homepage_sections')
      .select('section_key, image_url')
      .not('image_url', 'is', null),
    supabase.from('site_settings').select('logo_url').maybeSingle(),
  ]);

  const references = collectMediaReferences({
    products: (products.data ?? []).map((row) => ({
      title: row.title,
      ogImageUrl: row.og_image_url,
    })),
    pages: (pages.data ?? []).map((row) => ({
      title: row.title,
      heroImageUrl: row.hero_image_url,
      bodyText: JSON.stringify(row.content ?? []),
    })),
    sections: (sections.data ?? []).map((row) => ({
      sectionKey: row.section_key,
      imageUrl: row.image_url,
    })),
    settings: settings.data ? { logoUrl: settings.data.logo_url } : null,
  });

  const inUse = referencesFor(asset.storage_path, references);
  if (inUse.length > 0) {
    return { status: 'error', message: `${describeReferences(inUse)} Remove it there first.` };
  }

  const { error: storageError } = await supabase.storage
    .from(asset.storage_bucket)
    .remove([asset.storage_path]);

  if (storageError) {
    logger.error('admin.media_storage_delete_failed', { message: storageError.message });
    return { status: 'error', message: 'The image file could not be removed.' };
  }

  const { error: rowError } = await supabase.from('media').delete().eq('id', id);
  if (rowError) {
    logger.error('admin.media_row_delete_failed', { message: rowError.message });
    return { status: 'error', message: 'The image record could not be removed.' };
  }

  await writeAudit('media.deleted', 'media', id, { path: asset.storage_path });
  revalidateContent('/admin/settings/media');
  return { status: 'success', message: 'Image removed.' };
}

export async function updateMediaMetadataAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('content.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const parsed = mediaMetadataSchema.safeParse(formValues(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const supabase = await createSupabaseServerClientWritable();

  const { error } = await supabase
    .from('media')
    .update({
      title: values.title ?? null,
      alt_text: values.altText ?? null,
      caption: values.caption ?? null,
      category: values.category,
    })
    .eq('id', values.id);

  if (error) {
    logger.error('admin.media_metadata_failed', { message: error.message });
    return { status: 'error', message: 'The image details could not be saved.' };
  }

  await writeAudit('media.updated', 'media', values.id, { category: values.category });
  revalidateContent('/admin/settings/media');
  return { status: 'success', message: 'Image details saved.' };
}

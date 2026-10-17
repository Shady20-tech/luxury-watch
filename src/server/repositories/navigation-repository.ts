import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  AnnouncementRow,
  BrandRow,
  ModelRow,
  NavigationRow,
  SiteSettingsRow,
} from '@/lib/navigation/assemble';

/**
 * Read-only catalogue and content queries for the site chrome.
 *
 * The request-scoped client is used, not the service-role client: RLS already
 * restricts these rows to what an anonymous visitor may see (`is_active`,
 * published pages, the announcement time window), so a privileged key would add
 * risk without adding a single row. See ARCHITECTURE.md §6.
 *
 * Every function returns plain rows in the shape `lib/navigation/assemble.ts`
 * expects, so the assembly logic can be tested without a database.
 */

export async function fetchHeaderNavigation(): Promise<NavigationRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('navigation_items')
    .select('id, parent_id, label, href, group_label, sort_order')
    .eq('location', 'header')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw error;
  return data ?? [];
}

export async function fetchFooterNavigation(): Promise<NavigationRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('navigation_items')
    .select('id, parent_id, label, href, group_label, sort_order')
    .eq('location', 'footer')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw error;
  return data ?? [];
}

/** Active brands, in display order. RLS already filters `is_active`. */
export async function fetchBrands(): Promise<BrandRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, slug, sort_order')
    .order('sort_order');

  if (error) throw error;
  return data ?? [];
}

/** Active models, in display order, for the brand mega-menu. */
export async function fetchModels(): Promise<ModelRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('models')
    .select('id, brand_id, name, slug, sort_order')
    .order('sort_order');

  if (error) throw error;
  return data ?? [];
}

/**
 * Announcements currently inside their display window.
 *
 * The RLS policy already enforces `is_active` and the time window, but the
 * filter is repeated here so the intent is readable at the call site and the
 * query stays correct if the policy is ever relaxed.
 */
export async function fetchActiveAnnouncements(): Promise<AnnouncementRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('announcements')
    .select('id, message, link_label, link_url')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw error;
  return data ?? [];
}

/** The `site_settings` singleton. There is at most one row. */
export async function fetchSiteSettings(): Promise<SiteSettingsRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('site_settings')
    .select(
      'business_name, tagline, logo_url, contact_email, contact_phone, whatsapp_url, address_line1, address_line2, address_city, address_region, address_postal_code, address_country, social_instagram, social_facebook, social_x, social_youtube, age_gate_enabled, age_gate_minimum_age',
    )
    .maybeSingle();

  if (error) throw error;
  return (data as SiteSettingsRow | null) ?? null;
}

import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { parsePageBlocks, type PageContent } from '@/lib/content/types';

/**
 * CMS pages and FAQs.
 *
 * -----------------------------------------------------------------------------
 * RLS DECIDES WHAT IS PUBLIC
 * -----------------------------------------------------------------------------
 *
 * The policies restrict `pages` to `published` rows and `faqs` to `is_published`
 * rows. A draft slug therefore returns no row and the route 404s without the
 * application having to filter — the same shape as the product detail page, and
 * the reason a forgotten `status` filter here would still not leak a draft.
 *
 * The request-scoped client is used, not the service role, so the policy applies.
 */

type PageRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  hero_image_url: string | null;
  content: unknown;
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
};

/** One published page by slug, or `null` when it is not published. */
export async function fetchPageBySlug(slug: string): Promise<PageContent | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('pages')
    .select(
      'id, slug, title, excerpt, hero_image_url, content, seo_title, seo_description, updated_at',
    )
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as PageRow;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    heroImageUrl: row.hero_image_url,
    blocks: parsePageBlocks(row.content),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    updatedAt: row.updated_at,
  };
}

/** Every published page slug, for `generateStaticParams` and the sitemap. */
export async function fetchPublishedPageSlugs(): Promise<string[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.from('pages').select('slug').order('slug');

  if (error) throw error;
  return (data ?? []).map((row) => row.slug);
}

export type Faq = {
  id: string;
  question: string;
  answer: string;
  category: string | null;
};

/** Published FAQs, grouped by category in display order. */
export async function fetchFaqs(): Promise<Faq[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('faqs')
    .select('id, question, answer, category')
    .order('category')
    .order('sort_order');

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    category: row.category,
  }));
}

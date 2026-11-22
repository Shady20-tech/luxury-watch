import type { Metadata } from 'next';

import { CmsPage } from '@/components/content/cms-page';
import { FaqAccordion } from '@/components/content/faq-accordion';
import { JsonLd } from '@/components/seo/json-ld';
import { ErrorState } from '@/components/ui/states';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbSchema, faqPageSchema } from '@/lib/seo/schema';
import { getFaqs } from '@/server/services/content-service';

/**
 * The FAQ page.
 *
 * -----------------------------------------------------------------------------
 * THE QUESTIONS COME FROM `faqs`, NOT FROM THIS FILE
 * -----------------------------------------------------------------------------
 *
 * The acceptance criterion for this phase is explicit that the FAQ renders from
 * the database. `getFaqs` reads published rows through the cookie-aware client,
 * and RLS restricts `faqs` to `is_published`, so an unpublished question cannot
 * appear even if this page forgot to filter.
 *
 * The page renders through `CmsPage` so an owner who also writes a `faq` page row
 * gets that introduction above the list. When there is no such row, the list is
 * still shown — the questions are the content, and hiding them because the
 * introduction is missing would be the wrong way round.
 *
 * The service degrades rather than throwing, so an unreachable database produces
 * a "cannot show the answers" note instead of a 500.
 *
 * Dynamic, for the same reason as the other CMS pages: it reads cookies.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Frequently Asked Questions',
  description: 'Answers on buying, selling, shipping and servicing.',
  path: '/pages/faq',
});

export default async function Page() {
  const result = await getFaqs();

  if (result.status === 'unavailable') {
    return (
      <CmsPage
        slug="faq"
        fallback={{
          eyebrow: 'Help',
          title: 'Frequently Asked Questions',
          intro: 'Answers on buying, selling, shipping and servicing.',
        }}
      >
        <ErrorState
          title="The answers are temporarily unavailable"
          description="We could not reach our content just now. Please try again shortly, or contact us and we will help directly."
        />
      </CmsPage>
    );
  }

  const faqs = result.faqs;

  // Grouped by category, preserving the database's ordering within each group.
  const grouped = new Map<string, typeof faqs>();
  for (const faq of faqs) {
    const key = faq.category ?? 'General';
    grouped.set(key, [...(grouped.get(key) ?? []), faq]);
  }

  return (
    <CmsPage
      slug="faq"
      fallback={{
        eyebrow: 'Help',
        title: 'Frequently Asked Questions',
        intro: 'Answers on buying, selling, shipping and servicing.',
      }}
    >
      {faqs.length === 0 ? (
        <p className="text-foreground-muted text-base">
          Answers are being written. In the meantime, please get in touch and we will help directly.
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          {[...grouped.entries()].map(([category, items]) => (
            <section
              key={category}
              aria-labelledby={`faq-${category.replace(/\s+/g, '-').toLowerCase()}`}
            >
              <h2
                id={`faq-${category.replace(/\s+/g, '-').toLowerCase()}`}
                className="text-xl font-semibold"
              >
                {category}
              </h2>
              <div className="mt-4">
                <FaqAccordion faqs={items} />
              </div>
            </section>
          ))}
        </div>
      )}

      {/*
        `FAQPage` is built from the same rows the accordion renders, so the
        markup cannot describe a question the visitor cannot see. `faqPageSchema`
        returns null for an empty list, which is the honest answer when there are
        no questions: an empty `mainEntity` would be a claim about nothing.
      */}
      <JsonLd
        nodes={[
          faqPageSchema(faqs.map((faq) => ({ question: faq.question, answer: faq.answer }))),
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Frequently Asked Questions', path: '/pages/faq' },
          ]),
        ]}
      />
    </CmsPage>
  );
}

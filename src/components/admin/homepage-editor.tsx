'use client';

import { useState } from 'react';

import type { HomepageSectionKey } from '@/lib/admin/content-validation';
import { HOMEPAGE_SECTION_KEYS } from '@/lib/admin/content-validation';
import type { AdminHomepageSectionRow } from '@/server/repositories/admin-content-repository';
import { saveHomepageSectionAction } from '@/server/actions/content-actions';

import { AdminForm, CheckboxField, TextAreaField, TextField } from './form-kit';

/**
 * The homepage editor.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS NOT A FREE-FORM SECTION BUILDER
 * -----------------------------------------------------------------------------
 *
 * The public homepage is assembled by `lib/homepage/assemble.ts` from *known*
 * section keys: `hero_1`..`hero_3`, `brand_showcase`, `featured_collection` and
 * so on. The renderer decides what each key looks like and where it goes. An
 * editor can therefore change what a section says, and whether it is shown, but
 * not invent a new kind of section — because a new key would render nothing, and
 * an editor who saved one would reasonably believe the homepage had changed.
 *
 * That is a deliberate limit, not an unfinished feature. A true block builder is
 * a different piece of work; this phase makes the existing homepage editable.
 */

const SECTION_LABELS: Record<HomepageSectionKey, string> = {
  hero_1: 'Hero slide 1',
  hero_2: 'Hero slide 2',
  hero_3: 'Hero slide 3',
  brand_showcase: 'Brand showcase',
  featured_collection: 'Featured collection',
  brand_story: 'Brand story',
  new_arrivals: 'New arrivals',
  browse_brands: 'Browse brands',
  sell_trade_cta: 'Sell or trade call to action',
  sourcing_cta: 'Sourcing call to action',
  trust_1: 'Trust point 1',
  trust_2: 'Trust point 2',
  trust_3: 'Trust point 3',
  trust_4: 'Trust point 4',
  testimonials: 'Testimonials',
  newsletter: 'Newsletter',
  social: 'Social links',
  final_cta: 'Final call to action',
};

/** Which fields actually matter for a given section, so the form is not noise. */
function fieldsFor(key: string): {
  title: boolean;
  subtitle: boolean;
  body: boolean;
  cta: boolean;
  image: boolean;
} {
  if (key.startsWith('hero_')) {
    return { title: true, subtitle: true, body: true, cta: true, image: true };
  }
  if (key === 'brand_story' || key === 'featured_collection') {
    return { title: true, subtitle: true, body: true, cta: true, image: true };
  }
  if (key === 'trust_1' || key === 'trust_2' || key === 'trust_3' || key === 'trust_4') {
    return { title: true, subtitle: false, body: true, cta: false, image: false };
  }
  return { title: true, subtitle: true, body: false, cta: true, image: false };
}

export function HomepageEditor({ sections }: { sections: AdminHomepageSectionRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(sections[0]?.id ?? null);
  const selected = sections.find((section) => section.id === selectedId) ?? null;

  if (sections.length === 0) {
    return (
      <p className="text-ink-500 text-sm">
        No homepage sections exist. They are created by the database seed; run the migrations to
        restore them.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <nav aria-label="Homepage sections">
        <ul className="divide-line-200 border-line-200 divide-y rounded-2xl border">
          {sections.map((section) => {
            const label =
              SECTION_LABELS[section.sectionKey as HomepageSectionKey] ?? section.sectionKey;
            const isCurrent = section.id === selectedId;
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(section.id)}
                  aria-current={isCurrent ? 'true' : undefined}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                    isCurrent ? 'bg-surface-200 font-medium' : 'hover:bg-surface-100'
                  }`}
                >
                  <span className="min-w-0 truncate">{label}</span>
                  {!section.isActive ? (
                    <span className="text-ink-500 shrink-0 text-xs">hidden</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div>{selected ? <SectionForm key={selected.id} section={selected} /> : null}</div>
    </div>
  );
}

function SectionForm({ section }: { section: AdminHomepageSectionRow }) {
  const fields = fieldsFor(section.sectionKey);
  const label = SECTION_LABELS[section.sectionKey as HomepageSectionKey] ?? section.sectionKey;

  return (
    <section
      aria-labelledby="section-form-heading"
      className="border-line-200 rounded-2xl border p-6"
    >
      <h2 id="section-form-heading" className="mb-1 text-lg">
        {label}
      </h2>
      <p className="text-ink-500 mb-4 font-mono text-xs">{section.sectionKey}</p>

      <AdminForm
        action={saveHomepageSectionAction}
        submitLabel="Save section"
        hidden={{ id: section.id }}
      >
        {fields.title ? (
          <TextField name="title" label="Heading" maxLength={200} defaultValue={section.title} />
        ) : null}
        {fields.subtitle ? (
          <TextField
            name="subtitle"
            label="Subheading"
            maxLength={300}
            defaultValue={section.subtitle}
          />
        ) : null}
        {fields.body ? (
          <TextAreaField
            name="body"
            label="Body"
            rows={4}
            maxLength={4000}
            defaultValue={section.body}
          />
        ) : null}
        {fields.cta ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="ctaLabel"
              label="Button label"
              maxLength={80}
              defaultValue={section.ctaLabel}
            />
            <TextField
              name="ctaHref"
              label="Button link"
              hint="A path like /shop, or a full https:// URL."
              defaultValue={section.ctaHref}
            />
          </div>
        ) : null}
        {fields.image ? (
          <TextField
            name="imageUrl"
            label="Image URL"
            hint="Upload the image in the media library, then paste its public URL here."
            defaultValue={section.imageUrl}
          />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="sortOrder"
            label="Order"
            type="number"
            defaultValue={section.sortOrder}
          />
          <div className="flex items-end pb-2">
            <CheckboxField
              name="isActive"
              label="Show this section"
              defaultChecked={section.isActive}
            />
          </div>
        </div>
      </AdminForm>

      {HOMEPAGE_SECTION_KEYS.includes(section.sectionKey as HomepageSectionKey) ? null : (
        <p className="text-ink-500 mt-4 text-xs">
          This key is not one the homepage renderer knows, so editing it changes nothing on the
          site.
        </p>
      )}
    </section>
  );
}

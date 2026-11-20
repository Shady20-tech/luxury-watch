'use client';

import { useActionState, useState } from 'react';

import { FAQ_CATEGORIES, type FaqCategory } from '@/lib/admin/content-validation';
import type { AdminFormState } from '@/lib/admin/validation';
import { IDLE_ADMIN_STATE } from '@/lib/admin/validation';
import type {
  AdminAnnouncementRow,
  AdminFaqRow,
  AdminNavigationRow,
  AdminTestimonialRow,
} from '@/server/repositories/admin-content-repository';
import {
  deleteAnnouncementAction,
  deleteFaqAction,
  deleteNavigationItemAction,
  deleteTestimonialAction,
  saveAnnouncementAction,
  saveFaqAction,
  saveNavigationItemAction,
  saveTestimonialAction,
} from '@/server/actions/content-actions';

import { AdminForm, CheckboxField, SelectField, TextAreaField, TextField } from './form-kit';

/**
 * The list-and-form editors: questions, testimonials, navigation and
 * announcements.
 *
 * Each follows the same shape — a table of what exists, an "add" form, and an
 * "edit" form that appears when a row is chosen. They are Client Components only
 * because choosing a row to edit is local state; the rows themselves are fetched
 * on the server and passed in.
 *
 * A row that is being edited is rendered in a form *above* the list rather than
 * inline in the table. An editable row inside a table forces a horizontal
 * scrollbar at narrow widths and is the usual reason an admin screen is unusable
 * on a laptop. The table stays a table; the form is a form.
 */

const CATEGORY_LABELS: Record<FaqCategory, string> = {
  purchasing: 'Purchasing',
  authenticity: 'Authenticity',
  returns: 'Returns',
  shipping: 'Shipping',
  warranty: 'Warranty',
  payment: 'Payment',
  selling: 'Selling',
  trading: 'Trading',
  sourcing: 'Sourcing',
  repairs: 'Repairs',
  accounts: 'Accounts',
};

type DeleteAction = (state: AdminFormState, formData: FormData) => Promise<AdminFormState>;

/**
 * A delete button for one row.
 *
 * A bare `<form action={deleteAction}>` cannot be used: a form's `action` is a
 * one-argument function, and these actions take `(state, formData)` so they can
 * return a message. `useActionState` bridges the two and, as a bonus, lets the
 * refusal message render beside the button — which is where an editor looks when
 * a delete does not happen.
 */
function DeleteForm({ action, id, label }: { action: DeleteAction; id: string; label: string }) {
  const [state, formAction, pending] = useActionState(action, IDLE_ADMIN_STATE);

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-danger-600 text-xs underline disabled:opacity-60"
      >
        {pending ? 'Deleting…' : 'Delete'}
        <span className="sr-only"> {label}</span>
      </button>
      {state.status === 'error' && state.message ? (
        <p className="text-danger-600 mt-1 max-w-xs text-xs" role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

function RowActions({
  onEdit,
  deleteAction,
  id,
  label,
}: {
  onEdit: () => void;
  deleteAction: DeleteAction;
  id: string;
  label: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <button type="button" onClick={onEdit} className="text-ink-700 text-xs underline">
        Edit<span className="sr-only"> {label}</span>
      </button>
      <DeleteForm action={deleteAction} id={id} label={label} />
    </div>
  );
}

// -----------------------------------------------------------------------------
// FAQs
// -----------------------------------------------------------------------------

export function FaqEditor({ faqs }: { faqs: AdminFaqRow[] }) {
  const [editing, setEditing] = useState<AdminFaqRow | null>(null);

  return (
    <div className="space-y-8">
      <section aria-labelledby="faq-form-heading" className="border-line-300 rounded-md border p-6">
        <h2 id="faq-form-heading" className="mb-4 text-lg">
          {editing ? 'Edit question' : 'Add a question'}
        </h2>
        <AdminForm
          key={editing?.id ?? 'new'}
          action={saveFaqAction}
          submitLabel={editing ? 'Save question' : 'Add question'}
          hidden={editing ? { id: editing.id } : undefined}
        >
          <TextAreaField
            name="question"
            label="Question"
            required
            rows={2}
            maxLength={300}
            defaultValue={editing?.question}
          />
          <TextAreaField
            name="answer"
            label="Answer"
            required
            rows={5}
            maxLength={8000}
            defaultValue={editing?.answer}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="category"
              label="Topic"
              defaultValue={editing?.category ?? ''}
              options={[
                { value: '', label: 'No topic' },
                ...FAQ_CATEGORIES.map((category) => ({
                  value: category,
                  label: CATEGORY_LABELS[category],
                })),
              ]}
            />
            <TextField
              name="sortOrder"
              label="Order"
              type="number"
              hint="Lower numbers appear first within a topic."
              defaultValue={editing?.sortOrder ?? 0}
            />
          </div>
          <CheckboxField
            name="isPublished"
            label="Show this question on the FAQ page"
            defaultChecked={editing?.isPublished ?? true}
          />
        </AdminForm>
        {editing ? (
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="text-ink-600 mt-3 text-xs underline"
          >
            Cancel and add a new question instead
          </button>
        ) : null}
      </section>

      <section aria-labelledby="faq-list-heading">
        <h2 id="faq-list-heading" className="mb-4 text-lg">
          Questions ({faqs.length})
        </h2>
        {faqs.length === 0 ? (
          <p className="text-ink-500 text-sm">No questions yet. Add the first one above.</p>
        ) : (
          <ul className="divide-line-300 border-line-300 divide-y rounded-md border">
            {faqs.map((faq) => (
              <li key={faq.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{faq.question}</p>
                  <p className="text-ink-500 mt-1 text-xs">
                    {faq.category ? CATEGORY_LABELS[faq.category as FaqCategory] : 'No topic'} ·{' '}
                    {faq.isPublished ? 'Published' : 'Hidden'} · order {faq.sortOrder}
                  </p>
                </div>
                <RowActions
                  onEdit={() => setEditing(faq)}
                  deleteAction={deleteFaqAction}
                  id={faq.id}
                  label={faq.question}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Testimonials
// -----------------------------------------------------------------------------

export function TestimonialEditor({ testimonials }: { testimonials: AdminTestimonialRow[] }) {
  const [editing, setEditing] = useState<AdminTestimonialRow | null>(null);

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="testimonial-form-heading"
        className="border-line-300 rounded-md border p-6"
      >
        <h2 id="testimonial-form-heading" className="mb-4 text-lg">
          {editing ? 'Edit testimonial' : 'Add a testimonial'}
        </h2>
        <p className="text-ink-500 mb-4 text-sm">
          Only add a quote a customer actually gave. There is no generated copy here, and a
          testimonial that was never said is a false claim about a real person.
        </p>
        <AdminForm
          key={editing?.id ?? 'new'}
          action={saveTestimonialAction}
          submitLabel={editing ? 'Save testimonial' : 'Add testimonial'}
          hidden={editing ? { id: editing.id } : undefined}
        >
          <TextAreaField
            name="quote"
            label="Quote"
            required
            rows={4}
            maxLength={2000}
            defaultValue={editing?.quote}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="author"
              label="Author"
              required
              maxLength={120}
              defaultValue={editing?.author}
            />
            <TextField
              name="location"
              label="Location"
              maxLength={120}
              defaultValue={editing?.location}
            />
            <TextField
              name="rating"
              label="Rating"
              type="number"
              hint="1 to 5, if the customer gave one."
              defaultValue={editing?.rating ?? ''}
            />
            <TextField
              name="sortOrder"
              label="Order"
              type="number"
              defaultValue={editing?.sortOrder ?? 0}
            />
          </div>
          <CheckboxField
            name="isPublished"
            label="Show this testimonial on the site"
            defaultChecked={editing?.isPublished ?? false}
          />
        </AdminForm>
      </section>

      <section aria-labelledby="testimonial-list-heading">
        <h2 id="testimonial-list-heading" className="mb-4 text-lg">
          Testimonials ({testimonials.length})
        </h2>
        {testimonials.length === 0 ? (
          <p className="text-ink-500 text-sm">
            No testimonials yet. The site shows none until a real one is added — it does not invent
            them.
          </p>
        ) : (
          <ul className="divide-line-300 border-line-300 divide-y rounded-md border">
            {testimonials.map((testimonial) => (
              <li
                key={testimonial.id}
                className="flex flex-wrap items-start justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm">“{testimonial.quote}”</p>
                  <p className="text-ink-500 mt-1 text-xs">
                    {testimonial.author}
                    {testimonial.location ? `, ${testimonial.location}` : ''} ·{' '}
                    {testimonial.isPublished ? 'Published' : 'Hidden'}
                  </p>
                </div>
                <RowActions
                  onEdit={() => setEditing(testimonial)}
                  deleteAction={deleteTestimonialAction}
                  id={testimonial.id}
                  label={`the testimonial by ${testimonial.author}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Navigation
// -----------------------------------------------------------------------------

const LOCATION_LABELS: Record<AdminNavigationRow['location'], string> = {
  header: 'Header',
  footer: 'Footer',
  topbar: 'Top bar',
};

export function NavigationEditor({ items }: { items: AdminNavigationRow[] }) {
  const [editing, setEditing] = useState<AdminNavigationRow | null>(null);

  const groups = (['header', 'topbar', 'footer'] as const).map((location) => ({
    location,
    items: items.filter((item) => item.location === location),
  }));

  return (
    <div className="space-y-8">
      <section aria-labelledby="nav-form-heading" className="border-line-300 rounded-md border p-6">
        <h2 id="nav-form-heading" className="mb-4 text-lg">
          {editing ? 'Edit link' : 'Add a link'}
        </h2>
        <AdminForm
          key={editing?.id ?? 'new'}
          action={saveNavigationItemAction}
          submitLabel={editing ? 'Save link' : 'Add link'}
          hidden={editing ? { id: editing.id } : undefined}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              name="location"
              label="Where"
              required
              defaultValue={editing?.location ?? 'header'}
              options={(['header', 'topbar', 'footer'] as const).map((location) => ({
                value: location,
                label: LOCATION_LABELS[location],
              }))}
            />
            <TextField
              name="label"
              label="Label"
              required
              maxLength={80}
              defaultValue={editing?.label}
            />
            <TextField
              name="href"
              label="Link"
              required
              hint="A path like /shop, or a full https:// URL."
              defaultValue={editing?.href}
            />
            <TextField
              name="groupLabel"
              label="Group heading"
              hint="Optional. Footer links with the same heading are grouped together."
              maxLength={80}
              defaultValue={editing?.groupLabel}
            />
            <TextField
              name="sortOrder"
              label="Order"
              type="number"
              hint="Lower numbers appear first."
              defaultValue={editing?.sortOrder ?? 0}
            />
          </div>
          <CheckboxField
            name="isActive"
            label="Show this link"
            defaultChecked={editing?.isActive ?? true}
          />
        </AdminForm>
      </section>

      {groups.map((group) => (
        <section key={group.location} aria-labelledby={`nav-${group.location}`}>
          <h2 id={`nav-${group.location}`} className="mb-4 text-lg">
            {LOCATION_LABELS[group.location]} ({group.items.length})
          </h2>
          {group.items.length === 0 ? (
            <p className="text-ink-500 text-sm">No links in this area.</p>
          ) : (
            <ul className="divide-line-300 border-line-300 divide-y rounded-md border">
              {group.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-ink-500 mt-1 text-xs">
                      {item.href} · order {item.sortOrder}
                      {item.groupLabel ? ` · group “${item.groupLabel}”` : ''}
                      {item.isActive ? '' : ' · hidden'}
                    </p>
                  </div>
                  <RowActions
                    onEdit={() => setEditing(item)}
                    deleteAction={deleteNavigationItemAction}
                    id={item.id}
                    label={item.label}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Announcements
// -----------------------------------------------------------------------------

export function AnnouncementEditor({ announcements }: { announcements: AdminAnnouncementRow[] }) {
  const [editing, setEditing] = useState<AdminAnnouncementRow | null>(null);

  /** `datetime-local` wants `YYYY-MM-DDTHH:mm`, not a full ISO string. */
  const localValue = (iso: string | null) => (iso ? iso.slice(0, 16) : '');

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="announcement-form-heading"
        className="border-line-300 rounded-md border p-6"
      >
        <h2 id="announcement-form-heading" className="mb-4 text-lg">
          {editing ? 'Edit announcement' : 'Add an announcement'}
        </h2>
        <AdminForm
          key={editing?.id ?? 'new'}
          action={saveAnnouncementAction}
          submitLabel={editing ? 'Save announcement' : 'Add announcement'}
          hidden={editing ? { id: editing.id } : undefined}
        >
          <TextAreaField
            name="message"
            label="Message"
            required
            rows={2}
            maxLength={300}
            defaultValue={editing?.message}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="linkLabel"
              label="Link label"
              maxLength={80}
              defaultValue={editing?.linkLabel}
            />
            <TextField
              name="linkUrl"
              label="Link"
              hint="A path like /shop, or a full https:// URL."
              defaultValue={editing?.linkUrl}
            />
            <TextField
              name="startsAt"
              label="Starts"
              type="datetime-local"
              hint="Leave blank to start immediately."
              defaultValue={localValue(editing?.startsAt ?? null)}
            />
            <TextField
              name="endsAt"
              label="Ends"
              type="datetime-local"
              hint="Leave blank to run indefinitely."
              defaultValue={localValue(editing?.endsAt ?? null)}
            />
            <TextField
              name="sortOrder"
              label="Order"
              type="number"
              defaultValue={editing?.sortOrder ?? 0}
            />
          </div>
          <CheckboxField
            name="isActive"
            label="Show this announcement"
            defaultChecked={editing?.isActive ?? true}
          />
        </AdminForm>
      </section>

      <section aria-labelledby="announcement-list-heading">
        <h2 id="announcement-list-heading" className="mb-4 text-lg">
          Announcements ({announcements.length})
        </h2>
        {announcements.length === 0 ? (
          <p className="text-ink-500 text-sm">No announcements. The message bar is not shown.</p>
        ) : (
          <ul className="divide-line-300 border-line-300 divide-y rounded-md border">
            {announcements.map((announcement) => (
              <li
                key={announcement.id}
                className="flex flex-wrap items-start justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm">{announcement.message}</p>
                  <p className="text-ink-500 mt-1 text-xs">
                    {announcement.isActive ? 'Active' : 'Hidden'}
                    {announcement.startsAt ? ` · from ${announcement.startsAt.slice(0, 10)}` : ''}
                    {announcement.endsAt ? ` · until ${announcement.endsAt.slice(0, 10)}` : ''}
                  </p>
                </div>
                <RowActions
                  onEdit={() => setEditing(announcement)}
                  deleteAction={deleteAnnouncementAction}
                  id={announcement.id}
                  label={announcement.message}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

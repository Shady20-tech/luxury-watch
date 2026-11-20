import type { Metadata } from 'next';

import { AdminPageHeader, EmptyState } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { requirePermission } from '@/server/services/admin-authorization';

/**
 * Content and settings.
 *
 * This page is deliberately a statement of what is *not* here yet, rather than a
 * screen of disabled inputs. A form whose controls do nothing is worse than an
 * honest gap: it reads as a bug to the person using it, and it invites them to
 * believe a change was saved.
 *
 * The database already holds the tables these editors will write — `site_settings`,
 * `navigation_items`, `pages`, `brands`, `collections` — and the navigation cache
 * rule is documented: editing navigation or settings must call
 * `revalidatePath('/', 'layout')`, or the editor will not see their change for
 * five minutes. That is the reason this is a separate piece of work and not a
 * field bolted onto the dashboard.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Content & settings · Administration');

const PLANNED = [
  {
    title: 'Site settings',
    detail:
      'Contact details, opening hours, announcement bar and the default social image. Stored in `site_settings`.',
  },
  {
    title: 'Navigation',
    detail:
      'Header, footer and top-bar links, stored in `navigation_items`. Saving must revalidate the root layout or the change will not appear for five minutes.',
  },
  {
    title: 'Brands, collections and models',
    detail:
      'The taxonomy the catalogue filters are built from. Products reference these by id, so a rename is safe and a delete must be refused while products use it.',
  },
  {
    title: 'Static pages',
    detail: 'About, FAQ, shipping, warranty and the other editorial pages, stored in `pages`.',
  },
];

export default async function AdminSettingsPage() {
  await requirePermission('content.read');

  return (
    <div>
      <AdminPageHeader
        title="Content & settings"
        description="Editors for the site's own copy and taxonomy."
      />

      <EmptyState title="Editors are not built yet">
        <p>
          The administration area currently covers the catalogue, inventory and orders. These
          editors are the next piece of work; the tables they will write already exist.
        </p>
      </EmptyState>

      <ul className="mt-6 space-y-3">
        {PLANNED.map((item) => (
          <li key={item.title} className="border-line-300 bg-surface-0 rounded-md border p-4">
            <h2 className="text-sm font-semibold">{item.title}</h2>
            <p className="text-foreground-muted mt-1 text-sm">{item.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

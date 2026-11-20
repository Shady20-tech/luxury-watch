import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminPageHeader } from '@/components/admin/ui';
import { noIndexMetadata } from '@/lib/seo/metadata';
import { requirePermission } from '@/server/services/admin-authorization';

/**
 * The content-management index.
 *
 * Every link below is rendered only when the caller holds the permission the
 * destination requires, so a content manager sees the editors they may use and an
 * administrator sees all of them. A link that leads to a refusal is worse than no
 * link: it reads as a broken feature rather than a boundary.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = noIndexMetadata('Content & settings · Administration');

type Section = {
  href: string;
  title: string;
  detail: string;
  permission: 'content.read' | 'settings.write';
};

const SECTIONS: Section[] = [
  {
    href: '/admin/settings/homepage',
    title: 'Homepage',
    detail: 'Hero slides, section copy, calls to action and the featured collection.',
    permission: 'content.read',
  },
  {
    href: '/admin/settings/pages',
    title: 'Pages',
    detail: 'About, shipping, warranty and any other editorial page, as structured blocks.',
    permission: 'content.read',
  },
  {
    href: '/admin/settings/faqs',
    title: 'Questions',
    detail: 'The questions shown on the FAQ page, grouped by topic and published individually.',
    permission: 'content.read',
  },
  {
    href: '/admin/settings/testimonials',
    title: 'Testimonials',
    detail:
      'Quotes from real customers. Nothing is generated here — a quote is either given or absent.',
    permission: 'content.read',
  },
  {
    href: '/admin/settings/navigation',
    title: 'Navigation',
    detail: 'Header, footer and top-bar links, with the order they appear in.',
    permission: 'content.read',
  },
  {
    href: '/admin/settings/announcements',
    title: 'Announcements',
    detail: 'The message bar, optionally limited to a date window.',
    permission: 'content.read',
  },
  {
    href: '/admin/settings/media',
    title: 'Media library',
    detail: 'Uploaded images, their alt text and what they are used for.',
    permission: 'content.read',
  },
  {
    href: '/admin/settings/payments',
    title: 'Payment methods',
    detail: 'The offline methods a customer may choose, and the instructions each one shows.',
    permission: 'settings.write',
  },
  {
    href: '/admin/settings/delivery',
    title: 'Delivery options',
    detail: 'Collection, insured shipping and any other fulfilment option, with its fee.',
    permission: 'settings.write',
  },
  {
    href: '/admin/settings/site',
    title: 'Site settings',
    detail: 'Business name, contact details, social links and the age gate.',
    permission: 'settings.write',
  },
];

export default async function AdminContentPage() {
  const identity = await requirePermission('content.read');

  const visible = SECTIONS.filter((section) => identity.permissions.has(section.permission));

  return (
    <div>
      <AdminPageHeader
        title="Content & settings"
        description="Everything the storefront says, edited here rather than in the code."
      />

      <ul className="grid gap-3 sm:grid-cols-2">
        {visible.map((section) => (
          <li key={section.href} className="border-line-300 bg-surface-0 rounded-md border p-4">
            <h2 className="text-sm font-semibold">
              <Link href={section.href} className="hover:underline">
                {section.title}
              </Link>
            </h2>
            <p className="text-foreground-muted mt-1 text-sm">{section.detail}</p>
          </li>
        ))}
      </ul>

      {visible.length < SECTIONS.length ? (
        <p className="text-ink-500 mt-6 text-sm">
          Payment methods, delivery options and site settings require the settings permission and
          are hidden from this account.
        </p>
      ) : null}
    </div>
  );
}

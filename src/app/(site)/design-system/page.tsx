import type { Metadata } from 'next';
import Link from 'next/link';

import { AnnouncementBar } from '@/components/chrome/announcement-bar';
import { HeaderActions } from '@/components/chrome/header-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MediaFrame } from '@/components/ui/media-frame';
import { Card, SectionHeading } from '@/components/ui/section';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { buildMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildMetadata({
  title: 'Design System',
  description: 'The typography, colour, spacing and component foundations of the storefront.',
  path: '/design-system',
  robots: { index: false, follow: false },
});

const palette = [
  { name: 'Ink 950', token: '--color-ink-950', className: 'bg-ink-950', note: 'Display text' },
  { name: 'Ink 900', token: '--color-ink-900', className: 'bg-ink-900', note: 'Body text' },
  { name: 'Ink 500', token: '--color-ink-500', className: 'bg-ink-500', note: 'Muted text' },
  { name: 'Line 200', token: '--color-line-200', className: 'bg-line-200', note: 'Hairlines' },
  {
    name: 'Surface 100',
    token: '--color-surface-100',
    className: 'bg-surface-100',
    note: 'Panels',
  },
  { name: 'Gold 500', token: '--color-gold-500', className: 'bg-gold-500', note: 'Accent' },
  { name: 'Gold 700', token: '--color-gold-700', className: 'bg-gold-700', note: 'Accent text' },
  { name: 'Gold 100', token: '--color-gold-100', className: 'bg-gold-100', note: 'Accent tint' },
];

/**
 * Design system reference page.
 *
 * This page is the visual-direction deliverable for Phase 3 made inspectable: it
 * renders every token and every primitive in one place, so the direction can be
 * reviewed in the browser rather than in a document, and a regression in a token
 * is visible immediately.
 *
 * It is `noindex, nofollow` and is not linked from the navigation. It is a
 * development and review surface, not a public page.
 */
export default function DesignSystemPage() {
  return (
    <div className="pb-24">
      <section className="border-line-200 bg-surface-50 border-b">
        <div className="container-page py-16 lg:py-20">
          <p className="eyebrow">Foundation</p>
          <h1 className="mt-4 max-w-3xl text-4xl sm:text-5xl">Design system</h1>
          <p className="text-foreground-muted mt-6 max-w-prose text-lg">
            Restrained gold over neutral surfaces, a serif display face against a humanist sans, and
            generous space around the product. Every token and primitive used by the storefront is
            shown below.
          </p>
        </div>
      </section>

      {/* Typography */}
      <section className="border-line-200 border-b">
        <div className="container-page py-14">
          <SectionHeading eyebrow="Typography" title="Type scale" />
          <div className="mt-10 space-y-8">
            <div className="border-line-200 border-b pb-6">
              <p className="eyebrow">Display · Cardo</p>
              <p className="font-display mt-3 text-5xl sm:text-6xl">A considered timepiece</p>
            </div>
            <div className="border-line-200 grid gap-8 border-b pb-6 sm:grid-cols-2">
              <div>
                <p className="eyebrow">Heading 1</p>
                <h1 className="mt-3 text-4xl">The Collection</h1>
              </div>
              <div>
                <p className="eyebrow">Heading 2</p>
                <h2 className="mt-3 text-3xl">Featured references</h2>
              </div>
              <div>
                <p className="eyebrow">Heading 3</p>
                <h3 className="mt-3 text-2xl">Complications</h3>
              </div>
              <div>
                <p className="eyebrow">Eyebrow</p>
                <p className="eyebrow mt-3">Shop by brand</p>
              </div>
            </div>
            <div>
              <p className="eyebrow">Body · Nunito</p>
              <p className="text-foreground mt-3 max-w-prose">
                Body copy is set in Nunito at a comfortable measure. Paragraphs use pretty wrapping
                so a line does not end on a lone word, and headings use balance so a two-line
                heading splits evenly.
              </p>
              <p className="text-foreground-muted mt-3 max-w-prose text-sm">
                Muted body copy for supporting detail, captions and secondary metadata.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Palette */}
      <section className="border-line-200 border-b">
        <div className="container-page py-14">
          <SectionHeading
            eyebrow="Colour"
            title="Palette"
            description="Neutral surfaces carry the layout; gold is an accent used sparingly for emphasis and never as body text."
          />
          <ul className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {palette.map((swatch) => (
              <li key={swatch.token}>
                <div className={`border-line-200 h-20 rounded-sm border ${swatch.className}`} />
                <p className="mt-3 text-sm font-semibold">{swatch.name}</p>
                <p className="text-foreground-muted text-xs">{swatch.note}</p>
                <code className="text-ink-500 mt-1 block font-mono text-[0.625rem]">
                  {swatch.token}
                </code>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Buttons */}
      <section className="border-line-200 border-b">
        <div className="container-page py-14">
          <SectionHeading
            eyebrow="Primitives"
            title="Buttons"
            description="One primary action per view; everything else is quiet. Loading and disabled states keep their accessible name."
          />
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
        </div>
      </section>

      {/* Badges */}
      <section className="border-line-200 border-b">
        <div className="container-page py-14">
          <SectionHeading eyebrow="Primitives" title="Badges" />
          <div className="mt-10 flex flex-wrap gap-3">
            <Badge>Pre-owned</Badge>
            <Badge variant="accent">New arrival</Badge>
            <Badge variant="soldOut">Sold out</Badge>
            <Badge variant="success">In stock</Badge>
            <Badge variant="danger">Reserved</Badge>
          </div>
        </div>
      </section>

      {/* Forms */}
      <section className="border-line-200 border-b">
        <div className="container-page py-14">
          <SectionHeading
            eyebrow="Primitives"
            title="Form fields"
            description="Labels, hints and errors are wired with aria-describedby and aria-invalid by the primitive, so a field cannot be shipped unlabelled."
          />
          <div className="mt-10 grid max-w-lg gap-6">
            <Input id="ds-name" label="Full name" placeholder="Jane Appleton" />
            <Input
              id="ds-email"
              type="email"
              label="Email address"
              hint="We reply within one business day."
              placeholder="you@example.com"
            />
            <Input
              id="ds-error"
              label="Reference number"
              defaultValue="not-a-reference"
              error="That reference could not be found. Check the number on the warranty card."
            />
          </div>
        </div>
      </section>

      {/* Media */}
      <section className="border-line-200 border-b">
        <div className="container-page py-14">
          <SectionHeading
            eyebrow="Primitives"
            title="Product presentation"
            description="A consistent frame with generous space. A missing image renders an honest placeholder rather than a broken box or a stock photo."
          />
          {/* The cards below use invented reference numbers and prices. They are
              a typographic and spacing reference for the product card, not
              catalogue data, and this page is `noindex` and unlinked. Real
              product cards are built in Phase 5 and read every field from the
              database. */}
          <p className="text-ink-500 mt-4 text-xs tracking-[0.14em] uppercase">
            Illustrative layout only — not real inventory
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card interactive className="overflow-hidden">
              <MediaFrame src={null} alt="" ratio="4/5" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg">Reference 126500LN</h3>
                  <Badge variant="accent">New</Badge>
                </div>
                <p className="text-foreground-muted mt-2 text-sm">
                  Cosmograph Daytona · Steel · 40mm
                </p>
                <p className="mt-3 text-sm font-semibold">Price on request</p>
              </div>
            </Card>
            <Card interactive className="overflow-hidden">
              <MediaFrame src={null} alt="" ratio="4/5" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg">Reference 5711/1A</h3>
                  <Badge variant="soldOut">Sold out</Badge>
                </div>
                <p className="text-foreground-muted mt-2 text-sm">Nautilus · Steel · 40mm</p>
                <p className="mt-3 text-sm font-semibold">£0,000</p>
              </div>
            </Card>
            <Card className="overflow-hidden">
              <Skeleton className="aspect-4/5 w-full rounded-none" />
              <div className="space-y-3 p-5">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* States */}
      <section className="border-line-200 border-b">
        <div className="container-page py-14">
          <SectionHeading eyebrow="Primitives" title="Empty and error states" />
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <EmptyState
              title="No timepieces match those filters"
              description="Try widening the price band or clearing the dial colour."
              action={
                <Button variant="secondary" asChild>
                  <Link href="/design-system">Clear filters</Link>
                </Button>
              }
            />
            <ErrorState
              title="We could not load this section"
              description="The catalogue is temporarily unavailable. Please try again shortly."
              action={
                <Button variant="secondary" asChild>
                  <Link href="/design-system">Retry</Link>
                </Button>
              }
            />
          </div>
        </div>
      </section>

      {/* Chrome */}
      <section className="border-line-200 border-b">
        <div className="container-page py-14">
          <SectionHeading
            eyebrow="Chrome"
            title="Announcement bar and header actions"
            description="The announcement bar rotates, pauses on hover and focus, and does not rotate at all under prefers-reduced-motion."
          />
          <div className="border-line-200 mt-10 overflow-hidden rounded-md border">
            <AnnouncementBar
              announcements={[
                {
                  id: 'ds-1',
                  message:
                    'Every timepiece is inspected and authenticated by our watchmakers before it is offered.',
                  linkLabel: 'How we authenticate',
                  linkUrl: '/pages/about',
                },
                {
                  id: 'ds-2',
                  message: 'Payment is arranged directly with the boutique.',
                  linkLabel: null,
                  linkUrl: null,
                },
              ]}
            />
            <div className="bg-surface-0 flex items-center justify-end gap-3 p-4">
              <span className="text-foreground-muted mr-auto text-sm">
                Header actions, counts shown only when above zero
              </span>
              <HeaderActions cartCount={2} wishlistCount={0} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="container-page py-14">
          <SectionHeading
            eyebrow="Motion"
            title="Restrained by default"
            description="Transitions are short, and the global reduced-motion rule collapses every animation and transition on the site to effectively zero."
          />
          <dl className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              ['Fast', '--duration-fast · 120ms', 'Colour and border changes'],
              ['Base', '--duration-base · 200ms', 'Panel and chevron transitions'],
              ['Slow', '--duration-slow · 320ms', 'Reserved for large surfaces'],
            ].map(([term, token, note]) => (
              <div key={term} className="border-line-200 border-t pt-4">
                <dt className="text-sm font-semibold">{term}</dt>
                <dd className="text-foreground-muted mt-1 text-sm">{note}</dd>
                <dd>
                  <code className="text-ink-500 font-mono text-[0.625rem]">{token}</code>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}

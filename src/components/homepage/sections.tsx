import { ArrowRight, Gem, PackageCheck, ShieldCheck, Wallet } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/section';
import { MediaFrame } from '@/components/ui/media-frame';
import type {
  BrandTile,
  CopySection,
  ProductRail,
  Testimonial,
  TrustItem,
} from '@/lib/homepage/types';
import { cn } from '@/lib/utils';

import { ProductGrid } from './product-card';

/**
 * The homepage's editorial sections.
 *
 * Each one takes its content as props and renders nothing when that content is
 * absent. The rule throughout is that a section is driven by a database row,
 * never by copy embedded here: if the row is missing, the section is missing.
 * That is what lets the owner switch a section off by deactivating it in the
 * admin rather than needing a code change.
 */

/** A heading-and-copy block with an optional image and CTA. */
export function CopyBlock({
  section,
  align = 'start',
  tone = 'plain',
  headingAs = 'h2',
}: {
  section: CopySection;
  align?: 'start' | 'center';
  tone?: 'plain' | 'muted' | 'inverted';
  headingAs?: 'h2' | 'h3';
}) {
  const Tag = headingAs;

  return (
    <div
      className={cn('flex flex-col gap-6', align === 'center' ? 'items-center text-center' : '')}
    >
      {section.eyebrow ? (
        <p className={cn('eyebrow', tone === 'inverted' && 'text-gold-300')}>{section.eyebrow}</p>
      ) : null}
      <Tag className="text-3xl sm:text-4xl">{section.title}</Tag>
      {section.body ? (
        <p
          className={cn(
            'max-w-prose text-base',
            tone === 'inverted' ? 'text-surface-200' : 'text-foreground-muted',
          )}
        >
          {section.body}
        </p>
      ) : null}
      {section.cta ? (
        <Button asChild variant={tone === 'inverted' ? 'primary' : 'secondary'}>
          <Link href={section.cta.href}>{section.cta.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A product rail backed by a real collection.
 *
 * When the collection exists but has no published products, the rail renders an
 * honest empty state naming the collection. It does not quietly disappear: a
 * section the owner configured and that shows nothing is a merchandising
 * problem they need to see, not one to hide.
 */
export function ProductRailSection({ rail }: { rail: ProductRail }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {rail.eyebrow ? <p className="eyebrow">{rail.eyebrow}</p> : null}
          <h2 className="mt-3 text-2xl sm:text-3xl">{rail.title}</h2>
          {rail.body ? (
            <p className="text-foreground-muted mt-4 max-w-prose text-base">{rail.body}</p>
          ) : null}
        </div>
        {rail.cta ? (
          <Link
            href={rail.cta.href}
            className="text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 inline-flex shrink-0 items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
          >
            {rail.cta.label}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      {rail.products.length > 0 ? (
        <ProductGrid products={rail.products} />
      ) : (
        <p className="border-line-200 text-foreground-muted rounded-md border border-dashed px-6 py-10 text-center text-sm">
          {rail.collectionSlug
            ? `No published watches in the “${rail.collectionSlug}” collection yet.`
            : 'No collection is linked to this section yet.'}
        </p>
      )}
    </div>
  );
}

/** The brand showcase: one tile per active brand. */
export function BrandShowcase({ brands }: { brands: BrandTile[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {brands.map((brand) => (
        <li key={brand.id}>
          <Card interactive className="h-full">
            <Link
              href={brand.href}
              className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-700 flex h-full flex-col p-6"
            >
              <span className="font-display text-xl">{brand.name}</span>
              {brand.modelNames.length > 0 ? (
                <span className="text-foreground-muted mt-2 text-sm">
                  {brand.modelNames.join(' · ')}
                </span>
              ) : null}
              {brand.productCount !== null ? (
                <span className="text-ink-500 mt-auto pt-6 text-xs font-semibold tracking-[0.14em] uppercase">
                  {brand.productCount === 1
                    ? '1 watch'
                    : `${brand.productCount.toLocaleString('en-US')} watches`}
                </span>
              ) : null}
            </Link>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/**
 * Icons for the trust items, keyed by the section's `subtitle`.
 *
 * A missing key falls back to a neutral icon rather than rendering nothing, so
 * an owner adding a value proposition still gets a complete-looking tile.
 */
const TRUST_ICON = {
  Authenticity: ShieldCheck,
  Honesty: Gem,
  Payment: Wallet,
  Service: PackageCheck,
} as const;

/** The trust / value-proposition row. */
export function TrustRow({ items }: { items: TrustItem[] }) {
  return (
    <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const Icon =
          (item.label && TRUST_ICON[item.label as keyof typeof TRUST_ICON]) || ShieldCheck;
        return (
          <li key={item.id} className="flex flex-col">
            <Icon aria-hidden="true" className="text-gold-700 h-6 w-6" />
            <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
            {item.body ? <p className="text-foreground-muted mt-2 text-sm">{item.body}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Testimonials.
 *
 * Rendered only when real rows exist. There is no placeholder quote and no
 * fallback review: the reference site shows customer praise, but we have no
 * real customers to quote, and fabricating one would be a lie told to a
 * prospective buyer. When the list is empty this returns `null`, and the caller
 * does not render the section heading either.
 */
export function TestimonialList({ testimonials }: { testimonials: Testimonial[] }) {
  if (testimonials.length === 0) return null;

  return (
    <ul className="grid gap-6 lg:grid-cols-3">
      {testimonials.map((testimonial) => (
        <li key={testimonial.id}>
          <Card className="flex h-full flex-col p-6">
            <blockquote className="font-display text-lg leading-relaxed">
              “{testimonial.quote}”
            </blockquote>
            <footer className="text-foreground-muted mt-auto pt-6 text-sm">
              <span className="text-foreground font-medium">{testimonial.author}</span>
              {testimonial.location ? <span>, {testimonial.location}</span> : null}
            </footer>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/**
 * A two-column editorial block: copy beside an image.
 *
 * The image is optional. Without one the copy takes the full width, which is
 * the honest layout when the owner has not uploaded a photograph yet — better
 * than an empty grey panel standing in for a picture that does not exist.
 */
export function EditorialSplit({
  section,
  imageFirst = false,
}: {
  section: CopySection;
  imageFirst?: boolean;
}) {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-2">
      <div className={cn(imageFirst && 'lg:order-2')}>
        <CopyBlock section={section} />
      </div>
      {section.imageUrl ? (
        <div className={cn(imageFirst && 'lg:order-1')}>
          <MediaFrame src={section.imageUrl} alt="" ratio="4/5" />
        </div>
      ) : null}
    </div>
  );
}

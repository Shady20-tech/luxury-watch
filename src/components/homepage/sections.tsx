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
 *
 * -----------------------------------------------------------------------------
 * TONE
 * -----------------------------------------------------------------------------
 *
 * The reference alternates full-bleed near-black sections with off-white ones,
 * and the contrast between them is most of the visual character. Sections
 * therefore take a `tone` describing the ground they sit on, and the colour
 * classes follow from it. Naming the ground rather than the colour means a
 * section cannot end up with dark text on a dark panel by accident.
 */
type Tone = 'light' | 'night';

/** The text and surface classes for each ground, in one place. */
const TONE = {
  light: {
    heading: 'text-ink-950',
    body: 'text-foreground-muted',
    eyebrow: 'text-ink-500',
    muted: 'text-ink-500',
    link: 'text-accent-text',
    outline: 'focus-visible:outline-gold-700',
  },
  night: {
    heading: 'text-on-night',
    body: 'text-on-night-muted',
    eyebrow: 'text-gold-300',
    muted: 'text-on-night-muted',
    link: 'text-gold-300',
    outline: 'focus-visible:outline-gold-300',
  },
} as const;

/** A heading-and-copy block with an optional image and CTA. */
export function CopyBlock({
  section,
  align = 'start',
  tone = 'light',
  headingAs = 'h2',
}: {
  section: CopySection;
  align?: 'start' | 'center';
  tone?: Tone;
  headingAs?: 'h2' | 'h3';
}) {
  const Tag = headingAs;
  const t = TONE[tone];

  return (
    <div
      className={cn('flex flex-col gap-6', align === 'center' ? 'items-center text-center' : '')}
    >
      {section.eyebrow ? (
        <p className={cn('eyebrow', tone === 'night' && 'text-gold-300')}>{section.eyebrow}</p>
      ) : null}
      <Tag className={cn('text-3xl sm:text-4xl', t.heading)}>{section.title}</Tag>
      {section.body ? <p className={cn('max-w-prose text-base', t.body)}>{section.body}</p> : null}
      {section.cta ? (
        <Button asChild variant={tone === 'night' ? 'onNight' : 'secondary'}>
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
 *
 * The reference puts a row of brand tabs above the grid. They are rendered here
 * as real links to the brand pages rather than as a client-side filter. That is
 * the honest choice: a filter built from the products already on the page can
 * only ever hide rows, and a visitor who follows a tab to the brand page gets
 * the full, correctly-paginated catalogue for that brand instead of the four
 * items that happened to be in this rail.
 */
export function ProductRailSection({ rail, tone = 'light' }: { rail: ProductRail; tone?: Tone }) {
  const t = TONE[tone];
  const brands = railBrands(rail);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {rail.eyebrow ? (
            <p className={cn('eyebrow', tone === 'night' && 'text-gold-300')}>{rail.eyebrow}</p>
          ) : null}
          <h2 className={cn('mt-3 text-2xl sm:text-3xl', t.heading)}>{rail.title}</h2>
          {rail.body ? (
            <p className={cn('mt-4 max-w-prose text-base', t.body)}>{rail.body}</p>
          ) : null}
        </div>
        {rail.cta ? (
          <Link
            href={rail.cta.href}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2',
              t.link,
              t.outline,
            )}
          >
            {rail.cta.label}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      {/* Brand tabs, when the rail spans more than one brand. A rail from a
          single brand has nothing to switch between, so it renders no tabs
          rather than one lonely one. */}
      {brands.length > 1 ? (
        <nav aria-label={`Browse by brand: ${rail.title}`} className="-mt-2">
          <ul className="border-line-200 flex flex-wrap gap-x-6 gap-y-2 border-b">
            {brands.map((brand) => (
              <li key={brand.href}>
                <Link
                  href={brand.href}
                  className={cn(
                    'text-ink-700 hover:text-ink-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 -mb-px inline-block border-b-2 border-transparent py-2.5 text-sm font-medium tracking-wide transition-colors hover:border-gold-500',
                    tone === 'night' && 'text-on-night-muted hover:text-on-night',
                  )}
                >
                  {brand.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {rail.products.length > 0 ? (
        <ProductGrid products={rail.products} />
      ) : (
        <p
          className={cn(
            'rounded-md border border-dashed px-6 py-10 text-center text-sm',
            tone === 'night'
              ? 'border-white/20 text-on-night-muted'
              : 'border-line-200 text-foreground-muted',
          )}
        >
          {rail.collectionSlug
            ? `No published watches in the “${rail.collectionSlug}” collection yet.`
            : 'No collection is linked to this section yet.'}
        </p>
      )}
    </div>
  );
}

/** The distinct brands present in a rail, in first-seen order. */
function railBrands(rail: ProductRail): { name: string; href: string }[] {
  const seen = new Map<string, string>();
  for (const product of rail.products) {
    if (!product.brandName || seen.has(product.brandName)) continue;
    seen.set(product.brandName, `/brands/${slugifyBrand(product.brandName)}`);
  }
  return [...seen].map(([name, href]) => ({ name, href }));
}

/**
 * A brand name as it appears in a URL.
 *
 * The catalogue's brand slugs are lower-case and hyphenated, so this reproduces
 * that shape from the display name. It is only used for the rail's tab links;
 * anything that must resolve exactly uses the slug from the database.
 */
function slugifyBrand(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The brand showcase, as a logo strip.
 *
 * The reference shows brand names as a monochrome wordmark row rather than a
 * grid of bordered cards, which reads as a masthead instead of a second product
 * grid. That is reproduced here, with the count and model families kept as a
 * secondary line so the tile still carries the information the card did.
 */
export function BrandShowcase({ brands }: { brands: BrandTile[] }) {
  return (
    <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-line-200 sm:grid-cols-3 lg:grid-cols-4">
      {brands.map((brand) => (
        <li key={brand.id} className="bg-surface-0">
          <Link
            href={brand.href}
            className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-700 flex h-full flex-col items-center justify-center px-6 py-10 text-center transition-colors hover:bg-surface-50"
          >
            <span className="font-display text-ink-950 text-xl tracking-[0.06em] uppercase">
              {brand.name}
            </span>
            {brand.modelNames.length > 0 ? (
              <span className="text-foreground-muted mt-3 text-xs tracking-[0.12em] uppercase">
                {brand.modelNames.join(' · ')}
              </span>
            ) : null}
            {brand.productCount !== null ? (
              <span className="text-ink-500 mt-4 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase">
                {brand.productCount === 1
                  ? '1 watch'
                  : `${brand.productCount.toLocaleString('en-US')} watches`}
              </span>
            ) : null}
          </Link>
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

/**
 * The trust / value-proposition row.
 *
 * The reference centres each item with the icon above the heading, on the light
 * ground directly beneath the dark hero. `tone` follows the section convention
 * so the row can also sit on a dark panel.
 *
 * Each item is an `h2`: the row sits directly beneath the page `h1` with no
 * intervening section heading, so an `h3` skipped a level. axe only checks this
 * in a browser, which is why jsdom stayed green while the audit failed.
 */
export function TrustRow({ items, tone = 'light' }: { items: TrustItem[]; tone?: Tone }) {
  const t = TONE[tone];

  return (
    <ul className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const Icon =
          (item.label && TRUST_ICON[item.label as keyof typeof TRUST_ICON]) || ShieldCheck;
        return (
          <li key={item.id} className="flex flex-col items-center text-center">
            <Icon aria-hidden="true" className="text-gold-700 h-7 w-7" />
            <h2 className={cn('mt-5 text-base font-semibold', t.heading)}>{item.title}</h2>
            {item.body ? <p className={cn('mt-2.5 text-sm', t.body)}>{item.body}</p> : null}
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

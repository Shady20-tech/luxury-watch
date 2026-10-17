import type { Metadata } from 'next';
import Link from 'next/link';

import { JsonLd } from '@/components/seo/json-ld';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MediaFrame } from '@/components/ui/media-frame';
import { Card, SectionHeading } from '@/components/ui/section';
import { getEnvReport, getPublicEnv } from '@/lib/env';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbSchema } from '@/lib/seo/schema';
import { getChrome } from '@/server/services/chrome-service';

export const metadata: Metadata = buildMetadata({
  title: `${getPublicEnv().siteName} — Luxury Watches`,
  description:
    'A curated luxury watch storefront. Browse timepieces, request pricing and availability, and arrange payment directly with the boutique.',
  path: '/',
});

/**
 * Home page.
 *
 * The composition follows the reference's section order — a full-bleed hero, a
 * shop-by-brand strip, a services triptych, and a trust section — rebuilt with
 * our own layout, typography and copy.
 *
 * What it deliberately does NOT do is invent products. The catalogue arrives in
 * Phase 5, so the featured section shows the real state of the catalogue: the
 * brands that exist in the database, with an honest note that stock is being
 * added. A grid of fabricated watches with fabricated prices would be the
 * single most misleading thing this page could do.
 *
 * Payment is described as it actually is: arranged offline with the boutique.
 */
export default async function HomePage() {
  const env = getPublicEnv();
  const report = getEnvReport();
  const chrome = await getChrome();

  const brandPanels = chrome.header.flatMap((item) => (item.kind === 'brands' ? item.panels : []));
  const configured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

  return (
    <>
      {/* Hero */}
      <section className="border-line-200 bg-surface-50 border-b">
        <div className="container-page grid gap-12 py-16 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <p className="eyebrow">Independent watch retail</p>
            <h1 className="mt-5 text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
              Timepieces chosen one at a time
            </h1>
            <p className="text-foreground-muted mt-6 max-w-prose text-lg">
              We buy, sell and source luxury watches, and we tell you what we actually think. Every
              piece is inspected and authenticated before it is offered, and every price is
              discussed with you directly.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/collections/all">Browse the collection</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/services/sell-trade">Sell or trade your watch</Link>
              </Button>
            </div>

            <dl className="border-line-200 mt-12 grid gap-6 border-t pt-8 sm:grid-cols-3">
              {[
                ['Authenticated', 'Inspected by our watchmakers'],
                ['Manual payment', 'Arranged with the boutique'],
                ['Personal service', 'One point of contact throughout'],
              ].map(([term, description]) => (
                <div key={term}>
                  <dt className="text-sm font-semibold">{term}</dt>
                  <dd className="text-foreground-muted mt-1 text-sm">{description}</dd>
                </div>
              ))}
            </dl>
          </div>

          <MediaFrame
            src={null}
            alt="A luxury wristwatch photographed on a neutral background"
            ratio="4/5"
            sizes="(min-width: 1024px) 50vw, 100vw"
            priority
          />
        </div>
      </section>

      {/* Shop by brand */}
      <section className="border-line-200 border-b">
        <div className="container-page py-16 lg:py-20">
          <SectionHeading
            eyebrow="The houses"
            title="Shop by brand"
            description="The brands in our catalogue, each with the model families we handle."
            action={{ label: 'All brands', href: '/brands' }}
          />

          {brandPanels.length > 0 ? (
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {brandPanels.map((brand) => (
                <li key={brand.id}>
                  <Card interactive className="h-full p-6">
                    <Link
                      href={brand.href}
                      className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-700"
                    >
                      <h3 className="font-display text-xl">{brand.label}</h3>
                    </Link>
                    <ul className="mt-4 space-y-1.5">
                      {brand.columns
                        .flatMap((column) => column.links)
                        .slice(0, 4)
                        .map((link) => (
                          <li key={link.id}>
                            <Link
                              href={link.href}
                              className="text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 text-sm"
                            >
                              {link.label}
                            </Link>
                          </li>
                        ))}
                    </ul>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-line-200 text-foreground-muted mt-10 rounded-sm border border-dashed p-8 text-center text-sm">
              {configured
                ? 'No brands are published yet. They will appear here as soon as they are added in the admin.'
                : 'Brands will appear here once the database connection is configured.'}
            </p>
          )}

          <p className="text-ink-500 mt-6 text-sm">
            Individual pieces are being catalogued. The full listing, with filters and photography,
            arrives with the catalogue phase.
          </p>
        </div>
      </section>

      {/* Services */}
      <section className="border-line-200 border-b">
        <div className="container-page py-16 lg:py-20">
          <SectionHeading
            eyebrow="What we do"
            title="More than a shop"
            description="Three services our clients use most, each handled by the same small team."
          />
          <ul className="mt-10 grid gap-6 lg:grid-cols-3">
            {[
              {
                title: 'Sell or trade',
                href: '/services/sell-trade',
                body: 'Send us the details of your watch and we will come back with a realistic figure, usually within a day.',
              },
              {
                title: 'Watch sourcing',
                href: '/services/sourcing',
                body: 'Looking for a specific reference or configuration? We will search our network and tell you what it will cost.',
              },
              {
                title: 'Repair & restoration',
                href: '/services/repair-restoration',
                body: 'Servicing, repair and sympathetic restoration by watchmakers we have worked with for years.',
              },
            ].map((service) => (
              <li key={service.href}>
                <Card interactive className="h-full p-7">
                  <h3 className="font-display text-xl">
                    <Link
                      href={service.href}
                      className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-700"
                    >
                      {service.title}
                    </Link>
                  </h3>
                  <p className="text-foreground-muted mt-3 text-sm leading-relaxed">
                    {service.body}
                  </p>
                  <p className="text-accent-text mt-5 text-sm font-medium">
                    <Link href={service.href} className="underline-offset-4 hover:underline">
                      Learn more
                    </Link>
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How buying works — states the no-online-payment model plainly */}
      <section className="border-line-200 border-b">
        <div className="container-page py-16 lg:py-20">
          <SectionHeading
            eyebrow="How it works"
            title="How buying works here"
            description="No online checkout. You choose a piece, we confirm it, and payment is arranged directly."
          />
          <ol className="mt-10 grid gap-8 lg:grid-cols-4">
            {[
              [
                'Choose a piece',
                'Find something you like and send us an enquiry, or ask for pricing if it is on request.',
              ],
              [
                'We confirm availability',
                'A person checks the piece, its condition and its documentation, and replies with the details.',
              ],
              [
                'You choose how to pay',
                'Bank transfer, or another method the boutique has enabled. This site never takes card details.',
              ],
              [
                'Delivery or collection',
                'Insured shipping or collection in person, whichever suits you.',
              ],
            ].map(([step, body], index) => (
              <li key={step} className="border-line-200 border-t pt-5">
                <p className="text-ink-500 font-mono text-xs">
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className="mt-3 text-lg">{step}</h3>
                <p className="text-foreground-muted mt-2 text-sm leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>

          <p className="border-gold-300 bg-gold-100 text-gold-900 mt-10 rounded-sm border px-5 py-4 text-sm">
            This website does not process payments and never asks for card details. Orders are
            requests: nothing is charged, and nothing is confirmed, until you and the boutique have
            spoken.
          </p>
        </div>
      </section>

      {/* Build status — honest, and removed once the catalogue is live */}
      {!configured || report.issues.length > 0 ? (
        <section>
          <div className="container-page py-16">
            <SectionHeading
              eyebrow="Site status"
              title="This site is still being built"
              description="Rather than pretend otherwise, here is exactly what is and is not connected yet."
            />
            <ul className="mt-10 grid gap-4 sm:grid-cols-2">
              {[
                {
                  label: 'Database connection',
                  ready: configured,
                  detail: 'Catalogue, navigation and settings are read from Supabase PostgreSQL.',
                },
                {
                  label: 'Navigation',
                  ready: chrome.source === 'database',
                  detail:
                    chrome.source === 'database'
                      ? 'The menu is being read from the database.'
                      : 'The menu is showing built-in defaults until the database is connected.',
                },
                {
                  label: 'Transactional email',
                  ready: false,
                  detail: 'Resend handles order-request and enquiry notifications.',
                },
                {
                  label: 'Catalogue',
                  ready: false,
                  detail: 'Products, photography and filtering arrive with the catalogue phase.',
                },
              ].map((item) => (
                <li
                  key={item.label}
                  className="border-line-200 bg-surface-50 rounded-md border p-5"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant={item.ready ? 'success' : 'neutral'}>
                      {item.ready ? 'Connected' : 'Pending'}
                    </Badge>
                    <p className="text-sm font-semibold">{item.label}</p>
                  </div>
                  <p className="text-foreground-muted mt-2 text-sm">{item.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <JsonLd nodes={[breadcrumbSchema([{ name: 'Home', path: '/' }])]} />
    </>
  );
}

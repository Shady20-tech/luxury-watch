import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHero } from '@/components/layout/page-hero';
import { SITE_PHOTOGRAPHY } from '@/lib/images/site-photography';
import { ContactForm } from '@/components/service/contact-form';
import { getChrome } from '@/server/services/chrome-service';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * The contact page.
 *
 * -----------------------------------------------------------------------------
 * THE DETAILS COME FROM `site_settings`, NOT FROM THIS FILE
 * -----------------------------------------------------------------------------
 *
 * The address, phone, email and social links are read from the same `getChrome`
 * the header and footer use, so there is one source for them. When the owner
 * fills them in, this page and the footer both change; when they are empty, both
 * show an honest empty state rather than an invented address.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS PAGE IS DYNAMIC
 * -----------------------------------------------------------------------------
 *
 * `getChrome` reads `site_settings` through the cookie-aware server client, so
 * the route is dynamic. The export is stated rather than inferred: a route that
 * reads cookies but is classified static fails at request time in a production
 * build, which is exactly the failure the product page hit in Phase 6.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildMetadata({
  title: 'Contact',
  description:
    'Ask about a piece, book an appointment or start a service request. Send us a message and a member of the team will reply.',
  path: '/contact',
});

export default async function Page() {
  const chrome = await getChrome();
  const { identity } = chrome;

  const hasDetails =
    identity.addressLines.length > 0 || identity.contactEmail || identity.contactPhone;

  return (
    <div>
      <PageHero
        eyebrow="The Boutique"
        title="Contact"
        intro="Ask about a piece, request an appointment or start a service request. Send us a message and a member of the team will reply."
        photograph={SITE_PHOTOGRAPHY.pocketWatch}
        eyebrowTone="emerald"
      />

      <div className="container-page grid gap-10 py-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-16 lg:py-14 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-16">
        <section aria-labelledby="contact-form-heading">
          <h2 id="contact-form-heading" className="text-xl font-semibold">
            Send us a message
          </h2>
          <div className="mt-6">
            <ContactForm />
          </div>
        </section>

        <aside className="flex flex-col gap-8" aria-label="Boutique details">
          <section aria-labelledby="visit-heading">
            <h2 id="visit-heading" className="text-base font-semibold">
              Visit the boutique
            </h2>
            {identity.addressLines.length > 0 ? (
              <address className="text-foreground-muted mt-2 text-sm not-italic">
                {identity.addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            ) : (
              <p className="text-foreground-muted mt-2 text-sm">
                Boutique address is not configured yet.
              </p>
            )}
          </section>

          <section aria-labelledby="reach-heading">
            <h2 id="reach-heading" className="text-base font-semibold">
              Information
            </h2>
            {hasDetails ? (
              <dl className="text-foreground-muted mt-2 flex flex-col gap-1 text-sm">
                {identity.contactEmail ? (
                  <div className="flex gap-2">
                    <dt className="sr-only">Email</dt>
                    <dd>
                      <a href={`mailto:${identity.contactEmail}`} className="underline">
                        {identity.contactEmail}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {identity.contactPhone ? (
                  <div className="flex gap-2">
                    <dt className="sr-only">Phone</dt>
                    <dd>
                      <a href={`tel:${identity.contactPhone}`} className="underline">
                        {identity.contactPhone}
                      </a>
                    </dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              // Outside the `dl`, not inside it: a `dl` may only directly contain
              // `dt`, `dd`, `div`, `script` or `template`, and a stray `p` is an
              // axe `definition-list` violation.
              <p className="text-foreground-muted mt-2 text-sm">
                Contact details are not configured yet.
              </p>
            )}
          </section>

          {identity.socials.length > 0 ? (
            <section aria-labelledby="social-heading">
              <h2 id="social-heading" className="text-base font-semibold">
                Social media
              </h2>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {identity.socials.map((social) => (
                  <li key={social.href}>
                    <a
                      href={social.href}
                      className="underline"
                      rel="noopener noreferrer nofollow"
                      target="_blank"
                    >
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="appointment-heading">
            <h2 id="appointment-heading" className="text-base font-semibold">
              Prefer to visit?
            </h2>
            <p className="text-foreground-muted mt-2 text-sm">
              You can request an appointment and we will confirm a time with you.
            </p>
            <p className="mt-2 text-sm">
              <Link href="/appointments" className="text-accent-text underline">
                Request an appointment
              </Link>
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

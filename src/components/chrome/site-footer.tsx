import Link from 'next/link';

import { FooterColumns, NewsletterForm } from '@/components/chrome/footer-parts';
import { Wordmark } from '@/components/chrome/wordmark';
import type { ChromeData } from '@/lib/navigation/types';

/**
 * Site footer.
 *
 * Content is entirely database-driven where the data exists: the description,
 * contact block and social links come from `site_settings`, and the link columns
 * from `navigation_items` where `location = 'footer'`. The disclaimer is
 * deliberately hardcoded rather than editable, because it is a legal statement
 * about the business's relationship with the watch brands, not marketing copy —
 * it should not be possible to delete it from a CMS by accident.
 *
 * The trademark disclaimer is important and specific: this is an independent
 * retailer, not an authorised dealer, and the brand names are the property of
 * their owners. Claiming otherwise would be both false and legally exposed.
 */
export function SiteFooter({ data }: { data: ChromeData }) {
  const year = new Date().getFullYear();
  const { identity } = data;

  return (
    <footer className="border-line-200 bg-surface-50 border-t">
      <div className="container-page py-14 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_2fr_1.5fr]">
          <div>
            <Wordmark identity={identity} />
            <p className="text-foreground-muted mt-4 max-w-xs text-sm">
              {identity.tagline ??
                'A curated selection of luxury timepieces, offered with honest advice and personal service.'}
            </p>

            <h2 className="mt-8 text-xs font-semibold tracking-[0.18em] uppercase">
              Join the list
            </h2>
            <p className="text-foreground-muted mt-2 text-sm">
              New arrivals, notable references and boutique news. No more than once a month.
            </p>
            <NewsletterForm />
          </div>

          <FooterColumns columns={data.footerColumns} />

          <div>
            <h2 className="text-xs font-semibold tracking-[0.18em] uppercase">Visit or contact</h2>
            <address className="text-foreground-muted mt-4 space-y-1 text-sm not-italic">
              {identity.addressLines.length > 0 ? (
                identity.addressLines.map((line) => <p key={line}>{line}</p>)
              ) : (
                <p>Boutique address is not configured yet.</p>
              )}
              {identity.contactPhone ? (
                <p className="pt-2">
                  <a
                    href={`tel:${identity.contactPhone.replace(/\s+/g, '')}`}
                    className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                  >
                    {identity.contactPhone}
                  </a>
                </p>
              ) : null}
              {identity.contactEmail ? (
                <p>
                  <a
                    href={`mailto:${identity.contactEmail}`}
                    className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                  >
                    {identity.contactEmail}
                  </a>
                </p>
              ) : null}
            </address>

            {identity.socials.length > 0 ? (
              <ul className="mt-5 flex flex-wrap gap-4">
                {identity.socials.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 text-sm"
                    >
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            {identity.whatsappUrl ? (
              <Link
                href={identity.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 mt-5 inline-block text-sm font-medium underline-offset-4 hover:underline"
              >
                Message us on WhatsApp
              </Link>
            ) : null}
          </div>
        </div>

        <div className="border-line-200 mt-12 border-t pt-8">
          <p className="text-ink-500 text-xs leading-relaxed">
            {identity.businessName} is an independent retailer of pre-owned and new luxury watches.
            We are not affiliated with, authorised by, or an official dealer of any watch
            manufacturer. All brand names, model names and trademarks are the property of their
            respective owners and are used here for identification purposes only. Nothing on this
            site constitutes an offer capable of acceptance; all orders are subject to confirmation
            by us. Payment is arranged directly with the boutique — this site does not process
            payments.
          </p>
          <p className="text-ink-500 mt-4 text-xs">
            © {year} {identity.businessName}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

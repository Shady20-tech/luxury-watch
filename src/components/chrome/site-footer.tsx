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
 *
 * -----------------------------------------------------------------------------
 * WHY THE FOOTER IS DARK GLASS
 * -----------------------------------------------------------------------------
 *
 * It closes the page on the same near-black band the header opens it with, so
 * the site has a top and a bottom rather than fading into a grey strip. It is
 * deliberately *not* the header's 0.8 alpha: a footer sits on the page ground
 * rather than over a hero photograph, so there is nothing worth showing through
 * it, and a lighter panel would put white page content behind the legal text and
 * drag the composite towards mid-grey. At 0.94 the glass still reads as a lit
 * surface — a gold hairline and a faint sheen along the top edge — while the
 * ground behind it barely participates. `glass-panel-footer` owns that value and
 * `tests/design-tokens.test.ts` composites it over the lightest plausible
 * backdrop before trusting it.
 */
export function SiteFooter({ data }: { data: ChromeData }) {
  const year = new Date().getFullYear();
  const { identity } = data;

  return (
    <footer className="relative isolate mt-16">
      {/* The one ornament on the footer: a gold hairline that separates the panel
          from the page ground without a second border colour. */}
      <div
        aria-hidden="true"
        className="via-gold-500/40 h-px w-full bg-gradient-to-r from-transparent to-transparent"
      />

      <div className="glass-panel-footer border-t border-white/10">
        <div className="container-page py-14 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[1.5fr_2fr_1.5fr]">
            <div>
              <Wordmark identity={identity} tone="light" />
              <p className="text-on-night-muted mt-4 max-w-xs text-sm">
                {identity.tagline ??
                  'A curated selection of luxury timepieces, offered with honest advice and personal service.'}
              </p>

              <h2 className="text-on-night mt-8 text-xs font-semibold tracking-[0.18em] uppercase">
                Join the list
              </h2>
              <p className="text-on-night-muted mt-2 text-sm">
                New arrivals, notable references and boutique news. No more than once a month.
              </p>
              <NewsletterForm tone="night" />
            </div>

            <FooterColumns columns={data.footerColumns} tone="night" />

            <div>
              <h2 className="text-on-night text-xs font-semibold tracking-[0.18em] uppercase">
                Visit or contact
              </h2>
              <address className="text-on-night-muted mt-4 space-y-1 text-sm not-italic">
                {identity.addressLines.length > 0 ? (
                  identity.addressLines.map((line) => <p key={line}>{line}</p>)
                ) : (
                  <p>Boutique address is not configured yet.</p>
                )}
                {identity.contactPhone ? (
                  <p className="pt-2">
                    <a
                      href={`tel:${identity.contactPhone.replace(/\s+/g, '')}`}
                      className="hover:text-on-night focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300"
                    >
                      {identity.contactPhone}
                    </a>
                  </p>
                ) : null}
                {identity.contactEmail ? (
                  <p>
                    <a
                      href={`mailto:${identity.contactEmail}`}
                      className="hover:text-on-night focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 break-all"
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
                        className="text-on-night-muted hover:text-on-night focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 text-sm"
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
                  className="text-gold-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 mt-5 inline-block text-sm font-medium underline-offset-4 hover:underline"
                >
                  Message us on WhatsApp
                </Link>
              ) : null}
            </div>
          </div>

          <div className="mt-12 border-t border-white/10 pt-8">
            <p className="text-on-night-muted text-xs leading-relaxed">
              {identity.businessName} is an independent retailer of pre-owned and new luxury
              watches. We are not affiliated with, authorised by, or an official dealer of any watch
              manufacturer. All brand names, model names and trademarks are the property of their
              respective owners and are used here for identification purposes only. Nothing on this
              site constitutes an offer capable of acceptance; all orders are subject to
              confirmation by us. Payment is arranged directly with the boutique — this site does
              not process payments.
            </p>
            <p className="text-on-night-muted mt-4 text-xs">
              © {year} {identity.businessName}. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

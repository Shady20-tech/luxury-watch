import { ArrowRight, AtSign } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import type { CopySection } from '@/lib/homepage/types';

/**
 * Full-bleed dark banner sections.
 *
 * The reference alternates near-black panels with off-white ones, and these are
 * the dark ones: the "special deals" strip, the community/newsletter panel, and
 * the social grid. They share a ground and a tone, so they live together rather
 * than being scattered through `sections.tsx`.
 *
 * Every one of them is driven by a `homepage_sections` row and renders nothing
 * when that row is missing or inactive — the same rule as the rest of the
 * homepage. None of them contains hardcoded marketing copy.
 */

/**
 * The dark promotional banner.
 *
 * The reference pairs a large headline on the left with the supporting copy and
 * a button on the right. The headline is set in the display serif at a size that
 * makes it the loudest thing on the page, which is what a promotional strip is
 * for.
 *
 * `eyebrow` and `title` come from the row's `subtitle` and `title`, so the
 * wording is the owner's, not ours.
 */
export function PromoBanner({ section }: { section: CopySection }) {
  return (
    <section className="bg-night-950">
      <div className="container-page grid gap-10 py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
        <div>
          {section.eyebrow ? (
            <p className="text-gold-300 text-[0.6875rem] font-semibold tracking-[0.28em] uppercase">
              {section.eyebrow}
            </p>
          ) : null}
          <h2 className="text-on-night mt-5 text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
            {section.title}
          </h2>
        </div>

        <div className="flex flex-col gap-6">
          {section.body ? (
            <p className="text-on-night-muted max-w-prose text-base">{section.body}</p>
          ) : null}
          {section.cta ? (
            <div>
              {/* The reference's button here is bright gold with dark text, and
                  that pairing is the one place the accent is a fill. It is
                  asserted at the large-text threshold in the token tests, which
                  is why it is safe for a button label and not for body copy. */}
              <Button asChild size="lg" className="bg-gold-300 text-night-950 hover:bg-gold-bright">
                <Link href={section.cta.href}>
                  {section.cta.label}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * The community / newsletter panel.
 *
 * The reference shows this as a dark split: a heading and copy on the right,
 * and an email field with a join button. The field is a real `GET` form posting
 * to the contact route rather than a fake subscribe endpoint.
 *
 * That is deliberate. There is no subscription table write path open to the
 * public in this build (`newsletter_subscribers` is staff-read only, by design),
 * so a form that posted to a pretend endpoint would be a control that lies. The
 * footer's newsletter form already states the honest position, and this one does
 * the same thing: it points at the contact route where a person will add them.
 */
export function CommunityPanel({ section }: { section: CopySection }) {
  return (
    <section className="bg-night-900">
      <div className="container-page grid gap-10 py-16 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-20">
        <div>
          {section.eyebrow ? (
            <p className="text-gold-300 text-[0.6875rem] font-semibold tracking-[0.28em] uppercase">
              {section.eyebrow}
            </p>
          ) : null}
          <h2 className="text-on-night mt-5 text-3xl sm:text-4xl">{section.title}</h2>
        </div>

        <div className="flex flex-col gap-6">
          {section.body ? (
            <p className="text-on-night-muted max-w-prose text-base">{section.body}</p>
          ) : null}

          {section.cta ? (
            <form method="get" action="/contact" className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <label htmlFor="community-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="community-email"
                  type="email"
                  name="email"
                  placeholder="Enter your email"
                  autoComplete="email"
                  className="text-on-night placeholder:text-on-night-muted h-12 w-full rounded-sm border border-white/25 bg-white/10 px-4 text-sm focus-visible:border-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300"
                />
              </div>
              <Button
                type="submit"
                size="lg"
                className="bg-gold-300 text-night-950 hover:bg-gold-bright"
              >
                {section.cta.label}
              </Button>
            </form>
          ) : null}

          <p className="text-on-night-muted text-xs">
            This opens the contact form with your address filled in, so a person can add you. It
            does not subscribe you silently.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * The social panel.
 *
 * The reference shows a grid of recent posts above a handle and a link. We have
 * no connected social account and no post data, so rather than render an empty
 * grid or, worse, invented post tiles, this renders the handle and the link that
 * the identity row actually provides. When `socials` is empty the caller does
 * not render the section at all.
 *
 * The rule the rest of the homepage follows applies here too: a section shows
 * what is real or it does not show.
 */
export function SocialPanel({
  section,
  socials,
}: {
  section: CopySection;
  socials: { label: string; href: string }[];
}) {
  if (socials.length === 0) return null;

  return (
    <section className="bg-night-950">
      <div className="container-page py-16 text-center lg:py-20">
        {section.eyebrow ? (
          <p className="text-gold-300 text-[0.6875rem] font-semibold tracking-[0.28em] uppercase">
            {section.eyebrow}
          </p>
        ) : null}
        <h2 className="text-on-night mt-5 text-3xl sm:text-4xl">{section.title}</h2>
        {section.body ? (
          <p className="text-on-night-muted mx-auto mt-5 max-w-prose text-base">{section.body}</p>
        ) : null}

        <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
          {socials.map((social) => (
            <li key={social.label}>
              <a
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-on-night hover:text-gold-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-300 inline-flex items-center gap-2 text-sm font-medium"
              >
                <AtSign aria-hidden="true" className="h-4 w-4" />
                {social.label}
              </a>
            </li>
          ))}
        </ul>

        {section.cta ? (
          <div className="mt-9">
            <Button asChild variant="onNight" size="lg">
              <Link href={section.cta.href}>{section.cta.label}</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

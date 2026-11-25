'use client';

import { useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import Link from 'next/link';

import type { ChromeData } from '@/lib/navigation/types';

/**
 * The ground a footer control sits on.
 *
 * The footer is dark glass, so its fields, links and accordion rows cannot use
 * the light-ground classes they were written with: `text-ink-500` on a near-black
 * panel is invisible, and the light field fill would punch a white hole in the
 * panel. Naming the ground, rather than passing colours around, keeps every part
 * of the footer consistent and makes a future light footer a one-word change.
 */
type FooterTone = 'light' | 'night';

/**
 * Footer newsletter form.
 *
 * The subscribe endpoint does not exist yet — it arrives with the CMS and email
 * phases. Rather than render a form that silently does nothing (which would be
 * a dead control), submitting states plainly that the list is not open yet and
 * points at the contact route. This is the honest option: a fake success
 * message would be worse than an honest "not yet".
 *
 * The form is a real form with a real label, a honeypot field for bots, and a
 * `role="status"` region for the response.
 */
export function NewsletterForm({ tone = 'light' }: { tone?: FooterTone }) {
  const [message, setMessage] = useState<string | null>(null);
  const night = tone === 'night';

  return (
    <form
      className="mt-4 max-w-sm"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(
          'The mailing list opens with the content phase. Until then, please use the contact page and we will add you manually.',
        );
      }}
    >
      <div className={night ? 'text-on-night' : undefined}>
        <Input
          id="newsletter-email"
          type="email"
          name="email"
          label="Email address"
          placeholder="you@example.com"
          autoComplete="email"
          required
          // The field keeps its real border and fill; only the ground-dependent
          // colours change, because a transparent field on glass loses its edge.
          className={
            night
              ? 'border-white/25 bg-white/10 text-on-night placeholder:text-on-night-muted'
              : undefined
          }
        />
      </div>
      {/* Honeypot: hidden from people, irresistible to naive bots. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="newsletter-company">Company</label>
        <input id="newsletter-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <Button type="submit" className="mt-3" variant={night ? 'onNight' : 'primary'} size="sm">
        Join the list
      </Button>
      {message ? (
        <p
          role="status"
          className={cn('mt-3 text-xs', night ? 'text-on-night-muted' : 'text-foreground-muted')}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}

/** Footer link column, collapsed into an accordion below `md`. */
export function FooterColumns({
  columns,
  tone = 'light',
}: {
  columns: ChromeData['footerColumns'];
  tone?: FooterTone;
}) {
  if (columns.length === 0) return null;
  const night = tone === 'night';

  const linkClass = cn(
    'focus-visible:outline-2 focus-visible:outline-offset-2 text-sm',
    night
      ? 'text-on-night-muted hover:text-on-night focus-visible:outline-gold-300'
      : 'text-foreground-muted hover:text-foreground focus-visible:outline-gold-700',
  );

  return (
    <>
      {/* Mobile: accordion, so the footer is not an endless list on a phone. */}
      <div className={cn('md:hidden', night && 'border-white/10')}>
        <Accordion type="multiple">
          {columns.map((column) => (
            <AccordionItem
              key={column.heading ?? 'default'}
              value={column.heading ?? 'default'}
              className={night ? 'border-white/10' : undefined}
            >
              <AccordionTrigger className={night ? 'text-on-night' : undefined}>
                {column.heading ?? 'Links'}
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  {column.links.map((link) => (
                    <li key={link.id}>
                      <Link
                        href={link.href}
                        className={linkClass}
                        {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      {/* Desktop: plain columns. */}
      <div className="hidden gap-8 md:grid md:grid-cols-3">
        {columns.map((column) => (
          <div key={column.heading ?? 'default'}>
            <h2
              className={cn(
                'text-xs font-semibold tracking-[0.18em] uppercase',
                night ? 'text-on-night' : undefined,
              )}
            >
              {column.heading ?? 'Links'}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.id}>
                  <Link
                    href={link.href}
                    className={linkClass}
                    {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

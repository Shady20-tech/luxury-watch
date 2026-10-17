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
import Link from 'next/link';

import type { ChromeData } from '@/lib/navigation/types';

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
export function NewsletterForm() {
  const [message, setMessage] = useState<string | null>(null);

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
      <Input
        id="newsletter-email"
        type="email"
        name="email"
        label="Email address"
        placeholder="you@example.com"
        autoComplete="email"
        required
      />
      {/* Honeypot: hidden from people, irresistible to naive bots. */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="newsletter-company">Company</label>
        <input id="newsletter-company" name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <Button type="submit" className="mt-3" size="sm">
        Join the list
      </Button>
      {message ? (
        <p role="status" className="text-foreground-muted mt-3 text-xs">
          {message}
        </p>
      ) : null}
    </form>
  );
}

/** Footer link column, collapsed into an accordion below `md`. */
export function FooterColumns({ columns }: { columns: ChromeData['footerColumns'] }) {
  if (columns.length === 0) return null;

  return (
    <>
      {/* Mobile: accordion, so the footer is not an endless list on a phone. */}
      <div className="md:hidden">
        <Accordion type="multiple">
          {columns.map((column) => (
            <AccordionItem key={column.heading ?? 'default'} value={column.heading ?? 'default'}>
              <AccordionTrigger>{column.heading ?? 'Links'}</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2">
                  {column.links.map((link) => (
                    <li key={link.id}>
                      <Link
                        href={link.href}
                        className="text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 text-sm"
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
            <h2 className="text-xs font-semibold tracking-[0.18em] uppercase">
              {column.heading ?? 'Links'}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.id}>
                  <Link
                    href={link.href}
                    className="text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 text-sm"
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

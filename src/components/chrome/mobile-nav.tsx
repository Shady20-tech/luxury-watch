'use client';

import { Heart, Menu, User } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import type { ChromeData } from '@/lib/navigation/types';

/**
 * Mobile and tablet navigation.
 *
 * A drawer rather than a shrunken desktop bar: at 320–1024px the brand list is
 * far too long to show inline, so it becomes an accordion. Radix Dialog traps
 * focus and restores it to the trigger on close, which is the behaviour a
 * `position: fixed` panel with a click handler does not have.
 *
 * The drawer holds every route the desktop bar holds. Nothing is desktop-only.
 */
export function MobileNav({ data }: { data: ChromeData }) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger
        className="text-foreground hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm lg:hidden"
        aria-label="Open menu"
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </DrawerTrigger>

      <DrawerContent side="left" title="Menu" description="Site navigation">
        <nav aria-label="Mobile" className="px-5 py-2">
          <Accordion type="multiple" className="w-full">
            {data.header.map((item) => {
              if (item.kind === 'link') {
                return (
                  <div key={item.id} className="border-line-200 border-b">
                    <DrawerClose asChild>
                      <Link
                        href={item.href}
                        className="hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 block py-3.5 text-base font-medium"
                        {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      >
                        {item.label}
                      </Link>
                    </DrawerClose>
                  </div>
                );
              }

              return (
                <AccordionItem key={item.id} value={item.id}>
                  <AccordionTrigger>{item.label}</AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-1">
                      <li>
                        <DrawerClose asChild>
                          <Link
                            href={item.href}
                            className="text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 block py-2 text-sm font-medium"
                          >
                            All brands
                          </Link>
                        </DrawerClose>
                      </li>
                      {item.panels.map((panel) => (
                        <li key={panel.id} className="pt-3">
                          <DrawerClose asChild>
                            <Link
                              href={panel.href}
                              className="font-display focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 block text-sm"
                            >
                              {panel.label}
                            </Link>
                          </DrawerClose>
                          {panel.columns.length > 0 ? (
                            <ul className="border-line-200 mt-1 ml-3 space-y-0.5 border-l pl-3">
                              {panel.columns.flatMap((column) =>
                                column.links.map((link) => (
                                  <li key={link.id}>
                                    <DrawerClose asChild>
                                      <Link
                                        href={link.href}
                                        className="text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 block py-1.5 text-sm"
                                      >
                                        {link.label}
                                      </Link>
                                    </DrawerClose>
                                  </li>
                                )),
                              )}
                            </ul>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>

          {/* Account and Wishlist are hidden from the header below `sm` to keep
              the row from overflowing at 320px, so they are repeated here.
              Without this they would only be reachable from the footer. */}
          <div className="border-line-200 mt-4 grid grid-cols-2 gap-2 border-t pt-4 sm:hidden">
            <DrawerClose asChild>
              <Link
                href="/account"
                className="border-line-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 inline-flex h-11 items-center justify-center gap-2 rounded-sm border text-sm font-medium"
              >
                <User aria-hidden="true" className="h-4 w-4" />
                Account
              </Link>
            </DrawerClose>
            <DrawerClose asChild>
              <Link
                href="/wishlist"
                className="border-line-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 inline-flex h-11 items-center justify-center gap-2 rounded-sm border text-sm font-medium"
              >
                <Heart aria-hidden="true" className="h-4 w-4" />
                Wishlist
              </Link>
            </DrawerClose>
          </div>

          {/* The header's appointment CTA is hidden below `xl`, so it is
              repeated here. Contact details follow for the same reason: a
              visitor on a phone should not have to scroll to the footer. */}
          <div className="border-line-200 mt-6 border-t pt-6">
            <DrawerClose asChild>
              <Link
                href="/contact"
                className="border-line-300 hover:border-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 flex h-11 items-center justify-center rounded-sm border px-4 text-sm font-medium"
              >
                Book an appointment
              </Link>
            </DrawerClose>
          </div>

          {data.identity.contactPhone || data.identity.contactEmail ? (
            <div className="border-line-200 mt-6 border-t pt-6">
              <p className="text-ink-500 text-xs font-semibold tracking-[0.18em] uppercase">
                Contact
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {data.identity.contactPhone ? (
                  <li>
                    <a
                      href={`tel:${data.identity.contactPhone.replace(/\s+/g, '')}`}
                      className="hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                    >
                      {data.identity.contactPhone}
                    </a>
                  </li>
                ) : null}
                {data.identity.contactEmail ? (
                  <li>
                    <a
                      href={`mailto:${data.identity.contactEmail}`}
                      className="hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"
                    >
                      {data.identity.contactEmail}
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </nav>
      </DrawerContent>
    </Drawer>
  );
}

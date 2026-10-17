'use client';

import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import type { NavItem } from '@/lib/navigation/types';

/**
 * Desktop primary navigation with a brand mega menu.
 *
 * Radix NavigationMenu is used rather than a hover-only dropdown because it
 * provides the behaviour that makes a mega menu usable without a mouse:
 * `Enter`/`Space` and arrow keys move between items, `Escape` closes and
 * returns focus to the trigger, hover has an intent delay so the panel does not
 * flicker, and only one panel is open at a time. A CSS `:hover` panel fails all
 * of those, and an ARIA menu role would be wrong here — this is navigation, not
 * an application menu, so real links in a `<nav>` are the correct semantics.
 *
 * The panel is a full-width sheet rather than a dropdown box, so four brand
 * columns fit without the models becoming a scrolling list.
 */
export function DesktopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  const isCurrent = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <NavigationMenu.Root
      className="relative hidden lg:block"
      delayDuration={120}
      aria-label="Primary"
    >
      <NavigationMenu.List className="flex items-center gap-1">
        {items.map((item) => {
          if (item.kind === 'link') {
            return (
              <NavigationMenu.Item key={item.id}>
                <NavigationMenu.Link asChild active={isCurrent(item.href)}>
                  <Link
                    href={item.href}
                    aria-current={isCurrent(item.href) ? 'page' : undefined}
                    className={cn(
                      'text-foreground hover:text-accent-text inline-flex h-10 items-center rounded-sm px-3 text-sm font-medium',
                      'data-[active]:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700',
                      'whitespace-nowrap',
                    )}
                  >
                    {item.label}
                  </Link>
                </NavigationMenu.Link>
              </NavigationMenu.Item>
            );
          }

          return (
            <NavigationMenu.Item key={item.id}>
              <NavigationMenu.Trigger
                className={cn(
                  'text-foreground hover:text-accent-text group inline-flex h-10 items-center gap-1 rounded-sm px-3 text-sm font-medium',
                  'data-[state=open]:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700',
                )}
              >
                {item.label}
                <span
                  aria-hidden="true"
                  className="text-ink-500 transition-transform duration-200 group-data-[state=open]:rotate-180"
                >
                  ▾
                </span>
              </NavigationMenu.Trigger>
              <NavigationMenu.Content className="glass-panel-strong border-line-200 absolute left-0 w-full border-y shadow-md">
                <div className="container-page py-8">
                  <div className="flex items-baseline justify-between gap-4 border-b border-line-200 pb-4">
                    <p className="text-ink-500 text-xs font-semibold tracking-[0.18em] uppercase">
                      Shop by brand
                    </p>
                    <Link
                      href={item.href}
                      className="text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 text-sm font-medium underline-offset-4 hover:underline"
                    >
                      All brands
                    </Link>
                  </div>

                  {item.panels.length === 0 ? (
                    <p className="text-foreground-muted pt-6 text-sm">
                      Brand collections are not available yet.
                    </p>
                  ) : (
                    <ul className="grid grid-cols-2 gap-x-10 gap-y-8 pt-6 xl:grid-cols-4">
                      {item.panels.map((panel) => (
                        <li key={panel.id}>
                          <Link
                            href={panel.href}
                            className="font-display hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 block text-base"
                          >
                            {panel.label}
                          </Link>
                          {panel.columns.map((column, columnIndex) => (
                            <ul key={columnIndex} className="mt-3 space-y-1.5">
                              {column.links.map((link) => (
                                <li key={link.id}>
                                  <Link
                                    href={link.href}
                                    className="text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 block py-0.5 text-sm"
                                  >
                                    {link.label}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ))}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          );
        })}
      </NavigationMenu.List>

      <NavigationMenu.Viewport className="absolute top-full left-0 w-full" />
    </NavigationMenu.Root>
  );
}

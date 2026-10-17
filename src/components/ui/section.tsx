import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Section heading.
 *
 * The editorial rhythm of the site is: small uppercase eyebrow, a serif
 * heading, an optional line of supporting copy, and an optional link aligned to
 * the right. Defining it once means every section on every template lines up,
 * which is most of what makes a storefront read as considered rather than
 * assembled.
 *
 * `as` controls the heading level so the outline stays correct: a section
 * heading is an `h2` on a page whose `h1` is the page title, and an `h3` when it
 * is nested inside another section.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  as: Tag = 'h2',
  align = 'start',
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  as?: 'h1' | 'h2' | 'h3';
  align?: 'start' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center'
          ? 'items-center text-center'
          : 'sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className={cn(align === 'center' && 'max-w-2xl')}>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <Tag className={cn('text-2xl sm:text-3xl', eyebrow && 'mt-3')}>{title}</Tag>
        {description ? (
          <p className="text-foreground-muted mt-4 max-w-prose text-base">{description}</p>
        ) : null}
      </div>

      {action ? (
        <Link
          href={action.href}
          className="text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 shrink-0 text-sm font-medium underline-offset-4 hover:underline"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * A bordered content surface.
 *
 * `interactive` adds a hover border and a small lift, and is only set when the
 * whole card is a link — a card that reacts to hover but is not clickable is a
 * lie about its affordance.
 */
export function Card({
  interactive = false,
  className,
  children,
}: {
  interactive?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'border-line-200 bg-surface-0 rounded-md border',
        interactive &&
          'hover:border-ink-300 hover:shadow-sm focus-within:border-ink-300 transition-[border-color,box-shadow] duration-200',
        className,
      )}
    >
      {children}
    </div>
  );
}

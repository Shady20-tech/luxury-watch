'use client';

import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Accordion.
 *
 * Used by the mobile navigation and the mobile footer. Built on Radix so the
 * trigger is a real `<button>` with `aria-expanded` and `aria-controls`, and the
 * panel is a labelled region — semantics that a `<details>` element or a
 * hand-rolled `onClick` div would either not provide or not provide correctly.
 *
 * The chevron rotation is a transform and is disabled by the global
 * reduced-motion rule.
 */
export function Accordion(props: ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root {...props} />;
}

export function AccordionItem({
  className,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item className={cn('border-line-200 border-b', className)} {...props} />
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          'group flex flex-1 items-center justify-between gap-3 py-3.5 text-left text-base font-medium',
          'hover:text-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown
          aria-hidden="true"
          className="text-ink-500 h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content className="overflow-hidden" {...props}>
      <div className={cn('pb-4', className)}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

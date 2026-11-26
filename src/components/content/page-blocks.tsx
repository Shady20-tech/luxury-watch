import { Info, TriangleAlert } from 'lucide-react';
import Image from 'next/image';

import { FaqAccordion } from '@/components/content/faq-accordion';
import { PhotographCredit } from '@/components/layout/photograph-credit';
import type { PageBlock } from '@/lib/content/types';
import { resolveSitePhotograph } from '@/lib/images/site-photography';

/**
 * The CMS block renderer.
 *
 * -----------------------------------------------------------------------------
 * THE RENDERER DECIDES THE ELEMENT
 * -----------------------------------------------------------------------------
 *
 * A block supplies text and nothing else. Which element it becomes — `h2`,
 * `p`, `li` — is decided here, so a stored page cannot choose a tag or add an
 * attribute. That is why the content is `jsonb` blocks rather than HTML: an
 * administrator can write whatever they like and the worst outcome is a
 * paragraph that reads oddly, not an injected script.
 *
 * `figure` is the one block that names an asset, and it names it as a path into
 * the site-photography registry rather than a URL. The element, the alt text,
 * the credit and the licence all come from the registry entry, so there is no
 * version of a figure block that displays an image whose author is unknown.
 * A path that is not registered renders nothing.
 *
 * Text is rendered as React children rather than through
 * `dangerouslySetInnerHTML`, so it is escaped by construction.
 *
 * -----------------------------------------------------------------------------
 * AN UNKNOWN BLOCK RENDERS NOTHING
 * -----------------------------------------------------------------------------
 *
 * `parsePageBlocks` has already dropped anything it does not recognise, so this
 * switch only sees known types. The `default` returns `null` anyway, because a
 * future block type added to the union but not to this switch should disappear
 * rather than crash the page.
 */

/**
 * Whether a heading is a sub-heading.
 *
 * The parser defaults `level` to 2, but a block passed in directly may carry no
 * level at all. One predicate decides it for both the tag and the contents list,
 * so the two cannot disagree about which headings are chapters.
 */
function isSubheading(block: { level?: 2 | 3 }): boolean {
  return block.level === 3;
}

/** A stable, unique anchor for a heading — unique by block index, not by text. */
function headingId(index: number): string {
  return `section-${index}`;
}

/**
 * The jump links for a long document.
 *
 * A published policy runs to forty blocks; on a telephone that is several
 * screens of prose with no way to find the paragraph you came for. The list is
 * built from the level-2 headings only, so it reads as a set of chapters rather
 * than a transcript of every sub-heading.
 *
 * It is skipped entirely below four sections: on a short page a table of
 * contents is longer than the thing it indexes and costs a keyboard user four
 * tab stops to save nothing.
 */
function tableOfContents(blocks: PageBlock[]): { id: string; text: string }[] {
  return blocks.flatMap((block, index) =>
    block.type === 'heading' && !isSubheading(block)
      ? [{ id: headingId(index), text: block.text }]
      : [],
  );
}

function TableOfContents({ sections }: { sections: { id: string; text: string }[] }) {
  return (
    <nav
      aria-labelledby="contents-heading"
      className="border-line-200 bg-surface-100 rounded-sm border p-5"
    >
      <h2 id="contents-heading" className="text-base font-semibold">
        On this page
      </h2>
      <ul className="mt-3 flex flex-col gap-1">
        {sections.map((section) => (
          <li key={section.id}>
            {/*
             * `py-1.5` gives each link a 38px hit area. A bare 14px line of text
             * measures 20px tall, under the 24px minimum in WCAG 2.5.8, on the
             * one control a reader uses to navigate a long policy on a phone.
             */}
            <a
              href={`#${section.id}`}
              className="text-ink-700 hover:text-ink-950 block py-1.5 text-sm underline underline-offset-4"
            >
              {section.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function PageBlocks({ blocks }: { blocks: PageBlock[] }) {
  if (blocks.length === 0) return null;

  const sections = tableOfContents(blocks);

  return (
    <div className="flex flex-col gap-5">
      {sections.length >= 4 ? <TableOfContents sections={sections} /> : null}
      {blocks.map((block, index) => (
        <PageBlockView key={index} block={block} index={index} />
      ))}
    </div>
  );
}

function PageBlockView({ block, index }: { block: PageBlock; index: number }) {
  switch (block.type) {
    case 'heading': {
      const Tag = isSubheading(block) ? 'h3' : 'h2';
      return (
        <Tag
          id={isSubheading(block) ? undefined : headingId(index)}
          className={
            isSubheading(block)
              ? 'mt-2 text-lg font-semibold'
              : 'mt-4 scroll-mt-24 text-2xl font-semibold sm:text-3xl'
          }
        >
          {block.text}
        </Tag>
      );
    }

    case 'paragraph':
      return <p className="text-foreground-muted max-w-prose text-base">{block.text}</p>;

    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          className={`text-foreground-muted max-w-prose space-y-2 pl-5 text-base ${
            block.ordered ? 'list-decimal' : 'list-disc'
          }`}
        >
          {block.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </Tag>
      );
    }

    case 'callout': {
      const Icon = block.tone === 'warning' ? TriangleAlert : Info;
      return (
        <div
          className={`flex gap-3 rounded-sm border p-4 text-sm ${
            block.tone === 'warning'
              ? 'border-warning-700/30 bg-warning-700/5'
              : 'border-line-200 bg-surface-100'
          }`}
        >
          <Icon aria-hidden="true" className="text-ink-500 mt-0.5 h-5 w-5 shrink-0" />
          <p className="max-w-prose">{block.text}</p>
        </div>
      );
    }

    case 'figure': {
      // The registry is the gate. A path it does not know renders nothing, so a
      // figure can never put an uncredited photograph on the page — the credit
      // and licence travel with the entry, not with the stored block.
      const photograph = resolveSitePhotograph(block.src);
      if (!photograph) return null;

      return (
        <figure className="my-2">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-sm bg-surface-100">
            <Image
              src={photograph.src}
              alt={photograph.alt}
              fill
              sizes="(min-width: 1024px) 768px, 100vw"
              className="object-cover"
            />
          </div>
          <figcaption className="mt-2 flex flex-col gap-1">
            {block.caption ? (
              <p className="text-foreground-muted text-sm">{block.caption}</p>
            ) : null}
            <PhotographCredit photographs={[photograph]} />
          </figcaption>
        </figure>
      );
    }

    case 'faq':
      return (
        <FaqAccordion
          faqs={block.items.map((item, index) => ({
            id: String(index),
            question: item.question,
            answer: item.answer,
            category: null,
          }))}
        />
      );

    default:
      return null;
  }
}

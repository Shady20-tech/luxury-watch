import { Info, TriangleAlert } from 'lucide-react';

import { FaqAccordion } from '@/components/content/faq-accordion';
import type { PageBlock } from '@/lib/content/types';

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
export function PageBlocks({ blocks }: { blocks: PageBlock[] }) {
  if (blocks.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block, index) => (
        <PageBlockView key={index} block={block} />
      ))}
    </div>
  );
}

function PageBlockView({ block }: { block: PageBlock }) {
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 3 ? 'h3' : 'h2';
      return (
        <Tag
          className={
            block.level === 3
              ? 'mt-2 text-lg font-semibold'
              : 'mt-4 text-2xl font-semibold sm:text-3xl'
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

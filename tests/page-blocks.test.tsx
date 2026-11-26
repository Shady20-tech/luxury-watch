// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PageBlocks } from '@/components/content/page-blocks';
import { SITE_PHOTOGRAPHY } from '@/lib/images/site-photography';
import type { PageBlock } from '@/lib/content/types';

/**
 * The CMS block renderer, with attention to the figure block.
 *
 * The figure block is the only one that displays a licensed photograph, so the
 * rule that matters is that the credit and licence come from the registry rather
 * than from the stored content. A block cannot supply its own credit, so an
 * image cannot reach the page without its attribution.
 *
 * jsdom does not lay out or fetch, so nothing here speaks about contrast or
 * whether the image loads. The credit's contrast is covered by the token tests
 * and the browser audit.
 */

afterEach(cleanup);

describe('PageBlocks', () => {
  it('renders nothing for an empty body', () => {
    const { container } = render(<PageBlocks blocks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a figure with its registry alt text, caption and credit', () => {
    const photograph = SITE_PHOTOGRAPHY.watchmakerBench;
    render(
      <PageBlocks blocks={[{ type: 'figure', src: photograph.src, caption: 'At the bench' }]} />,
    );

    const image = screen.getByRole('img', { name: photograph.alt });
    // next/image rewrites the src through `/_next/image?url=…`, so the path is
    // asserted after decoding rather than as a literal substring.
    expect(decodeURIComponent(image.getAttribute('src') ?? '')).toContain(photograph.src);
    expect(screen.getByText('At the bench')).toBeDefined();
    // The credit is the licence condition, so it is asserted rather than assumed.
    expect(screen.getByText(new RegExp(photograph.credit, 'u'))).toBeDefined();
  });

  it('does not render a figure whose path is not in the registry', () => {
    // The whole point of resolving through the registry: an unregistered path
    // has no author to credit, so it is not shown at all. This is the case a
    // careless implementation gets wrong by rendering <Image src> directly.
    const { container } = render(
      <PageBlocks blocks={[{ type: 'figure', src: 'https://example.com/a-watch.jpg' }]} />,
    );
    expect(container.querySelector('figure')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('omits the caption element when the block has none', () => {
    const photograph = SITE_PHOTOGRAPHY.pocketWatch;
    const { container } = render(<PageBlocks blocks={[{ type: 'figure', src: photograph.src }]} />);
    // The credit line is itself a paragraph, so the assertion is that there is
    // exactly one — the credit — and no empty caption above it.
    const paragraphs = container.querySelectorAll('figcaption p');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toMatch(/^Photograph:/u);
  });

  it('renders the known text blocks in order', () => {
    const blocks: PageBlock[] = [
      { type: 'heading', text: 'A heading' },
      { type: 'paragraph', text: 'A paragraph.' },
      { type: 'list', items: ['one', 'two'] },
      { type: 'callout', text: 'A note', tone: 'warning' },
    ];
    render(<PageBlocks blocks={blocks} />);
    expect(screen.getByRole('heading', { name: 'A heading' })).toBeDefined();
    expect(screen.getByText('A paragraph.')).toBeDefined();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('A note')).toBeDefined();
  });

  it('skips a table of contents on a short page', () => {
    // Three sections is below the threshold where the list pays for itself.
    const { container } = render(
      <PageBlocks
        blocks={[
          { type: 'heading', text: 'One' },
          { type: 'paragraph', text: 'Body.' },
          { type: 'heading', text: 'Two' },
          { type: 'heading', text: 'Three' },
        ]}
      />,
    );
    expect(container.querySelector('nav')).toBeNull();
  });

  it('lists the level-2 headings as jump links once a page is long enough', () => {
    const { container } = render(
      <PageBlocks
        blocks={[
          { type: 'heading', text: 'One' },
          { type: 'heading', text: 'Two' },
          { type: 'heading', text: 'Three' },
          { type: 'heading', text: 'Four' },
          { type: 'heading', text: 'A sub-heading', level: 3 },
        ]}
      />,
    );

    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    const links = [...(nav?.querySelectorAll('a') ?? [])];
    // Level 3 is excluded, so the list reads as chapters rather than a transcript.
    expect(links.map((a) => a.textContent)).toEqual(['One', 'Two', 'Three', 'Four']);

    // Every link must point at an element that exists, or it is a dead anchor.
    for (const link of links) {
      const id = (link.getAttribute('href') ?? '').replace('#', '');
      expect(container.querySelector(`[id="${id}"]`)).not.toBeNull();
    }
  });

  it('gives every contents link a 24px hit area', () => {
    // WCAG 2.5.8 wants 24x24 CSS pixels. jsdom lays nothing out, so the height
    // cannot be measured here — the class that supplies it is asserted instead,
    // because a bare text link measures 20px and failed that rule in the browser.
    const { container } = render(
      <PageBlocks
        blocks={[
          { type: 'heading', text: 'One' },
          { type: 'heading', text: 'Two' },
          { type: 'heading', text: 'Three' },
          { type: 'heading', text: 'Four' },
        ]}
      />,
    );
    const links = [...(container.querySelectorAll('nav a') ?? [])];
    expect(links.length).toBe(4);
    for (const link of links) {
      expect(link.className).toContain('py-1.5');
      expect(link.className).toContain('block');
    }
  });

  it('renders an unknown block as nothing rather than throwing', () => {
    // `parsePageBlocks` drops unknown types before they reach here, but a type
    // added to the union and forgotten in the switch must still disappear.
    const { container } = render(
      <PageBlocks blocks={[{ type: 'unimplemented' } as unknown as PageBlock]} />,
    );
    expect(container.textContent).toBe('');
  });
});

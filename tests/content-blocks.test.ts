import { describe, expect, it } from 'vitest';

import { parsePageBlocks } from '@/lib/content/types';

/**
 * CMS block parsing.
 *
 * The renderer decides which element each block becomes, so the only thing that
 * can go wrong in stored content is a block the renderer does not know. The rule
 * is that an unknown or malformed block is dropped, not guessed: a bad row must
 * render less, never something unexpected. These tests pin that direction, since
 * a parser that passed everything through would still render the happy path.
 */

describe('parsePageBlocks', () => {
  it('returns nothing for a non-array', () => {
    expect(parsePageBlocks(null)).toEqual([]);
    expect(parsePageBlocks('a paragraph')).toEqual([]);
    expect(parsePageBlocks({ type: 'paragraph', text: 'hi' })).toEqual([]);
  });

  it('keeps a paragraph', () => {
    expect(parsePageBlocks([{ type: 'paragraph', text: 'Hello.' }])).toEqual([
      { type: 'paragraph', text: 'Hello.' },
    ]);
  });

  it('drops an unknown block type rather than passing it through', () => {
    // The important case: content written by a newer admin must not reach the
    // renderer as an unhandled value.
    expect(parsePageBlocks([{ type: 'script', text: '<script>alert(1)</script>' }])).toEqual([]);
  });

  it('drops a paragraph with no text', () => {
    expect(parsePageBlocks([{ type: 'paragraph', text: '   ' }])).toEqual([]);
    expect(parsePageBlocks([{ type: 'paragraph' }])).toEqual([]);
  });

  it('defaults a heading to level 2 and accepts level 3', () => {
    expect(parsePageBlocks([{ type: 'heading', text: 'A' }])).toEqual([
      { type: 'heading', text: 'A', level: 2 },
    ]);
    expect(parsePageBlocks([{ type: 'heading', text: 'A', level: 3 }])).toEqual([
      { type: 'heading', text: 'A', level: 3 },
    ]);
  });

  it('ignores a heading level the renderer does not emit', () => {
    // `h1` is the page title and must not be reachable from stored content.
    expect(parsePageBlocks([{ type: 'heading', text: 'A', level: 1 }])).toEqual([
      { type: 'heading', text: 'A', level: 2 },
    ]);
  });

  it('keeps a list and drops the empty entries within it', () => {
    expect(parsePageBlocks([{ type: 'list', items: ['one', '', 'two'] }])).toEqual([
      { type: 'list', items: ['one', 'two'], ordered: false },
    ]);
  });

  it('drops a list with no usable items', () => {
    expect(parsePageBlocks([{ type: 'list', items: [] }])).toEqual([]);
    expect(parsePageBlocks([{ type: 'list', items: ['', '  '] }])).toEqual([]);
  });

  it('defaults a callout to the info tone', () => {
    expect(parsePageBlocks([{ type: 'callout', text: 'Note' }])).toEqual([
      { type: 'callout', text: 'Note', tone: 'info' },
    ]);
  });

  it('keeps only the FAQ entries that have both a question and an answer', () => {
    expect(
      parsePageBlocks([
        {
          type: 'faq',
          items: [{ question: 'Q1', answer: 'A1' }, { question: 'Q2' }, { answer: 'A3' }],
        },
      ]),
    ).toEqual([{ type: 'faq', items: [{ question: 'Q1', answer: 'A1' }] }]);
  });

  it('drops an FAQ block with no usable entries', () => {
    expect(parsePageBlocks([{ type: 'faq', items: [] }])).toEqual([]);
  });

  it('drops a block that is not an object', () => {
    expect(parsePageBlocks(['a paragraph', 42, null])).toEqual([]);
  });

  it('keeps a figure and normalises an absent caption to nothing', () => {
    const path = '/site-photography/watchmaker-bench.webp';
    expect(parsePageBlocks([{ type: 'figure', src: path }])).toEqual([
      { type: 'figure', src: path, caption: undefined },
    ]);
    expect(parsePageBlocks([{ type: 'figure', src: path, caption: 'At the bench' }])).toEqual([
      { type: 'figure', src: path, caption: 'At the bench' },
    ]);
    expect(parsePageBlocks([{ type: 'figure', src: path, caption: '  ' }])).toEqual([
      { type: 'figure', src: path, caption: undefined },
    ]);
  });

  it('drops a figure with no src', () => {
    expect(parsePageBlocks([{ type: 'figure' }])).toEqual([]);
    expect(parsePageBlocks([{ type: 'figure', src: '   ' }])).toEqual([]);
  });

  it('parses a figure without checking that the path is registered', () => {
    // Parsing is not the gate: the registry is. A path is kept so the renderer
    // can drop it, which is where the credit and licence would live. Pinning
    // the split stops someone "fixing" this by validating paths here, which
    // would couple the content parser to a presentation registry.
    const unknown = parsePageBlocks([{ type: 'figure', src: 'https://example.com/x.jpg' }]);
    expect(unknown).toEqual([
      { type: 'figure', src: 'https://example.com/x.jpg', caption: undefined },
    ]);
  });

  it('keeps the known blocks in order and drops only the bad ones', () => {
    const blocks = parsePageBlocks([
      { type: 'heading', text: 'Title' },
      { type: 'nonsense' },
      { type: 'paragraph', text: 'Body.' },
    ]);
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph']);
  });
});

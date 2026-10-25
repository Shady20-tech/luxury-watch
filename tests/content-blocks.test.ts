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

  it('keeps the known blocks in order and drops only the bad ones', () => {
    const blocks = parsePageBlocks([
      { type: 'heading', text: 'Title' },
      { type: 'nonsense' },
      { type: 'paragraph', text: 'Body.' },
    ]);
    expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph']);
  });
});

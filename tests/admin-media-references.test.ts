import { describe, expect, it } from 'vitest';

import {
  collectMediaReferences,
  describeReferences,
  isReferenced,
  referencesFor,
  referencesObject,
} from '@/lib/admin/media-references';

const PATH = 'editorial/hero-abc123.jpg';

describe('referencesObject', () => {
  it('matches a bare path', () => {
    expect(referencesObject(PATH, PATH)).toBe(true);
  });

  it('matches a path with a leading slash', () => {
    expect(referencesObject(`/${PATH}`, PATH)).toBe(true);
  });

  it('matches a full project URL', () => {
    expect(
      referencesObject(`https://abc.supabase.co/storage/v1/object/public/media/${PATH}`, PATH),
    ).toBe(true);
  });

  it('ignores a cache-busting query string', () => {
    expect(referencesObject(`https://x/media/${PATH}?v=2`, PATH)).toBe(true);
  });

  it('does not match a different object that ends in the same filename', () => {
    // `other-hero-abc123.jpg` shares a suffix but is not the same object. The
    // leading slash in the comparison is what prevents this false positive.
    expect(referencesObject('editorial/other-hero-abc123.jpg', PATH)).toBe(false);
  });

  it('does not match a different asset in the same folder', () => {
    expect(referencesObject('editorial/hero-xyz789.jpg', PATH)).toBe(false);
  });

  it('is false for null, empty and undefined', () => {
    expect(referencesObject(null, PATH)).toBe(false);
    expect(referencesObject('', PATH)).toBe(false);
    expect(referencesObject(undefined, PATH)).toBe(false);
  });

  it('is false when the path is empty', () => {
    expect(referencesObject('anything', '')).toBe(false);
  });
});

describe('collectMediaReferences', () => {
  it('finds a product social image', () => {
    const refs = collectMediaReferences({
      products: [{ title: 'Submariner', ogImageUrl: `https://x/media/${PATH}` }],
    });
    expect(refs).toHaveLength(1);
    expect(refs[0]!.where).toBe('the product "Submariner"');
  });

  it('finds a page hero image', () => {
    const refs = collectMediaReferences({
      pages: [{ title: 'About', heroImageUrl: PATH, bodyText: null }],
    });
    expect(refs.map((r) => r.where)).toEqual(['the page "About"']);
  });

  it('finds an image inside a page body block', () => {
    const body = JSON.stringify([
      { type: 'paragraph', text: 'See below.' },
      { type: 'image', src: `https://x/media/${PATH}`, alt: 'A dial' },
    ]);
    const refs = collectMediaReferences({
      pages: [{ title: 'Story', heroImageUrl: null, bodyText: body }],
    });
    expect(refs.some((r) => r.value.includes(PATH))).toBe(true);
  });

  it('finds a homepage section image', () => {
    const refs = collectMediaReferences({
      sections: [{ sectionKey: 'hero_1', imageUrl: PATH }],
    });
    expect(refs[0]!.where).toBe('the homepage section "hero_1"');
  });

  it('finds the site logo', () => {
    const refs = collectMediaReferences({ settings: { logoUrl: PATH } });
    expect(refs[0]!.where).toBe('the site logo');
  });

  it('ignores nulls and blank values', () => {
    const refs = collectMediaReferences({
      products: [{ title: 'A', ogImageUrl: null }],
      pages: [{ title: 'B', heroImageUrl: null, bodyText: null }],
      sections: [{ sectionKey: 'c', imageUrl: null }],
      settings: null,
    });
    expect(refs).toEqual([]);
  });

  it('finds an image URL used as a navigation download link', () => {
    const refs = collectMediaReferences({
      navigation: [{ label: 'Catalogue', href: `/media/${PATH}` }],
    });
    expect(refs).toHaveLength(1);
  });

  it('does not treat an ordinary navigation link as a media reference', () => {
    const refs = collectMediaReferences({
      navigation: [{ label: 'Shop', href: '/shop' }],
    });
    expect(refs).toEqual([]);
  });
});

describe('isReferenced and referencesFor', () => {
  const refs = [
    { where: 'the page "About"', value: `https://x/media/${PATH}` },
    { where: 'the site logo', value: 'editorial/logo-1.png' },
  ];

  it('reports a referenced asset', () => {
    expect(isReferenced(PATH, refs)).toBe(true);
  });

  it('reports an unreferenced asset', () => {
    expect(isReferenced('editorial/unused.jpg', refs)).toBe(false);
  });

  it('returns only the references for the asset', () => {
    expect(referencesFor(PATH, refs)).toHaveLength(1);
  });
});

describe('describeReferences', () => {
  it('names a single place', () => {
    expect(describeReferences([{ where: 'the site logo', value: 'x' }])).toBe(
      'This image is still used by the site logo.',
    );
  });

  it('lists several places', () => {
    const message = describeReferences([
      { where: 'the page "A"', value: 'x' },
      { where: 'the page "B"', value: 'y' },
    ]);
    expect(message).toBe('This image is still used by the page "A", the page "B".');
  });

  it('summarises more than three places', () => {
    const message = describeReferences([
      { where: 'a', value: '1' },
      { where: 'b', value: '2' },
      { where: 'c', value: '3' },
      { where: 'd', value: '4' },
    ]);
    expect(message).toContain('and 1 more');
  });

  it('deduplicates the same place mentioned twice', () => {
    const message = describeReferences([
      { where: 'the page "A"', value: '1' },
      { where: 'the page "A"', value: '2' },
    ]);
    expect(message).toBe('This image is still used by the page "A".');
  });

  it('is empty for no references', () => {
    expect(describeReferences([])).toBe('');
  });
});

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SITE_PHOTOGRAPHY, type SitePhotograph } from '@/lib/images/site-photography';

/**
 * Editorial photography, asserted as data rather than trusted as prose.
 *
 * The sibling suite (`seed-photography.test.ts`) polices the catalogue's
 * photographs. This one polices the decorative images on the site chrome, which
 * are a separate set with a separate failure mode: a file that names a licence
 * but not its author is a licence breach, and a filename that is not in the
 * repository is a broken hero on the most-visited page on the site.
 */

const entries = Object.entries(SITE_PHOTOGRAPHY) as [string, SitePhotograph][];

describe('site photography — the registry is real', () => {
  it('contains the images the layout actually references', () => {
    // Guards against the registry being emptied: every assertion below would
    // pass vacuously against an empty object.
    expect(entries.length).toBeGreaterThanOrEqual(6);
  });

  it('every file exists in public/', () => {
    for (const [key, photo] of entries) {
      const onDisk = join(process.cwd(), 'public', photo.src.replace(/^\//, ''));
      expect(existsSync(onDisk), `${key}: ${photo.src} is not in public/`).toBe(true);
    }
  });

  it('every source is a root-relative path, so it is served from our origin', () => {
    for (const [key, photo] of entries) {
      expect(photo.src, key).toMatch(/^\/site-photography\/[a-z0-9-]+\.webp$/);
    }
  });
});

describe('site photography — licence completeness', () => {
  it('every image carries a credit, a licence and a traceable source', () => {
    for (const [key, photo] of entries) {
      expect(photo.credit.trim().length, `${key} has no credit`).toBeGreaterThan(0);
      expect(photo.licence.trim().length, `${key} has no licence`).toBeGreaterThan(0);
      expect(photo.sourceUrl, `${key} source`).toMatch(
        /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/,
      );
    }
  });

  it('every licence permits commercial reuse', () => {
    // NC is excluded because a storefront is commercial use, ND because the
    // images are cropped. A ported licence (e.g. `CC BY-SA 3.0 fr`) is excluded
    // because its deed is not the unported one its URL would claim.
    const allowed = /^CC BY(-SA)? [0-9.]+$|^CC0$/;
    for (const [key, photo] of entries) {
      expect(photo.licence, `${key}: ${photo.licence} is not a commercial-use licence`).toMatch(
        allowed,
      );
    }
  });

  it('every licence URL matches the licence it names', () => {
    for (const [key, photo] of entries) {
      const expected =
        photo.licence === 'CC0'
          ? /^https:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\/?$/
          : photo.licence.includes('SA')
            ? /^https:\/\/creativecommons\.org\/licenses\/by-sa\/[0-9.]+\/?$/
            : /^https:\/\/creativecommons\.org\/licenses\/by\/[0-9.]+\/?$/;
      expect(photo.licenceUrl, `${key}: licence URL disagrees with ${photo.licence}`).toMatch(
        expected,
      );
    }
  });

  it('records the dimensions the file actually has', async () => {
    // A wrong dimension makes `next/image` reserve the wrong space and the page
    // shifts as the image loads.
    const sharp = (await import('sharp')).default;
    for (const [key, photo] of entries) {
      const meta = await sharp(
        join(process.cwd(), 'public', photo.src.replace(/^\//, '')),
      ).metadata();
      expect(meta.width, `${key} width`).toBe(photo.width);
      expect(meta.height, `${key} height`).toBe(photo.height);
    }
  });
});

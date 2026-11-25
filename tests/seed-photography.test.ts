import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The seed photography, asserted as data rather than trusted as prose.
 *
 * -----------------------------------------------------------------------------
 * WHAT THIS EXISTS TO CATCH
 * -----------------------------------------------------------------------------
 *
 * A seeded photograph is somebody else's picture of somebody else's watch, under
 * a licence that requires attribution. Three failure modes are cheap to
 * introduce and expensive to discover in production:
 *
 *   1. A row with a `licence` but no `credit` — an unattributed CC BY image,
 *      which is a licence breach the storefront would render as if it were fine.
 *   2. A `external_url` pointing at the seed folder for a file that is not in
 *      the repository — a broken image on a product page, and the exact thing
 *      the placeholder exists to avoid.
 *   3. A `credit` that names the Commons file but whose `source_url` points
 *      somewhere else, so the licence cannot be traced back.
 *
 * Migration 0028 enforces (1) in the database. These tests enforce (1) before it
 * is applied, and (2) and (3), which a database constraint cannot see because
 * the filesystem is outside it.
 *
 * -----------------------------------------------------------------------------
 * WHY THE ASSERTIONS PARSE THE SQL
 * -----------------------------------------------------------------------------
 *
 * The alternative is a hand-maintained fixture duplicated in TypeScript, which
 * drifts from the seed and then passes while the seed is wrong. Reading the
 * seed file itself means the test fails exactly when the shipped data is wrong.
 */

const SEED = readFileSync(join(process.cwd(), 'supabase/seed/02_product_images.sql'), 'utf8');

/** The assignment tuples, as raw field lists. */
function assignments(): string[][] {
  const start = SEED.indexOf('insert into seed_image_assignments');
  const end = SEED.indexOf('insert into public.product_images');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = SEED.slice(start, end);

  const rows: string[][] = [];
  // Each tuple begins with a product slug and is closed by a line holding `),`
  // or `);`. Slug-shaped first fields keep this from matching escaped quotes.
  const tuples = block.matchAll(/\(\s*\n((?:[^()]|\n)*?)\n\s{2}\)/g);
  for (const match of tuples) {
    // `match[1]` is typed as `string | undefined` under `noUncheckedIndexedAccess`
    // even though the capture group is mandatory in the pattern. Guarding keeps
    // the parser honest rather than casting the doubt away.
    const body = match[1];
    if (body === undefined) continue;
    const fields = [...body.matchAll(/'((?:[^']|'')*)'/g)].map(
      (m) => m[1]?.replace(/''/g, "'") ?? '',
    );
    const numbers = [...body.matchAll(/^\s{4}(\d+),?\s*$/gm)].map((m) => m[1] ?? '');
    if (fields.length > 0) rows.push([...fields, ...numbers]);
  }
  return rows;
}

const rows = assignments();

describe('seed photography — the assignment table is real', () => {
  it('parses the assignments it expects to find', () => {
    // If the parser stops matching after an edit, every test below would pass
    // vacuously against an empty list. This asserts it found the rows.
    expect(rows.length).toBeGreaterThanOrEqual(7);
  });

  it('every row names a product slug, an image path and a Commons page', () => {
    for (const row of rows) {
      const [slug, path, , , , , sourceUrl] = row;
      expect(slug).toMatch(/^[a-z0-9][a-z0-9-]+$/);
      expect(path).toMatch(/^\/seed-images\/[a-z0-9-]+\.webp$/);
      expect(sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
  });

  it('every image path names a file that is actually in the repository', () => {
    for (const row of rows) {
      const path = row[1]!;
      const onDisk = join(process.cwd(), 'public', path.replace(/^\//, ''));
      expect(existsSync(onDisk), `${path} is referenced by the seed but missing from public/`).toBe(
        true,
      );
    }
  });
});

describe('seed photography — licence completeness', () => {
  const LICENCE_FIELDS = { credit: 3, licence: 4, licenceUrl: 5, sourceUrl: 6 } as const;

  it('every row carries a photographer, a licence and a licence link', () => {
    for (const row of rows) {
      const slug = row[0]!;
      for (const [name, index] of Object.entries(LICENCE_FIELDS)) {
        const value = row[index];
        expect(value, `${slug} is missing ${name}`).toBeTruthy();
        expect((value ?? '').trim().length, `${slug} has a blank ${name}`).toBeGreaterThan(0);
      }
    }
  });

  it('every licence is one of the two CC families that permit commercial reuse', () => {
    // CC BY and CC BY-SA permit commercial use with attribution; NC variants do
    // not, and a public storefront is commercial use. This is the assertion that
    // stops a "nice picture" being added under the wrong licence.
    for (const row of rows) {
      expect(row[4], `${row[0]} licence`).toMatch(/^CC BY(-SA)? [0-9.]+$/);
    }
  });

  it('every licence URL points at a matching Creative Commons deed', () => {
    for (const row of rows) {
      const licence = row[4]!;
      const url = row[5]!;
      const expected = licence.toLowerCase().includes('sa')
        ? /^https:\/\/creativecommons\.org\/licenses\/by-sa\/[0-9.]+\/?$/
        : /^https:\/\/creativecommons\.org\/licenses\/by\/[0-9.]+\/?$/;
      expect(url, `${row[0]}: ${licence} must link to its own deed`).toMatch(expected);
    }
  });

  it('records dimensions that agree with a 4:5 portrait crop', () => {
    for (const row of rows) {
      const width = Number(row[7]);
      const height = Number(row[8]);
      expect(Number.isFinite(width) && width > 0, `${row[0]} width`).toBe(true);
      expect(Number.isFinite(height) && height > 0, `${row[0]} height`).toBe(true);
      // Allow a pixel of rounding from the resize.
      expect(Math.abs(width / height - 0.8), `${row[0]} is not a 4:5 crop`).toBeLessThan(0.01);
    }
  });
});

describe('seed photography — honesty and scope', () => {
  it('every seeded image is marked as a model example, not the piece in stock', () => {
    // The insert hard-codes `true` for `is_representative`. If that is ever
    // changed to false, a Commons photograph would present itself as the exact
    // watch for sale, which is a misdescription.
    const insert = SEED.slice(SEED.indexOf('insert into public.product_images'));
    const valuesTail = insert.slice(
      insert.indexOf('select'),
      insert.indexOf('from seed_image_assignments'),
    );
    const literals = valuesTail
      .split(',')
      .map((line) => line.replace(/--.*$/g, '').trim())
      .filter(Boolean);
    expect(literals).toContain('true');
  });

  it('never hotlinks a third-party host', () => {
    // Images must be in our repository. A Commons CDN URL here would render as
    // a placeholder at best (resolveImageUrl refuses it) and as a hotlink at
    // worst if the resolver were ever loosened.
    expect(SEED).not.toMatch(/external_url[^;]*https:\/\/(?!creativecommons)/i);
    expect(SEED).not.toMatch(/upload\.wikimedia\.org/);
  });

  it('does not reuse the reference site as an image source', () => {
    // The reason this whole file exists: the reference site's terms forbid
    // commercial reuse and extraction. No asset may come from it.
    expect(SEED.toLowerCase()).not.toContain('thewatchpages');
  });

  it('assigns each product at most one primary photograph', () => {
    const slugs = rows.map((row) => row[0]!);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

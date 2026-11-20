import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Seed copy that reaches an indexable page.
 *
 * A brand's `description` is printed in the hero and in `<meta name="description">`
 * of `/brands/[slug]`, which is indexable and self-canonical. When all four seeded
 * brands carried the same "Reference brand seeded for development." line, four
 * ranking pages shared one sentence that described nothing — the thin, duplicate
 * content the catalogue brief set out to avoid (KNOWN_ISSUES G78).
 *
 * This reads the seed rather than the database because the seed is what a fresh
 * environment loads, and the placeholder's whole failure mode was that it looked
 * fine in code review. Assert the shape: real prose, and no two brands alike.
 */
const seed = readFileSync(
  fileURLToPath(new URL('../supabase/seed/01_catalogue.sql', import.meta.url)),
  'utf8',
);

/** The `brands` insert block, from its `insert` to the statement terminator. */
function brandsInsert(): string {
  const start = seed.indexOf('insert into public.brands');
  if (start === -1) throw new Error('brands insert not found in seed');
  const end = seed.indexOf('on conflict (slug)', start);
  if (end === -1) throw new Error('brands insert terminator not found in seed');
  return seed.slice(start, end);
}

/** Every `(name, slug, description, ...)` tuple in the brands insert. */
function brandRows(): { slug: string; description: string }[] {
  const rows: { slug: string; description: string }[] = [];
  const tuple = /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = tuple.exec(brandsInsert())) !== null) {
    const [, , slug, description] = match;
    if (slug === undefined || description === undefined) continue;
    rows.push({ slug, description });
  }
  return rows;
}

describe('seed brand copy', () => {
  it('seeds the expected brands', () => {
    expect(brandRows().map((row) => row.slug)).toEqual([
      'rolex',
      'patek-philippe',
      'audemars-piguet',
      'richard-mille',
    ]);
  });

  it('does not carry development placeholder copy', () => {
    for (const row of brandRows()) {
      expect(row.description.toLowerCase()).not.toContain('seeded for development');
      expect(row.description.toLowerCase()).not.toContain('lorem ipsum');
    }
  });

  it('gives each brand a description long enough to be real prose', () => {
    for (const row of brandRows()) {
      // The generated fallback in the page is about this long; a description
      // shorter than it is not adding anything a template could not say.
      expect(row.description.length).toBeGreaterThan(80);
    }
  });

  it('does not give two brands the same description', () => {
    const descriptions = brandRows().map((row) => row.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });

  it('updates description on conflict so an existing database is corrected', () => {
    // Without this, an environment seeded before the copy changed keeps the old
    // text: the conflict clause previously updated name, is_active and sort_order
    // only, so re-running the seed silently left the placeholder in place.
    const conflict = seed.slice(seed.indexOf('on conflict (slug)'));
    const clause = conflict.slice(0, conflict.indexOf(';'));
    expect(clause).toContain('description = excluded.description');
  });
});

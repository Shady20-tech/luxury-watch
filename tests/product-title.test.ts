import { describe, expect, it } from 'vitest';

import { titleWithoutBrand } from '@/lib/product/title';

/**
 * Cards print the brand as their own line above the product name, so a title
 * that repeats the brand reads "Patek Philippe / Patek Philippe Cubitus …".
 * Every seeded title begins with its brand, so this is the normal case.
 *
 * The stripping must be conservative: it may only remove a brand that is
 * followed by a separator, or a brand that is a prefix of a longer word would
 * be eaten ("Rolex" out of "Rolexford").
 */
describe('titleWithoutBrand', () => {
  it('strips a brand followed by a space', () => {
    expect(titleWithoutBrand('Rolex Milgauss 40 mm', 'Rolex')).toBe('Milgauss 40 mm');
  });

  it('strips a brand followed by a hyphen and the hyphen itself', () => {
    expect(titleWithoutBrand('Rolex - Milgauss 116400', 'Rolex')).toBe('Milgauss 116400');
  });

  it('matches the brand case-insensitively', () => {
    expect(titleWithoutBrand('ROLEX Milgauss', 'Rolex')).toBe('Milgauss');
  });

  it('leaves a title that does not begin with the brand untouched', () => {
    expect(titleWithoutBrand('Milgauss by Rolex', 'Rolex')).toBe('Milgauss by Rolex');
  });

  it('does not eat a brand that is a prefix of a longer word', () => {
    expect(titleWithoutBrand('Rolexford 100', 'Rolex')).toBe('Rolexford 100');
  });

  it('returns the title when there is no brand to strip', () => {
    expect(titleWithoutBrand('Unknown watch', null)).toBe('Unknown watch');
  });

  it('never returns an empty string for a title that is only the brand', () => {
    expect(titleWithoutBrand('Rolex', 'Rolex')).toBe('Rolex');
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  GUEST_WISHLIST_KEY,
  MAX_GUEST_WISHLIST_ITEMS,
  addToGuestWishlist,
  clearGuestWishlist,
  isInGuestWishlist,
  parseGuestWishlist,
  readGuestWishlist,
  removeFromGuestWishlist,
} from '@/lib/wishlist/guest';

/**
 * Guest wishlist storage.
 *
 * The guest list lives in `localStorage`, which any script on the origin can
 * read and any visitor can edit, so it is treated as untrusted input. These
 * tests drive the real `window.localStorage` under jsdom rather than a stub,
 * because the behaviour under test — what a hand-edited or corrupted value does
 * to the list — is a property of the real storage interaction.
 *
 * The duplicate rule is asserted here as well as in the database suite: a guest
 * double-tap must not create a duplicate, and the same guarantee has to hold on
 * both sides of the sign-in boundary.
 */

const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('parseGuestWishlist', () => {
  it('returns nothing for an absent, empty or unparseable value', () => {
    expect(parseGuestWishlist(null)).toEqual([]);
    expect(parseGuestWishlist('')).toEqual([]);
    expect(parseGuestWishlist('not json')).toEqual([]);
    expect(parseGuestWishlist('{"a":1}')).toEqual([]);
    expect(parseGuestWishlist('"a string"')).toEqual([]);
  });

  it('keeps only values shaped like a product id', () => {
    const raw = JSON.stringify([ID_A, 'nonsense', 42, null, { id: ID_B }]);

    expect(parseGuestWishlist(raw)).toEqual([ID_A]);
  });

  it('collapses duplicates and preserves first-seen order', () => {
    const raw = JSON.stringify([ID_B, ID_A, ID_B.toUpperCase(), ID_A]);

    // Case-insensitive, because a UUID is case-insensitive in Postgres and
    // storage could hold either case.
    expect(parseGuestWishlist(raw)).toEqual([ID_B, ID_A]);
  });

  it('caps the list so a corrupted value cannot grow without bound', () => {
    const raw = JSON.stringify(
      Array.from(
        { length: MAX_GUEST_WISHLIST_ITEMS + 25 },
        (_, index) => `${String(index).padStart(8, '0')}-1111-1111-1111-111111111111`,
      ),
    );

    expect(parseGuestWishlist(raw)).toHaveLength(MAX_GUEST_WISHLIST_ITEMS);
  });
});

describe('addToGuestWishlist', () => {
  it('adds an id and persists it', () => {
    const next = addToGuestWishlist(ID_A);

    expect(next).toEqual([ID_A]);
    expect(readGuestWishlist()).toEqual([ID_A]);
  });

  it('is idempotent, so a double-tap cannot duplicate a row', () => {
    addToGuestWishlist(ID_A);
    const next = addToGuestWishlist(ID_A);

    expect(next).toEqual([ID_A]);
    expect(readGuestWishlist()).toEqual([ID_A]);
  });

  it('normalises case so the same product cannot be saved twice', () => {
    addToGuestWishlist(ID_A);
    const next = addToGuestWishlist(ID_A.toUpperCase());

    expect(next).toEqual([ID_A]);
  });

  it('refuses a value that is not a product id', () => {
    expect(addToGuestWishlist('../../etc/passwd')).toEqual([]);
    expect(readGuestWishlist()).toEqual([]);
  });
});

describe('removeFromGuestWishlist', () => {
  it('removes an id and is a no-op for one that is absent', () => {
    addToGuestWishlist(ID_A);
    addToGuestWishlist(ID_B);

    expect(removeFromGuestWishlist(ID_A)).toEqual([ID_B]);
    expect(removeFromGuestWishlist(ID_A)).toEqual([ID_B]);
  });

  it('reports membership case-insensitively', () => {
    addToGuestWishlist(ID_A);

    expect(isInGuestWishlist(ID_A)).toBe(true);
    expect(isInGuestWishlist(ID_A.toUpperCase())).toBe(true);
    expect(isInGuestWishlist(ID_B)).toBe(false);
  });
});

describe('clearGuestWishlist', () => {
  it('empties the list and the stored value', () => {
    addToGuestWishlist(ID_A);
    clearGuestWishlist();

    expect(readGuestWishlist()).toEqual([]);
    expect(window.localStorage.getItem(GUEST_WISHLIST_KEY)).toBeNull();
  });
});

describe('storage safety', () => {
  it('reads an empty list when the stored value was hand-edited to nonsense', () => {
    window.localStorage.setItem(GUEST_WISHLIST_KEY, '<<<not json>>>');

    expect(readGuestWishlist()).toEqual([]);
  });

  it('keeps the valid ids from a partially corrupted value', () => {
    window.localStorage.setItem(GUEST_WISHLIST_KEY, JSON.stringify([ID_A, 'oops', ID_B]));

    expect(readGuestWishlist()).toEqual([ID_A, ID_B]);
  });

  it('does not throw when storage refuses a write', () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };

    try {
      // The caller still gets the updated in-memory list; only persistence fails.
      expect(() => addToGuestWishlist(ID_A)).not.toThrow();
    } finally {
      window.localStorage.setItem = original;
    }
  });
});

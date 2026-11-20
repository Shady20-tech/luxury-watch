import { describe, expect, it } from 'vitest';

import { checkImageSignature, detectImageFormat } from '@/lib/images/signature';

/**
 * Image signature detection.
 *
 * The point of these tests is the mismatch case. A single "a PNG is detected as a
 * PNG" test proves the happy path and nothing else — the defect this code exists
 * to prevent is a file whose declared type and bytes disagree, so that is what is
 * asserted, in both directions.
 */

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00);
const GIF = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);
const AVIF = bytes(0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66);
const HTML = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');

describe('detectImageFormat', () => {
  it('identifies each supported container', () => {
    expect(detectImageFormat(JPEG)).toBe('jpeg');
    expect(detectImageFormat(PNG)).toBe('png');
    expect(detectImageFormat(GIF)).toBe('gif');
    expect(detectImageFormat(WEBP)).toBe('webp');
    expect(detectImageFormat(AVIF)).toBe('avif');
  });

  it('does not mistake a RIFF container that is not WebP for one', () => {
    // A WAV file also begins RIFF, so "starts with RIFF" alone is not enough.
    const wav = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45);
    expect(detectImageFormat(wav)).toBeNull();
  });

  it('returns null for text, empty input and a truncated header', () => {
    expect(detectImageFormat(HTML)).toBeNull();
    expect(detectImageFormat(new Uint8Array(0))).toBeNull();
    expect(detectImageFormat(bytes(0xff, 0xd8))).toBeNull();
  });
});

describe('checkImageSignature', () => {
  it('accepts a file whose bytes match its declared type', () => {
    expect(checkImageSignature(PNG, 'image/png')).toEqual({ ok: true, format: 'png' });
    expect(checkImageSignature(WEBP, 'image/webp')).toEqual({ ok: true, format: 'webp' });
  });

  it('refuses a file declared as one image but containing another', () => {
    const result = checkImageSignature(PNG, 'image/jpeg');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detected).toBe('png');
  });

  it('refuses a file declared as an image but containing no image', () => {
    const result = checkImageSignature(HTML, 'image/png');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.detected).toBeNull();
  });

  it('refuses a type that is not on the map at all', () => {
    // SVG is the one image format that can execute script in our origin, so it
    // must be refused by name as well as by the bucket.
    expect(checkImageSignature(JPEG, 'image/svg+xml').ok).toBe(false);
    expect(checkImageSignature(JPEG, 'text/html').ok).toBe(false);
    expect(checkImageSignature(JPEG, '').ok).toBe(false);
  });
});

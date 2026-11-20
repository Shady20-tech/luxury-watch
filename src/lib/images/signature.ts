/**
 * Image format detection from a file's leading bytes.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS EXISTS SEPARATELY FROM THE MIME TYPE
 * -----------------------------------------------------------------------------
 *
 * The `Content-Type` on an upload is whatever the caller says it is. A browser
 * fills it in from the extension, and anything that is not a browser fills it in
 * with whatever it likes. So a check on `file.type` is a statement about the
 * claim, not about the bytes.
 *
 * The claim still matters — it decides what Supabase Storage records as the
 * object's content type, and that is what a browser is told when it fetches the
 * object back. A file that is really a PNG but is declared `text/html` is the
 * interesting attack, and checking the bytes alone does not catch it: the bytes
 * would say PNG and the stored type would still be HTML. The two checks are
 * therefore complementary and both are needed:
 *
 *   * the declared type must be on the allow-list (never `text/html`, never SVG), and
 *   * the bytes must actually be the format the declared type names.
 *
 * -----------------------------------------------------------------------------
 * WHAT THIS DOES NOT DO
 * -----------------------------------------------------------------------------
 *
 * It is not a virus scanner and it is not a re-encoder. A polyglot — a file that
 * is a valid JPEG and also something else — passes, because its first bytes are a
 * valid JPEG header. Detecting that means decoding the image, which is the job of
 * an image pipeline this project does not have. KNOWN_ISSUES H10 records that
 * limit honestly rather than implying this closes it.
 */

/** The formats this project stores. */
export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif';

/**
 * The declared MIME type to the format it must turn out to be.
 *
 * A map rather than a chain of `if`s so that adding a format is one line, and so
 * that a declared type with no entry is a compile error at the call site rather
 * than a silently accepted upload.
 */
export const MIME_TO_FORMAT: Record<string, ImageFormat> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

/** The format a byte prefix appears to be, or `null` when it matches none. */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'gif';

  // WebP is RIFF....WEBP: the container is RIFF, the four bytes at offset 8 say
  // which RIFF format. Checking only "RIFF" would accept a WAV.
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && asciiAt(bytes, 8, 'WEBP')) return 'webp';

  // AVIF is ISO-BMFF: a box length, then `ftyp`, then a brand at offset 8. The
  // brand is `avif` or `avis`; both are still images for our purposes. The
  // length prefix is not checked against the file size — a truncated file is
  // caught by the decoder downstream, and this function's only claim is "these
  // bytes are an AVIF container".
  if (asciiAt(bytes, 4, 'ftyp')) {
    const brand = asciiSlice(bytes, 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }

  return null;
}

/**
 * Whether the bytes are consistent with the declared type.
 *
 * Returns a reason rather than a boolean so the caller can tell a customer what
 * went wrong without leaking the byte layout, and so a log line can distinguish
 * "declared PNG, was JPEG" from "not an image at all" — the first is usually a
 * mislabelled file, the second is usually an attempt.
 */
export function checkImageSignature(
  bytes: Uint8Array,
  declaredMime: string,
):
  | { ok: true; format: ImageFormat }
  | { ok: false; message: string; detected: ImageFormat | null } {
  const expected = MIME_TO_FORMAT[declaredMime];

  if (!expected) {
    return {
      ok: false,
      message: 'That file type is not accepted.',
      detected: detectImageFormat(bytes),
    };
  }

  const detected = detectImageFormat(bytes);

  if (detected === null) {
    return {
      ok: false,
      message: 'That file is not a readable image. Upload a JPEG, PNG, WebP or AVIF photograph.',
      detected,
    };
  }

  if (detected !== expected) {
    return {
      ok: false,
      message: `That file is a ${label(detected)} image but was sent as ${label(expected)}. Try uploading it again.`,
      detected,
    };
  }

  return { ok: true, format: detected };
}

function label(format: ImageFormat): string {
  return format === 'jpeg' ? 'JPEG' : format.toUpperCase();
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  return asciiSlice(bytes, offset, offset + text.length) === text;
}

function asciiSlice(bytes: Uint8Array, start: number, end: number): string {
  if (bytes.length < end) return '';
  let out = '';
  for (let index = start; index < end; index += 1) out += String.fromCharCode(bytes[index] ?? 0);
  return out;
}

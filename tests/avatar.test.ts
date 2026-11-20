import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resetPublicEnvCache } from '@/lib/env';
import {
  AVATAR_BUCKET,
  MAX_AVATAR_BYTES,
  avatarExtension,
  avatarPath,
  avatarPathFromUrl,
  avatarPublicUrl,
} from '@/lib/profile/avatar';

/**
 * Avatar path and URL handling.
 *
 * `avatarPathFromUrl` is the security-relevant one: it decides which URL a
 * delete is allowed to act on. Every test below that asserts a `null` is
 * asserting that the function will not delete something it does not own.
 */
const MANAGED_KEYS = ['NEXT_PUBLIC_SUPABASE_URL'] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of MANAGED_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  resetPublicEnvCache();
});

afterEach(() => {
  for (const key of MANAGED_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  resetPublicEnvCache();
});

function configureSupabase(url = 'https://example.supabase.co') {
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  resetPublicEnvCache();
}

describe('avatarPath', () => {
  it('nests the object under the user id', () => {
    expect(avatarPath('user-1', 'abcdef123', 'png')).toBe('user-1/abcdef123.png');
  });

  it('cannot escape the user folder through the hash or extension', () => {
    // A hash containing a slash would otherwise address another user's folder.
    expect(avatarPath('user-1', '../../other/secret', 'png')).toBe('user-1/othersecret.png');
    expect(avatarPath('user-1', 'abc', '../evil')).toBe('user-1/abc.evil');
  });

  it('falls back to a usable name when the hash is empty', () => {
    expect(avatarPath('user-1', '', 'jpg')).toBe('user-1/avatar.jpg');
  });
});

describe('avatarPublicUrl', () => {
  it('resolves against the configured project', () => {
    configureSupabase();
    expect(avatarPublicUrl('user-1/abc.png')).toBe(
      `https://example.supabase.co/storage/v1/object/public/${AVATAR_BUCKET}/user-1/abc.png`,
    );
  });

  it('is null when Supabase is unconfigured, rather than a broken relative path', () => {
    expect(avatarPublicUrl('user-1/abc.png')).toBeNull();
  });
});

describe('avatarPathFromUrl', () => {
  it('extracts the object path from our own bucket URL', () => {
    configureSupabase();
    const url = `https://example.supabase.co/storage/v1/object/public/${AVATAR_BUCKET}/user-1/abc.png`;
    expect(avatarPathFromUrl(url)).toBe('user-1/abc.png');
  });

  it('refuses a URL on another host that happens to contain the marker', () => {
    configureSupabase();
    const url = `https://evil.example/storage/v1/object/public/${AVATAR_BUCKET}/user-1/abc.png`;
    expect(avatarPathFromUrl(url)).toBeNull();
  });

  it('refuses a URL in a different bucket', () => {
    configureSupabase();
    expect(
      avatarPathFromUrl('https://example.supabase.co/storage/v1/object/public/media/x.png'),
    ).toBeNull();
  });

  it('refuses empty, null and non-URL input', () => {
    configureSupabase();
    expect(avatarPathFromUrl(null)).toBeNull();
    expect(avatarPathFromUrl('')).toBeNull();
    expect(avatarPathFromUrl('not a url')).toBeNull();
  });

  it('is null when Supabase is unconfigured, so nothing is deleted by guesswork', () => {
    expect(
      avatarPathFromUrl(
        `https://example.supabase.co/storage/v1/object/public/${AVATAR_BUCKET}/user-1/abc.png`,
      ),
    ).toBeNull();
  });
});

describe('avatarExtension', () => {
  it('maps each accepted type to an extension', () => {
    expect(avatarExtension('image/jpeg')).toBe('jpg');
    expect(avatarExtension('image/png')).toBe('png');
    expect(avatarExtension('image/webp')).toBe('webp');
    expect(avatarExtension('image/avif')).toBe('avif');
  });

  it('defaults unknown types to jpg rather than emitting an odd extension', () => {
    expect(avatarExtension('application/octet-stream')).toBe('jpg');
  });
});

describe('the bucket limit', () => {
  it('is 2 MB, matching the migration', () => {
    expect(MAX_AVATAR_BYTES).toBe(2 * 1024 * 1024);
  });
});

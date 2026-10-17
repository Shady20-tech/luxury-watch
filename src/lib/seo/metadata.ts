import type { Metadata } from 'next';

import { absoluteUrl, getPublicEnv } from '@/lib/env';

/**
 * Metadata construction.
 *
 * Every public page builds its metadata here so canonical URLs, Open Graph and
 * Twitter cards stay consistent. Per Google's technical guidance, each indexable
 * page declares exactly one canonical URL, and non-indexable surfaces say so
 * explicitly rather than relying on robots.txt alone.
 */

export type RobotsDirective = {
  index?: boolean;
  follow?: boolean;
  /** Adds `noarchive`, useful for pages whose snapshots should not be stored. */
  noarchive?: boolean;
  /** Adds `noimageindex` for pages whose images should not appear in results. */
  noimageindex?: boolean;
};

export type PageMetadataInput = {
  title: string;
  description?: string;
  /** Site-relative canonical path, for example `/products/example`. */
  path: string;
  keywords?: string[];
  images?: { url: string; alt?: string; width?: number; height?: number }[];
  robots?: RobotsDirective;
  type?: 'website' | 'article' | 'product';
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
};

function robotsFrom(directive: RobotsDirective | undefined): Metadata['robots'] {
  if (!directive) return undefined;

  const { index = true, follow = true, noarchive, noimageindex } = directive;

  return {
    index,
    follow,
    ...(noarchive ? { noarchive: true } : {}),
    ...(noimageindex ? { noimageindex: true } : {}),
    googleBot: {
      index,
      follow,
      ...(noarchive ? { noarchive: true } : {}),
      ...(noimageindex ? { noimageindex: true } : {}),
      // Let Google use the largest available image and a full text snippet.
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  };
}

/**
 * Build page metadata. `metadataBase` is set so Next.js can resolve relative
 * URLs; absolute URLs are still produced explicitly for canonical and OG.
 */
export function buildMetadata(input: PageMetadataInput): Metadata {
  const { siteName } = getPublicEnv();
  const canonical = absoluteUrl(input.path);

  const images = input.images?.length
    ? input.images.map((image) => ({
        url: /^https?:\/\//i.test(image.url) ? image.url : absoluteUrl(image.url),
        ...(image.alt ? { alt: image.alt } : {}),
        ...(image.width ? { width: image.width } : {}),
        ...(image.height ? { height: image.height } : {}),
      }))
    : undefined;

  return {
    title: input.title,
    description: input.description,
    keywords: input.keywords,
    alternates: { canonical },
    robots: robotsFrom(input.robots),
    openGraph: {
      type: input.type === 'product' ? 'website' : (input.type ?? 'website'),
      title: input.title,
      description: input.description,
      url: canonical,
      siteName,
      locale: 'en_US',
      ...(images ? { images } : {}),
      ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
      ...(input.authors ? { authors: input.authors } : {}),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: input.title,
      description: input.description,
      ...(images ? { images: images.map((image) => image.url) } : {}),
    },
  };
}

/**
 * Metadata for a surface that must never be indexed: account, cart, admin,
 * order requests and API responses.
 */
export function noIndexMetadata(title: string): Metadata {
  return {
    title,
    robots: robotsFrom({ index: false, follow: false, noarchive: true, noimageindex: true }),
  };
}

/**
 * Metadata for a paginated or faceted listing.
 *
 * Multi-facet permutations are told not to be indexed, and the canonical points
 * at the clean collection URL. This is the crawl-trap hygiene the reference site
 * only enforces through `robots.txt` patterns.
 */
export function buildListingMetadata(
  input: Omit<PageMetadataInput, 'robots'> & {
    canonicalPath: string;
    indexable: boolean;
  },
): Metadata {
  return buildMetadata({
    ...input,
    path: input.canonicalPath,
    robots: { index: input.indexable, follow: true },
  });
}

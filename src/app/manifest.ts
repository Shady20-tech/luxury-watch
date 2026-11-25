import type { MetadataRoute } from 'next';

import { getPublicEnv } from '@/lib/env';

/**
 * Web app manifest. Enables a standalone install and gives the browser a name,
 * icon and theme colour without a third-party service.
 */
export default function manifest(): MetadataRoute.Manifest {
  const { siteName } = getPublicEnv();

  return {
    name: siteName,
    short_name: siteName,
    description: 'A curated luxury watch storefront.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

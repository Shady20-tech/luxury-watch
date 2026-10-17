import type { Metadata, Viewport } from 'next';
import { Cardo, Nunito } from 'next/font/google';

import { JsonLd } from '@/components/seo/json-ld';
import { getPublicEnv } from '@/lib/env';
import { organizationSchema, websiteSchema } from '@/lib/seo/schema';

import './globals.css';

/**
 * Fonts are self-hosted through `next/font`, which inlines the `@font-face`
 * rules, subsets the files and eliminates the layout shift and extra request a
 * third-party font host would add. Both are `display: swap` so text is readable
 * immediately.
 */
const cardo = Cardo({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-cardo',
  display: 'swap',
  preload: true,
});

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-nunito',
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  // Lets Next.js resolve relative URLs in metadata. Absolute URLs are still
  // produced explicitly by the metadata builders.
  metadataBase: new URL(getPublicEnv().siteUrl),
  title: {
    default: getPublicEnv().siteName,
    template: `%s | ${getPublicEnv().siteName}`,
  },
  applicationName: getPublicEnv().siteName,
  formatDetection: { telephone: true, address: true, email: true },
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Deliberately allows pinch-zoom up to 5x. Blocking zoom is a WCAG 1.4.4
  // failure, and the reference site sets `user-scalable=0`.
  maximumScale: 5,
  userScalable: true,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${cardo.variable} ${nunito.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        {/* First focusable element on the page, so keyboard users can bypass
            the header instead of tabbing through every navigation link. */}
        <a href="#main-content" className="sr-only-focusable">
          Skip to main content
        </a>
        {children}
        {/* Site-wide identity. Emitted once here rather than repeated on every
            page; individual pages reference these nodes by `@id`. */}
        <JsonLd nodes={[organizationSchema(), websiteSchema()]} />
      </body>
    </html>
  );
}

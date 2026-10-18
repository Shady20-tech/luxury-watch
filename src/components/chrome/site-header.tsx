import Link from 'next/link';

import { AnnouncementBar } from '@/components/chrome/announcement-bar';
import { DesktopNav } from '@/components/chrome/desktop-nav';
import { HeaderActionsLive } from '@/components/chrome/header-actions-live';
import { MobileNav } from '@/components/chrome/mobile-nav';
import { Wordmark } from '@/components/chrome/wordmark';
import type { ChromeData } from '@/lib/navigation/types';

/**
 * Site header.
 *
 * A Server Component: it renders navigation data and holds no interaction of
 * its own. The interactive parts (mega menu, mobile drawer, announcement
 * rotation) are small Client Components, so the JavaScript shipped for the
 * header is limited to what actually needs it.
 *
 * The header is sticky and frosted. Sticky positioning is used rather than a
 * scroll listener: it is compositor-driven, needs no JavaScript, and cannot
 * jitter. `border-b` gives a hairline instead of a heavy shadow.
 */
export function SiteHeader({ data }: { data: ChromeData }) {
  return (
    <header className="sticky top-0 z-40">
      <AnnouncementBar announcements={data.announcements} />

      <div className="glass-panel border-line-200 border-b">
        <div className="container-page flex h-16 items-center gap-4 lg:h-20">
          <MobileNav data={data} />

          <Wordmark identity={data.identity} />

          {/* `DesktopNav` renders its own `<nav aria-label="Primary">` through
              Radix, so this wrapper is a plain div. Nesting a second `<nav>`
              here would create two navigation landmarks with the same name,
              which axe flags as a `landmark-unique` violation and which makes
              the landmark list ambiguous for a screen reader.

              The wrapper is `hidden lg:block` rather than always present. The
              nav inside is hidden below `lg`, but `ml-6` and `flex-1` on the
              wrapper would still occupy 24px of the header at 320px, which is
              enough to push the action icons past the viewport edge. Hiding the
              wrapper as well removes the space along with the nav. */}
          <div className="ml-6 hidden flex-1 lg:block">
            <DesktopNav items={data.header} />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {/* Appointment is the one commercial call to action the reference
                puts in the header, so it is kept — but only where there is room
                for the full label. Below `xl` it moves into the drawer, where it
                is still reachable, rather than being squeezed or truncated. */}
            <Link
              href="/contact"
              className="border-line-300 hover:border-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700 mr-1 hidden h-10 items-center rounded-sm border px-4 text-sm font-medium xl:inline-flex"
            >
              Book an appointment
            </Link>

            <HeaderActionsLive />
          </div>
        </div>
      </div>
    </header>
  );
}

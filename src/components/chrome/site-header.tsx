import Link from 'next/link';

import { AnnouncementBar } from '@/components/chrome/announcement-bar';
import { DesktopNav } from '@/components/chrome/desktop-nav';
import { HeaderActionsLive } from '@/components/chrome/header-actions-live';
import { HeaderSearch } from '@/components/chrome/header-search';
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
 * -----------------------------------------------------------------------------
 * THE GLASS
 * -----------------------------------------------------------------------------
 *
 * The reference header is opaque black. This one is dark *frosted glass*: the
 * same near-black ground, but translucent, so the page reads through it as the
 * visitor scrolls. That is the one deliberate departure from the reference.
 *
 * Glass on a sticky header is the hardest contrast case on the site, because
 * the backdrop is whatever has been scrolled underneath and is therefore
 * unknown. A white page behind a translucent dark panel is the worst case for
 * light text: it lifts the composite towards mid-grey. `--color-glass-night` is
 * tuned for that case, and `tests/design-tokens.test.ts` composites the real
 * alpha over a white, a mid-grey and a dark backdrop and asserts the resulting
 * contrast, rather than trusting the nominal value.
 *
 * `backdrop-filter` is not universally supported. The declaration order in the
 * `glass-panel-night` utility means a browser without it keeps the translucent
 * background and simply loses the blur — the header still reads correctly, it
 * is just not frosted. Nothing depends on the blur having applied.
 *
 * -----------------------------------------------------------------------------
 * LAYOUT
 * -----------------------------------------------------------------------------
 *
 * Two rows, matching the reference: a utility row with the wordmark, the search
 * field and the action icons, then a navigation row beneath it. The reference
 * also puts the phone number and email in the utility row; that is left to the
 * drawer here, because at 320px it is the first thing that would force a
 * horizontal scroll and the audit checks for exactly that.
 *
 * The search field is `hidden md:block` — it is a large control and there is no
 * honest way to fit it beside the wordmark and four action icons on a phone. On
 * smaller screens the search action still reaches `/search`.
 */
export function SiteHeader({ data }: { data: ChromeData }) {
  return (
    <header className="sticky top-0 z-40">
      <AnnouncementBar announcements={data.announcements} />

      <div className="glass-panel-night border-b border-white/10">
        <div className="container-page">
          <div className="flex h-16 items-center gap-4 lg:h-20">
            <MobileNav data={data} />

            <Wordmark identity={data.identity} tone="light" />

            <HeaderSearch className="mx-auto hidden w-full max-w-md md:block" />

            <div className="ml-auto flex shrink-0 items-center gap-1 md:ml-0">
              {/* The appointment CTA is the one commercial action the reference
                  keeps in the header, so it stays — but only where there is room
                  for the full label. Below `xl` it moves into the drawer, where
                  it is still reachable, rather than being squeezed. */}
              <Link
                href="/contact"
                className="mr-1 hidden h-10 items-center rounded-sm border border-white/25 px-4 text-sm font-medium text-on-night transition-colors hover:border-white/60 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300 xl:inline-flex"
              >
                Book an appointment
              </Link>

              <HeaderActionsLive />
            </div>
          </div>

          {/* The navigation row. `DesktopNav` renders its own navigation
              landmark labelled "Primary", so this wrapper is a plain div:
              nesting a second nav element here would create two navigation
              landmarks with the same name, which axe reports as
              `landmark-unique` and which makes the landmark list ambiguous for
              a screen reader. */}
          <div className="hidden border-t border-white/10 lg:block">
            <DesktopNav items={data.header} />
          </div>
        </div>
      </div>
    </header>
  );
}

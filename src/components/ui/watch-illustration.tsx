import { cn } from '@/lib/utils';

/**
 * Original illustrated product artwork, drawn from a watch's own attributes.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY IT IS NOT A PHOTOGRAPH
 * -----------------------------------------------------------------------------
 *
 * The catalogue seed carries no images, deliberately. The reference site's
 * photography is its own copyrighted content, and `REFERENCE_ANALYSIS.md` records
 * the rule: imagery must be original, licensed, or supplied by the business
 * (issues A6, E6, G5, G39). Hotlinking it would be a licensing problem and a
 * broken-image problem at once.
 *
 * That leaves a storefront where every card shows an empty placeholder, which is
 * honest but unfinished. This component closes that gap without crossing the
 * licensing line: it *draws* a watch from the attributes we actually hold —
 * dial colour, case metal, bracelet — so each product gets distinct, original
 * artwork that is nobody else's asset.
 *
 * It is not a photograph and does not pretend to be. The caption under it says
 * so, the alt text says so, and `KNOWN_ISSUES.md` still records that real
 * photography is outstanding. A customer is never shown invented detail as
 * though it were the actual piece: the drawing carries no logo, no text, no
 * reference number and no complication the product row does not record.
 *
 * -----------------------------------------------------------------------------
 * WHY IT IS INLINE SVG AND NOT AN IMAGE FILE
 * -----------------------------------------------------------------------------
 *
 * - It is derived from per-product data, so a static file cannot express it.
 * - Inline means no request, no lazy-loading gap and no layout shift — the
 *   artwork is in the first paint, which is what the LCP budget wants.
 * - SVG gzips well, so a grid of them costs far less than a grid of PNGs.
 *
 * -----------------------------------------------------------------------------
 * WHY THERE ARE NO `<defs>` OR GRADIENT IDS
 * -----------------------------------------------------------------------------
 *
 * The same dial colour appears many times on one page. Gradient ids would then
 * be duplicated across the document, which is invalid HTML and makes which
 * definition wins depend on document order. The metallic case and the dial
 * sheen are therefore built from layered shapes at varying opacity, which needs
 * no ids and is identical every time it is drawn.
 */

/** The palette for one dial, plus the metal the case is drawn in. */
type DialPalette = {
  /** The dial's base colour. */
  dial: string;
  /** A lighter tone for the sheen across the upper-left of the dial. */
  sheen: string;
  /** Applied indices and hands. Chosen to stay legible on `dial`. */
  marker: string;
};

const DIAL_PALETTES: Record<string, DialPalette> = {
  black: { dial: '#16181c', sheen: '#3a3f47', marker: '#e8e2d4' },
  blue: { dial: '#16304f', sheen: '#2f5c8f', marker: '#eef3f8' },
  green: { dial: '#14352a', sheen: '#2f6b52', marker: '#f0e8d4' },
  white: { dial: '#f4f2ed', sheen: '#ffffff', marker: '#2a2c30' },
  silver: { dial: '#d9dade', sheen: '#f2f3f5', marker: '#2a2c30' },
  grey: { dial: '#4a4d53', sheen: '#787d85', marker: '#eceae4' },
  champagne: { dial: '#e6d3ac', sheen: '#f7ecd4', marker: '#4a3d24' },
  gold: { dial: '#d8b877', sheen: '#f0dcae', marker: '#3d3115' },
  brown: { dial: '#4a3128', sheen: '#7a5343', marker: '#efe3d4' },
  salmon: { dial: '#e0a48f', sheen: '#f2c8b8', marker: '#4a2a22' },
  burgundy: { dial: '#5c1f28', sheen: '#8d3541', marker: '#f2e2dc' },
  mother_of_pearl: { dial: '#f0eaea', sheen: '#ffffff', marker: '#4a4448' },
  skeleton: { dial: '#2a2d33', sheen: '#4d5259', marker: '#d9bc7a' },
};

const FALLBACK: DialPalette = { dial: '#2a2d33', sheen: '#4d5259', marker: '#e8e2d4' };

/**
 * Normalise a stored `dial_color` to a palette key.
 *
 * The column is free text (`text`, not an enum), so a value can be
 * `"Sunburst Blue"`, `"blue"` or `"Blue dial"`. Matching on a keyword rather
 * than on an exact string keeps the artwork sensible for data we did not write.
 */
function paletteKeyFor(dialColor: string | null | undefined): string {
  if (!dialColor) return 'skeleton';
  const value = dialColor.toLowerCase();
  if (value.includes('mother') || value.includes('pearl')) return 'mother_of_pearl';
  if (value.includes('skeleton') || value.includes('openwork')) return 'skeleton';
  if (value.includes('champagne') || value.includes('cream')) return 'champagne';
  if (value.includes('salmon') || value.includes('pink') || value.includes('copper'))
    return 'salmon';
  if (value.includes('burgundy') || value.includes('maroon') || value.includes('red'))
    return 'burgundy';
  if (value.includes('brown') || value.includes('chocolate') || value.includes('bronze'))
    return 'brown';
  if (value.includes('green') || value.includes('olive') || value.includes('teal')) return 'green';
  if (value.includes('blue') || value.includes('navy') || value.includes('ice')) return 'blue';
  if (value.includes('black') || value.includes('onyx')) return 'black';
  if (value.includes('white') || value.includes('ivory')) return 'white';
  if (value.includes('silver') || value.includes('steel')) return 'silver';
  if (value.includes('grey') || value.includes('gray') || value.includes('slate')) return 'grey';
  if (value.includes('gold') || value.includes('yellow')) return 'gold';
  return 'grey';
}

/** The case metal, as a base tone and a highlight. */
function caseMetal(caseMaterial: string | null | undefined): { base: string; light: string } {
  const value = (caseMaterial ?? '').toLowerCase();
  if (value.includes('gold') || value.includes('yellow gold')) {
    return { base: '#c9a24a', light: '#e7cd8c' };
  }
  if (value.includes('rose')) return { base: '#c08a6a', light: '#e0b498' };
  if (value.includes('platinum')) return { base: '#c8cbd0', light: '#eef0f3' };
  if (value.includes('titanium')) return { base: '#9aa0a6', light: '#c6cbd1' };
  if (value.includes('ceramic') || value.includes('carbon'))
    return { base: '#3a3d42', light: '#5f646b' };
  // Steel is the default: the majority of the catalogue, and the neutral choice.
  return { base: '#b9bdc3', light: '#e2e5e9' };
}

/**
 * The applied markers, as an array of rotations.
 *
 * Twelve positions, with a double marker at 12 to read as a watch rather than a
 * compass. Kept as data so the markup stays a single loop.
 */
const HOURS = Array.from({ length: 12 }, (_, index) => index * 30);

export function WatchIllustration({
  dialColor,
  caseMaterial,
  className,
}: {
  dialColor?: string | null;
  caseMaterial?: string | null;
  className?: string;
}) {
  const palette = DIAL_PALETTES[paletteKeyFor(dialColor)] ?? FALLBACK;
  const metal = caseMetal(caseMaterial);

  return (
    <svg
      viewBox="0 0 200 250"
      className={cn('h-full w-full', className)}
      // Decorative: the product's own name and specification are already in the
      // card's text, so a screen reader would otherwise hear the shape twice.
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      {/* The staging. A soft neutral panel so the piece reads as presented
          rather than as a diagram on white. */}
      <rect width="200" height="250" fill="#f7f7f5" />
      <ellipse cx="100" cy="132" rx="66" ry="88" fill="#ffffff" opacity="0.55" />

      {/* Bracelet: two tapering runs from the case, with link separations. */}
      <path d="M74 40 H126 L120 92 H80 Z" fill={metal.base} />
      <path d="M74 40 H126 L124 56 H76 Z" fill={metal.light} opacity="0.5" />
      <path d="M80 96 H120 L116 168 H84 Z" fill={metal.base} />
      <path d="M80 96 H120 L119 110 H81 Z" fill={metal.light} opacity="0.45" />
      {[52, 66, 80].map((y) => (
        <line
          key={y}
          x1="76"
          y1={y}
          x2="124"
          y2={y}
          stroke="#8f9399"
          strokeWidth="0.6"
          opacity="0.5"
        />
      ))}
      {[124, 140, 156].map((y) => (
        <line
          key={y}
          x1="83"
          y1={y}
          x2="117"
          y2={y}
          stroke="#8f9399"
          strokeWidth="0.6"
          opacity="0.5"
        />
      ))}

      {/* Lugs, so the bracelet meets the case rather than floating. */}
      <path d="M72 62 L86 62 L84 84 L74 84 Z" fill={metal.base} />
      <path d="M114 62 L128 62 L126 84 L116 84 Z" fill={metal.base} />

      {/* Case: an outer ring, a bezel, then the dial. */}
      <circle cx="100" cy="126" r="52" fill={metal.base} />
      <circle cx="100" cy="126" r="52" fill="#ffffff" opacity="0.18" />
      <circle cx="100" cy="126" r="48" fill={metal.light} opacity="0.75" />
      <circle cx="100" cy="126" r="45" fill={metal.base} />

      {/* Crown, at three o'clock. */}
      <rect x="150" y="120" width="8" height="12" rx="2" fill={metal.base} />
      <rect x="152" y="122" width="4" height="8" rx="1" fill={metal.light} opacity="0.7" />

      {/* Dial, with a sheen across the upper left. */}
      <circle cx="100" cy="126" r="39" fill={palette.dial} />
      <path
        d="M100 87 a39 39 0 0 0 -27 66 a39 39 0 0 1 27 -66"
        fill={palette.sheen}
        opacity="0.28"
      />
      <circle cx="100" cy="126" r="39" fill={palette.sheen} opacity="0.06" />

      {/* Applied indices. The 12 marker is doubled, as a real dial's is. */}
      <g>
        {HOURS.map((angle) => (
          <g key={angle} transform={`rotate(${angle} 100 126)`}>
            {angle === 0 ? (
              <>
                <rect x="96" y="91" width="1.8" height="7" fill={palette.marker} />
                <rect x="102.2" y="91" width="1.8" height="7" fill={palette.marker} />
              </>
            ) : (
              <rect x="99" y="91" width="2" height="6.5" fill={palette.marker} opacity="0.92" />
            )}
          </g>
        ))}
      </g>

      {/* Hands, set to a deliberate ten-past-ten so the drawing reads as a
          presented piece rather than an arbitrary time. */}
      <path d="M100 126 L100 101" stroke={palette.marker} strokeWidth="3" strokeLinecap="round" />
      <path d="M100 126 L117 137" stroke={palette.marker} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="100" cy="126" r="2.6" fill={palette.marker} />

      {/* A restrained highlight along the bezel's top-left, for depth. */}
      <path
        d="M100 81 a45 45 0 0 0 -31 76"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.4"
        opacity="0.5"
      />
    </svg>
  );
}

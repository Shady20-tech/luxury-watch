/**
 * Editorial photography used to dress the public site.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS A CODE FILE AND NOT A DATABASE TABLE
 * -----------------------------------------------------------------------------
 *
 * These images decorate page chrome — a hero band, an editorial split — rather
 * than record which photograph shows which watch for sale. They are not
 * catalogue media, so they do not belong in `product_images`. Keeping them here
 * means the attribution travels with the asset in the same commit, cannot be
 * lost by a partial seed, and is typechecked.
 *
 * -----------------------------------------------------------------------------
 * THE LICENCE RULE
 * -----------------------------------------------------------------------------
 *
 * Every entry is CC BY, CC BY-SA or CC0 — the families that permit commercial
 * use. NC and ND variants are not eligible: this is a commercial storefront, and
 * ND would forbid the crop applied here. A ported licence (`CC BY-SA 3.0 fr`) is
 * also excluded, because the deed is not the one the unported URL describes.
 *
 * Every CC BY / CC BY-SA entry names its author, because those licences require
 * it. CC0 does not legally require attribution, but we credit anyway so the
 * provenance of every pixel on the site is traceable.
 *
 * `tests/site-photography.test.ts` asserts each file exists, each credit is
 * present, and each licence URL matches the licence named. Adding an image
 * without its attribution fails the suite rather than shipping.
 *
 * -----------------------------------------------------------------------------
 * WHAT THESE ARE NOT
 * -----------------------------------------------------------------------------
 *
 * None of these is a photograph of a watch we have in stock, and none may be
 * used on a product card or detail page. Those keep using `product_images` and
 * its `is_representative` flag. Using one of these there would present a stock
 * photograph as the actual piece for sale, which is a misdescription.
 */

export type SitePhotograph = {
  /** Path under `public/`, as the browser requests it. */
  src: string;
  /** What the image shows. Used as `alt` where the image carries meaning. */
  alt: string;
  /** Photographer or uploader, as named on the source page. */
  credit: string;
  licence: SitePhotographLicence;
  licenceUrl: string;
  /** The Commons file page, so the licence can be traced back. */
  sourceUrl: string;
  width: number;
  height: number;
};

export type SitePhotographLicence =
  | 'CC BY 2.0'
  | 'CC BY 2.5'
  | 'CC BY 4.0'
  | 'CC BY-SA 2.0'
  | 'CC BY-SA 3.0'
  | 'CC BY-SA 4.0'
  | 'CC0';

export const SITE_PHOTOGRAPHY = {
  /** A watchmaker's bench with tools laid out. The warmest, most human image we have. */
  watchmakerBench: {
    src: '/site-photography/watchmaker-bench.webp',
    alt: 'A watchmaker’s bench with hand tools laid out ready for a service.',
    credit: 'Yılmaz Kilim',
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Watchmaker_(184539829).jpeg',
    width: 2000,
    height: 1125,
  },

  /** An exposed chronograph calibre. Reads as craft and engineering. */
  omegaCalibre1861: {
    src: '/site-photography/omega-calibre-1861.webp',
    alt: 'An exposed mechanical chronograph movement, showing the bridges and column wheel.',
    credit: 'Shane Lin',
    licence: 'CC BY-SA 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Omega_Cal._1861_Chronograph_Movement.jpg',
    width: 2000,
    height: 1125,
  },

  /** A movement on a neutral ground — a quiet decorative panel. */
  burenMovement: {
    src: '/site-photography/buren-movement.webp',
    alt: 'An exposed mechanical watch movement photographed from above.',
    credit: 'Raminagrobis',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Buren_1000_watch_movement.jpg',
    width: 1400,
    height: 1400,
  },

  /** Gold Day-Date dials in several lacquered colours. Colour for a dark band. */
  rolexStellaDials: {
    src: '/site-photography/rolex-stella-dials.webp',
    alt: 'Several gold wristwatches with lacquered dials in different colours.',
    credit: 'Kevin Sweeney',
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rolex_Day-Date_Lacquered_Stella_Dial.jpg',
    width: 2000,
    height: 1125,
  },

  /** A gold Oyster Perpetual. Warm, and reads as a classic dress watch. */
  rolexOysterPerpetual: {
    src: '/site-photography/rolex-oyster-perpetual.webp',
    alt: 'A gold Rolex Oyster Perpetual wristwatch with a champagne dial.',
    credit: 'Camwolf12',
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Rolex_Oyster_Perpetual_with_a_%22Jubliee%22_dial.jpg',
    width: 2000,
    height: 1125,
  },

  /** A GMT with a two-tone bezel: the dark, graphic, high-contrast watch shot. */
  rolexGmtBatgirl: {
    src: '/site-photography/rolex-gmt-batgirl.webp',
    alt: 'A steel Rolex GMT-Master II with a blue and black bezel.',
    credit: 'Brattyq',
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rolex-GMT-Master-II-Batgirl.jpg',
    width: 1200,
    height: 1500,
  },

  /** A gold Submariner with a coloured dial. Fills a portrait slot. */
  rolexSubmarinerSultan: {
    src: '/site-photography/rolex-submariner-sultan.webp',
    alt: 'A gold Rolex Submariner with a deep blue dial on a matching bracelet.',
    credit: 'EMore98',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Rolex_Submariner_ref._16618_Sultan_Dial.jpg',
    width: 1400,
    height: 1400,
  },

  /** A dark, sculptural coin watch. Reads almost as an object, not a product. */
  corumCoinwatch: {
    src: '/site-photography/corum-coinwatch.webp',
    alt: 'A gold coin watch photographed against a dark ground.',
    credit: 'Chcrm',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Corum_CoinWatch_Mushroom_BlackBackground.jpg',
    width: 1000,
    height: 1250,
  },

  /** A blue-dial sports watch on a dark ground. */
  midoOceanStar: {
    src: '/site-photography/mido-ocean-star.webp',
    alt: 'A blue-dial sports watch photographed against a dark background.',
    credit: 'Minzoblate',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Mido-Ocean-Star-V-Blue-Dial-1024.jpg',
    width: 1200,
    height: 1500,
  },

  /** A cabinet of Patek Philippes. Editorial, and unmistakably a collection. */
  patekDisplay: {
    src: '/site-photography/patek-display.webp',
    alt: 'A display of Patek Philippe watches in a boutique cabinet.',
    credit: 'Kamal Aboul-Hosn',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Tiffany%27s_Patek_Philippe_Watch_Collection_03.jpg',
    width: 2000,
    height: 1125,
  },

  /**
   * A gold key-wound pocket watch against a dark ground.
   *
   * The account and authentication pages need an image that reads as *personal*
   * rather than as stock: an inherited object with a chain, not another steel
   * sports watch. It is also the darkest of the landscape plates after the
   * coin-watch, so it holds up behind white text on the sign-in band.
   */
  pocketWatch: {
    src: '/site-photography/pocket-watch.webp',
    alt: 'A gold key-wound pocket watch photographed against a dark ground.',
    credit: 'Anonymous (Warsaw)',
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Warsaw_Gold_pocket_watch_of_Fryderyk_Chopin_01.jpg',
    width: 2000,
    height: 1125,
  },
  /**
   * Per-brand hero plates.
   *
   * These are the *same* photographs as the brand's seed product images, recomposed
   * rather than reused as-is: the watch sits right of centre on a dark ground with
   * a left-to-right wash, so the headline column stays clear and the band reads as
   * a brand page rather than a product page.
   *
   * They exist because the brand heroes were previously pointed at whichever
   * editorial plate happened to be free, which put a Rolex Submariner on the
   * Audemars Piguet page and a Corum coin watch on Richard Mille. Showing one
   * maker's watch to introduce another is a misdescription, so each brand now has
   * a plate of a piece that brand actually made. The credit is the product image's
   * credit, because it is that photograph.
   */
  brandRolex: {
    src: '/site-photography/brand-rolex.webp',
    alt: 'A Rolex Milgauss with a black dial on a dark ground.',
    credit: 'Defiancekofb',
    licence: 'CC BY-SA 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Milgaussnew.jpg',
    width: 2000,
    height: 1125,
  },

  brandAudemarsPiguet: {
    src: '/site-photography/brand-audemars-piguet.webp',
    alt: 'An Audemars Piguet Royal Oak perpetual calendar with a gold case and blue dial.',
    credit: 'Clyde94',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Audemars_Piguet_Royal_Oak_in_oro_con_calendario_perpetuo,_met%C3%A0_anni_Novanta.jpg',
    width: 2000,
    height: 1125,
  },

  brandPatekPhilippe: {
    src: '/site-photography/brand-patek-philippe.webp',
    alt: 'A Patek Philippe Cubitus with a blue dial and integrated bracelet.',
    credit: 'Partynia',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Patek_Cubitus1.png',
    width: 2000,
    height: 1125,
  },

  brandOmega: {
    src: '/site-photography/brand-omega.webp',
    alt: 'An Omega Speedmaster chronograph with a black dial and steel bezel.',
    credit: 'Unknown (Wikimedia Commons)',
    licence: 'CC BY 2.5',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.5',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:OMEGA_Speedmaster_CK2915_(cropped_to_watch_case).JPG',
    width: 2000,
    height: 1125,
  },

  brandCartier: {
    src: '/site-photography/brand-cartier.webp',
    alt: 'A Cartier Santos with a square steel case and exposed bezel screws.',
    credit: 'Pittigrilli',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cartier_Santos_wristwatch.jpg',
    width: 2000,
    height: 1125,
  },

  brandGrandSeiko: {
    src: '/site-photography/brand-grand-seiko.webp',
    alt: 'A Grand Seiko automatic with a black dial and a steel bracelet.',
    credit: 'STSPP',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Grand_Seiko_Caliber_9S65_Automatic.JPG',
    width: 2000,
    height: 1125,
  },

  brandJaegerLeCoultre: {
    src: '/site-photography/brand-jaeger-lecoultre.webp',
    alt: 'A Jaeger-LeCoultre Reverso with its reversible rectangular case.',
    credit: 'Tiberido',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Jaeger-LeCoultre-Reverso.jpg',
    width: 2000,
    height: 1125,
  },

  brandBreitling: {
    src: '/site-photography/brand-breitling.webp',
    alt: 'A Breitling Navitimer chronograph with a circular slide rule bezel.',
    credit: 'Torsten Bolten',
    licence: 'CC BY-SA 3.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Breitling_Navitimer_chronograph_watch.jpg',
    width: 2000,
    height: 1125,
  },

  richardMilleRm030: {
    src: '/site-photography/richard-mille-rm030.webp',
    alt: 'A Richard Mille RM 030 with a skeletonised dial and a tonneau case.',
    credit: 'Y.Leclercq',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:RM_030_Automatic.jpg',
    width: 2000,
    height: 1125,
  },

  /* ---------------------------------------------------------------------------
     Editorial plates added for the Phase 5 catalogue and the console.

     Chosen for what they show rather than for a brand: three "collection" flats
     give the shop, brand and collection bands a row of watches rather than one
     object, and the museum pieces give the service and journal pages a warmer,
     older register than the modern sports models already here.
     --------------------------------------------------------------------------- */

  /** Three Speedmasters laid out side by side. The strongest group shot we hold. */
  omegaSpeedmasterTrio: {
    src: '/site-photography/omega-speedmaster-trio.webp',
    alt: 'Three Omega Speedmaster chronographs arranged side by side.',
    credit: 'Auge=mit',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Omega_Speedmaster_compilation_pp01.jpg',
    width: 2000,
    height: 1125,
  },

  /** A modern steel dive watch. Reads as "tool watch", the opposite of the dress plates. */
  seikoProspexDiver: {
    src: '/site-photography/seiko-prospex-diver.webp',
    alt: 'A steel Seiko Prospex dive watch with a black dial on a steel bracelet.',
    credit: 'Deerpeter',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Seiko_Prospex_SPB143J1.png',
    width: 2000,
    height: 1125,
  },

  /** A flat of dress watches on a dark ground. Pairs with the steel-sports plate. */
  collectionDressWatches: {
    src: '/site-photography/collection-dress-watches.webp',
    alt: 'A group of dress wristwatches with leather straps laid out together.',
    credit: 'Zane Loke',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Watch_Collection_1.jpg',
    width: 2000,
    height: 1125,
  },

  /** A flat of steel sports watches. The catalogue's own register. */
  collectionSteelSports: {
    src: '/site-photography/collection-steel-sports.webp',
    alt: 'Several steel sports wristwatches grouped together on a dark surface.',
    credit: 'Zane Loke',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Watch_Collection_2.jpg',
    width: 2000,
    height: 1125,
  },

  /** Boxed vintage pieces. Carries the "box and papers" story without claiming stock. */
  collectionVintageBoxed: {
    src: '/site-photography/collection-vintage-boxed.webp',
    alt: 'Vintage wristwatches shown with their presentation boxes.',
    credit: 'Zane Loke',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Watch_Collection_3.jpg',
    width: 2000,
    height: 1125,
  },

  /** A gold pocket watch on black. Warm, high contrast, good under a serif title. */
  goldPocketWatch: {
    src: '/site-photography/gold-pocket-watch.webp',
    alt: 'A gold pocket watch photographed against a black ground.',
    credit: 'Auckland Museum Collections',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Watch,_Gold_(48708080673).jpg',
    width: 2000,
    height: 1125,
  },

  /** A watch beside its box. The plainest statement of what "full set" means. */
  watchAndBox: {
    src: '/site-photography/watch-and-box.webp',
    alt: 'A wristwatch displayed next to its presentation box.',
    credit: 'Auckland Museum Collections',
    licence: 'CC BY 2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/2.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Watch_and_Box_(48709551141).jpg',
    width: 2000,
    height: 1125,
  },

  /** An exhibition caseback on a movement. The craft plate for the service pages. */
  exhibitionCaseback: {
    src: '/site-photography/exhibition-caseback.webp',
    alt: 'A wristwatch with a transparent caseback showing its automatic movement.',
    credit: 'Petar Milošević',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl:
      'https://commons.wikimedia.org/wiki/File:Self-winding_wristwatch_(transparent_backside).jpg',
    width: 2000,
    height: 1125,
  },
} as const satisfies Record<string, SitePhotograph>;

export type SitePhotographKey = keyof typeof SITE_PHOTOGRAPHY;

export function photograph(key: SitePhotographKey): SitePhotograph {
  return SITE_PHOTOGRAPHY[key];
}

/**
 * Resolve a database-stored `hero_image_url` to a resolvable hero, or `null`.
 *
 * The column holds a plain path (`/site-photography/x.webp`), but
 * `PageHero` wants a whole `SitePhotograph`. Everything the hero needs beyond
 * the path — the alt text, the credit, the intrinsic dimensions — lives in this
 * registry, not in the row, so the row stays a single string an administrator
 * can edit in the admin.
 *
 * Two outcomes only:
 *
 *  - a path that is in the registry resolves to its entry, and the hero renders;
 *  - anything else returns `null`, and the hero renders its plain dark band.
 *
 * Returning `null` rather than a half-built object is the same discipline
 * `resolveImageUrl` follows for catalogue images: a path we cannot attribute is
 * not shown, because showing it would put an uncredited photograph on the site
 * with no way for the licence to travel with it. An administrator who uploads a
 * picture to Storage and pastes the URL here therefore gets the plain band, not
 * a broken image and not an unattributed one.
 */
export function resolveSitePhotograph(path: string | null | undefined): SitePhotograph | null {
  if (!path) return null;
  const match = Object.values(SITE_PHOTOGRAPHY).find((entry) => entry.src === path);
  return match ?? null;
}

/**
 * The per-brand plates, keyed by the brand slug the database uses.
 *
 * A brand tile that shows a photograph has to show a watch that brand made, or
 * it is introducing Rolex with a Breitling and the storefront is misdescribing
 * its own stock. Each plate below is already the brand's own piece, which is why
 * the mapping is explicit rather than derived from the brand name.
 */
const BRAND_PLATE = {
  rolex: 'brandRolex',
  'patek-philippe': 'brandPatekPhilippe',
  'audemars-piguet': 'brandAudemarsPiguet',
  'richard-mille': 'richardMilleRm030',
  omega: 'brandOmega',
  cartier: 'brandCartier',
  'grand-seiko': 'brandGrandSeiko',
  'jaeger-lecoultre': 'brandJaegerLeCoultre',
  breitling: 'brandBreitling',
} as const satisfies Record<string, SitePhotographKey>;

/**
 * The plate for a brand slug, or `null` for a brand we hold no plate of.
 *
 * `null` is deliberate and is the honest answer: a brand added to the catalogue
 * tomorrow has no photograph here, so its tile renders the wordmark it already
 * carries rather than borrowing another maker's watch.
 */
export function brandPhotograph(slug: string): SitePhotograph | null {
  const key = BRAND_PLATE[slug as keyof typeof BRAND_PLATE];
  return key ? SITE_PHOTOGRAPHY[key] : null;
}

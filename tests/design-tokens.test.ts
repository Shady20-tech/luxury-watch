import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Design token accessibility.
 *
 * The gold accent is the brand colour and is genuinely hard to use accessibly:
 * `#a18040` on white is about 3.7:1, which passes AA for large text but fails
 * for normal body text. Rather than hope nobody uses it for a paragraph, these
 * tests compute the real contrast ratio and assert the rule.
 *
 * WCAG 2.1 thresholds: 4.5:1 for normal text, 3:1 for large text (18pt+, or
 * 14pt+ bold) and for non-text UI components.
 */
const rawCss = readFileSync(
  fileURLToPath(new URL('../src/app/globals.css', import.meta.url)),
  'utf8',
);

/**
 * Comments are stripped before any assertion runs.
 *
 * Without this, the test that asserts zoom is not disabled matches the comment
 * that *documents* not disabling zoom — the check would fail against its own
 * explanation. Assertions must read code, not prose.
 */
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

function hexForToken(name: string): string {
  const declaration = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!declaration?.[1]) throw new Error(`Token --${name} not found in globals.css`);

  const value = declaration[1].trim();

  const direct = /^#[0-9a-fA-F]{6}$/.exec(value);
  if (direct) return direct[0];

  // Semantic tokens are aliases, for example
  // `--color-border: var(--color-line-200);`. Resolve one level of indirection
  // rather than requiring every token to be a literal.
  const alias = /^var\(--([a-zA-Z0-9-]+)\)$/.exec(value);
  if (alias?.[1]) return hexForToken(alias[1]);

  throw new Error(`Token --${name} does not resolve to a hex colour (got "${value}")`);
}

function token(name: string): string {
  return hexForToken(name);
}

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  const [r = 0, g = 0, b = 0] = channels;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('design tokens are present', () => {
  it.each([
    'color-gold-500',
    'color-gold-700',
    'color-ink-900',
    'color-ink-500',
    'color-surface-0',
    'color-surface-100',
    'color-border',
    'font-display',
    'font-body',
    'container-content',
  ])('defines --%s', (name) => {
    expect(css).toContain(`--${name}:`);
  });
});

describe('text contrast on the light surface', () => {
  const white = token('color-surface-0');
  const muted = token('color-surface-100');

  it('body text meets AA on white', () => {
    expect(contrastRatio(token('color-ink-900'), white)).toBeGreaterThanOrEqual(4.5);
  });

  it('muted body text meets AA on white', () => {
    expect(contrastRatio(token('color-ink-500'), white)).toBeGreaterThanOrEqual(4.5);
  });

  it('muted body text meets AA on the muted surface', () => {
    expect(contrastRatio(token('color-ink-500'), muted)).toBeGreaterThanOrEqual(4.5);
  });

  it('the gold text token meets AA on white for normal text', () => {
    // This is why --color-gold-700 exists: the brand gold alone would fail here.
    expect(contrastRatio(token('color-gold-700'), white)).toBeGreaterThanOrEqual(4.5);
  });

  it('the gold text token meets AA on the muted surface too', () => {
    expect(contrastRatio(token('color-gold-700'), muted)).toBeGreaterThanOrEqual(4.5);
  });

  it('white text on the brand gold button meets AA for large text', () => {
    expect(contrastRatio(white, token('color-gold-500'))).toBeGreaterThanOrEqual(3);
  });

  it('status colours meet AA on white', () => {
    expect(contrastRatio(token('color-success-600'), white)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token('color-warning-700'), white)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token('color-danger-600'), white)).toBeGreaterThanOrEqual(4.5);
  });

  it('the default border is visible enough to act as a UI boundary', () => {
    expect(contrastRatio(token('color-border'), white)).toBeGreaterThanOrEqual(1.1);
  });
});

describe('form fields are readable controls, not white boxes', () => {
  /**
   * WCAG 1.4.11 (Non-text Contrast) requires 3:1 for the visual boundary of a
   * user-interface component. A decorative hairline is not a control outline:
   * `line-300` on white is 1.36:1, and using it to delimit an input is exactly
   * how a form ends up looking washed out on a bright screen.
   *
   * These assertions pin the split between the two roles. If a future palette
   * pass lightens `field-border` back towards the hairline tokens, this fails
   * rather than the form quietly losing its edges.
   */
  const page = token('color-surface-page');
  const field = token('color-field');
  const white = token('color-surface-0');

  it('the field boundary meets the 3:1 non-text minimum against its own fill', () => {
    expect(contrastRatio(token('color-field-border'), field)).toBeGreaterThanOrEqual(3);
  });

  it('the field boundary also meets 3:1 against the page it sits on', () => {
    expect(contrastRatio(token('color-field-border'), page)).toBeGreaterThanOrEqual(3);
  });

  it('body text and placeholders clear AA on the field fill', () => {
    expect(contrastRatio(token('color-ink-900'), field)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token('color-ink-500'), field)).toBeGreaterThanOrEqual(4.5);
  });

  it('the disabled fill still carries readable text', () => {
    // WCAG exempts disabled controls, but a value the user cannot read is not
    // disabled — it is hidden. Hold it to AA anyway.
    expect(
      contrastRatio(token('color-ink-500'), token('color-field-disabled')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('the field is distinguishable from both the page ground and a white card', () => {
    // Visible as a well, not so dark it becomes a panel of its own.
    expect(contrastRatio(field, page)).toBeGreaterThan(1.04);
    expect(contrastRatio(field, white)).toBeLessThan(1.3);
  });
});

describe('the page ground is a tint, not white', () => {
  /**
   * The brightness pass moved the page ground off pure white. These hold the two
   * properties that change is allowed to have: it stays light enough to be a
   * neutral ground, and every text token still clears AA on it.
   */
  const page = token('color-surface-page');
  const white = token('color-surface-0');

  it('is a tint of white, not a colour in its own right', () => {
    expect(contrastRatio(page, white)).toBeLessThan(1.15);
    expect(page.toLowerCase()).not.toBe('#ffffff');
  });

  it('keeps every body-text token at AA', () => {
    for (const name of ['color-ink-900', 'color-ink-500', 'color-gold-700', 'color-danger-600']) {
      expect(contrastRatio(token(name), page), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('leaves the section tints visibly distinct from the ground', () => {
    // A tinted band has to differ from the ground it alternates with, or the
    // light/dark rhythm the templates rely on disappears.
    expect(contrastRatio(token('color-surface-warm'), page)).toBeGreaterThan(1.05);
    expect(contrastRatio(token('color-surface-cool'), page)).toBeGreaterThan(1.05);
  });
});

describe('status text clears AA on the tint it is actually painted on', () => {
  /**
   * Every status banner in the app is the same shape: a status text colour on a
   * faint tint of *that same colour* (`bg-success-600/10 text-success-600`),
   * layered over the page ground. The contrast that matters is therefore
   * text-against-tint-over-ground.
   *
   * Testing the text colour against the ground alone is what hid a real failure:
   * `success-600` passed at 5.05:1 on the page, but the 10% banner tint
   * composited over that page ground pulled it to 4.41:1, and the Chromium audit
   * failed on it at every viewport. The tint is the part that is easy to forget,
   * so it is the part this asserts.
   */
  const ground = token('color-surface-page');

  function tint(hex: string, alpha: number, backdrop: string): string {
    const channels = [1, 3, 5].map((offset) =>
      parseInt(hex.replace('#', '').slice(offset - 1, offset + 1), 16),
    );
    const back = [1, 3, 5].map((offset) =>
      parseInt(backdrop.replace('#', '').slice(offset - 1, offset + 1), 16),
    );
    return `#${channels
      .map((channel, index) =>
        Math.round(channel * alpha + (back[index] ?? 0) * (1 - alpha))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`;
  }

  const statuses = [
    ['success', 'color-success-600', 0.1],
    ['success (lighter tint)', 'color-success-600', 0.05],
    ['danger', 'color-danger-600', 0.1],
    ['danger (lighter tint)', 'color-danger-600', 0.05],
    ['warning', 'color-warning-700', 0.1],
  ] as const;

  it.each(statuses)('%s text stays at 4.5:1 on its own tint', (_label, name, alpha) => {
    const text = token(name);
    const banner = tint(text, alpha, ground);
    expect(contrastRatio(text, banner)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('secondary accents are usable at both ends', () => {
  /**
   * The extended palette follows gold's rule: a `-700` is a text colour on a
   * light ground, a `-300` is a text colour on the dark ground, and the mid
   * tones are decoration only. Both directions are asserted because using a
   * `-300` for body text on white (about 2:1) and a `-700` on `night-900`
   * (about 2:1 as well) are the two mistakes this palette invites.
   */
  const white = token('color-surface-0');
  const muted = token('color-surface-100');
  const night = token('color-night-900');

  const ACCENTS = ['emerald', 'burgundy', 'sapphire'] as const;

  for (const accent of ACCENTS) {
    it(`${accent}-700 meets AA for body text on white`, () => {
      expect(contrastRatio(token(`color-${accent}-700`), white)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${accent}-700 meets AA for body text on the muted surface`, () => {
      expect(contrastRatio(token(`color-${accent}-700`), muted)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${accent}-300 meets AA on the night ground`, () => {
      expect(contrastRatio(token(`color-${accent}-300`), night)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('the ground tints keep body text well above AA', () => {
    expect(
      contrastRatio(token('color-ink-900'), token('color-surface-warm')),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(token('color-ink-900'), token('color-surface-cool')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('the ground tints stay light enough to read as a tint, not a colour', () => {
    // If one darkened past this, it would start competing with the night panels
    // and the page would lose its light/dark alternation.
    expect(contrastRatio(token('color-surface-warm'), white)).toBeLessThan(1.3);
    expect(contrastRatio(token('color-surface-cool'), white)).toBeLessThan(1.3);
  });
});

describe('glass surfaces keep text readable', () => {
  /**
   * The glass tokens carry alpha, so their effective colour depends on what is
   * behind them. Asserting the nominal value would prove nothing. Instead each
   * token is composited over the lightest and the darkest backdrop it can
   * realistically sit on, and the resulting text contrast is asserted against
   * that composited colour.
   *
   * The header is sticky over page content, so the worst case is a dark hero
   * image scrolling underneath it — that is the case worth testing.
   */
  function composite(tokenValue: string, backdropHex: string): string {
    const match = /^rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\)$/.exec(tokenValue.trim());
    if (!match) throw new Error(`Not an rgba token: ${tokenValue}`);

    const [r, g, b, a] = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
    const back = backdropHex.replace('#', '');
    const backdrop = [0, 2, 4].map((offset) => parseInt(back.slice(offset, offset + 2), 16));

    const blended = [r, g, b].map((channel, index) =>
      Math.round(channel * a + (backdrop[index] ?? 0) * (1 - a)),
    );

    return `#${blended.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }

  function rawToken(name: string): string {
    const declaration = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
    if (!declaration?.[1]) throw new Error(`Token --${name} not found`);
    return declaration[1].trim();
  }

  const backdrops = [
    ['a white page', '#ffffff'],
    ['a mid-grey photograph', '#808080'],
    ['a dark hero image', '#111111'],
  ] as const;

  it.each(backdrops)('header glass over %s keeps body text at 4.5:1', (_label, backdrop) => {
    const surface = composite(rawToken('color-glass'), backdrop);
    expect(contrastRatio(token('color-ink-900'), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(backdrops)('drawer glass over %s keeps body text at 4.5:1', (_label, backdrop) => {
    // The drawer and mega menu are opaque enough to be readable even over a
    // dark image, which is why they use the stronger token.
    const surface = composite(rawToken('color-glass-strong'), backdrop);
    expect(contrastRatio(token('color-ink-900'), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(backdrops)('accent text on glass over %s stays at 4.5:1', (_label, backdrop) => {
    const surface = composite(rawToken('color-glass-strong'), backdrop);
    expect(contrastRatio(token('color-gold-700'), surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the dark glass header keeps its light text readable', () => {
  /**
   * The header is dark frosted glass, not the reference's opaque black.
   *
   * Glass over a sticky header is the hardest contrast case on the site,
   * because the header sits on top of whatever the visitor has scrolled to and
   * the backdrop is therefore unknown. A light backdrop is the *worst* case for
   * dark glass: white page content behind a translucent dark panel lifts the
   * composite towards mid-grey and drags light text down towards it.
   *
   * That is the case these assert. The nominal token value proves nothing on its
   * own, so every check composites the real alpha over the real backdrop.
   */
  function compositeNight(tokenValue: string, backdropHex: string): string {
    const match = /^rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\)$/.exec(tokenValue.trim());
    if (!match) throw new Error(`Not an rgba token: ${tokenValue}`);

    const [r, g, b, a] = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
    const back = backdropHex.replace('#', '');
    const backdrop = [0, 2, 4].map((offset) => parseInt(back.slice(offset, offset + 2), 16));

    const blended = [r, g, b].map((channel, index) =>
      Math.round(channel * a + (backdrop[index] ?? 0) * (1 - a)),
    );

    return `#${blended.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }

  function nightToken(name: string): string {
    const declaration = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
    if (!declaration?.[1]) throw new Error(`Token --${name} not found`);
    return declaration[1].trim();
  }

  const backdrops = [
    ['a white page', '#ffffff'],
    ['a mid-grey photograph', '#808080'],
    ['a dark hero image', '#111111'],
  ] as const;

  it.each(backdrops)('header text over %s stays at 4.5:1', (_label, backdrop) => {
    const surface = compositeNight(nightToken('color-glass-night'), backdrop);
    expect(contrastRatio(token('color-on-night'), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(backdrops)('muted header text over %s stays at 4.5:1', (_label, backdrop) => {
    const surface = compositeNight(nightToken('color-glass-night'), backdrop);
    expect(contrastRatio(token('color-on-night-muted'), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(backdrops)(
    'header text on the stronger panel over %s stays at 4.5:1',
    (_label, backdrop) => {
      // The search field and the mega menu use the stronger token, and both are
      // the surfaces a visitor types into.
      const surface = compositeNight(nightToken('color-glass-night-strong'), backdrop);
      expect(contrastRatio(token('color-on-night'), surface)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('light text on the solid dark ground meets AA', () => {
    expect(contrastRatio(token('color-on-night'), token('color-night-900'))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('muted light text on the solid dark ground meets AA', () => {
    expect(
      contrastRatio(token('color-on-night-muted'), token('color-night-900')),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('the bright gold accent is legible on the dark ground for large text', () => {
    // Bright gold is the reference's call-to-action colour on the dark banners.
    // It is asserted at the large-text threshold, not the normal-text one, so it
    // cannot quietly become a body-text colour.
    expect(
      contrastRatio(token('color-gold-bright'), token('color-night-900')),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe('muted text tokens are contrast-safe on every surface', () => {
  /**
   * `ink-400` exists as a token but must not be used for readable text. On
   * `surface-100` it reaches only 4.17:1, which fails WCAG AA for normal text.
   * A layout-aware axe run caught exactly that on the media-frame placeholder,
   * which the jsdom suite could not see because jsdom does not lay out the page
   * and axe skips colour contrast without geometry.
   *
   * This asserts the rule numerically so the mistake cannot come back silently:
   * `ink-500` is the muted text token, and it has to clear 4.5:1 on both light
   * surfaces. `ink-400` is permitted only where WCAG exempts it — disabled
   * controls — or where it is not text at all, such as a decorative border.
   */
  const surfaces = [
    ['white', token('color-surface-0')],
    ['surface-100', token('color-surface-100')],
  ] as const;

  it.each(surfaces)('ink-500 meets AA on %s', (_label, surface) => {
    expect(contrastRatio(token('color-ink-500'), surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('ink-400 is below AA on surface-100, which is why it is not a text token', () => {
    // Documents the reason rather than the preference. If a future palette
    // change makes ink-400 AA-safe, this test fails and the comment above can be
    // revised deliberately instead of drifting.
    const ratio = contrastRatio(token('color-ink-400'), token('color-surface-100'));
    expect(ratio).toBeLessThan(4.5);
  });

  it('no source file uses text-ink-400 outside an explicitly disabled state', () => {
    // A guard against the class being reintroduced by copy-paste. The only
    // permitted occurrence is the dropdown disabled state, which carries its
    // own justification comment.
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry.name)) continue;

        const source = readFileSync(full, 'utf8');
        for (const line of source.split('\n')) {
          if (!line.includes('text-ink-400')) continue;
          // Skip the line if it is a disabled-state utility, or a comment
          // explaining the rule.
          if (line.includes('data-[disabled]')) continue;
          if (line.trim().startsWith('*') || line.trim().startsWith('//')) continue;
          offenders.push(`${full}: ${line.trim()}`);
        }
      }
    };

    walk(join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});

describe('no text colour is applied at reduced opacity', () => {
  /**
   * The bug this guards against, and why it is a source-level check.
   *
   * A Tailwind opacity modifier on a *text* colour — `text-ink-950/70` — lowers
   * the effective contrast of that text against whatever it sits on. On the gold
   * announcement bar it composites to 3.4:1, which fails AA, and it did so on
   * every page of the site at once.
   *
   * It is invisible to `tests/a11y-shell.test.tsx`: jsdom does not lay out the
   * document, so axe skips colour-contrast entirely there. It was found by the
   * Chromium audit. A source guard is the only thing that stops it coming back
   * by copy-paste, because the class itself looks reasonable.
   *
   * Backgrounds are a different matter and are deliberately not covered: a
   * translucent *panel* composites against an unknown backdrop, which is what
   * `--color-glass-night` is for, and the token tests assert those.
   *
   * A line that needs a faded text colour should use a dedicated token such as
   * `text-on-night-muted`, whose contrast is asserted, rather than an alpha
   * modifier.
   */
  it('no source file fades a text colour with an opacity modifier', () => {
    const offenders: string[] = [];

    // `text-<colour>/<alpha>` and nothing else. The pattern is anchored to a
    // known token prefix so a legitimate class like `w-1/2` or
    // `bg-white/10` cannot match, and `text-white/…` is included because the
    // dark panels use white text.
    const fadedText = /\btext-(?:ink|surface|gold|night|on-night|foreground|accent|line)-\d+\/\d+/;

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry.name)) continue;

        for (const line of readFileSync(full, 'utf8').split('\n')) {
          if (!fadedText.test(line)) continue;
          // Comments that document the rule are allowed to name it.
          if (line.trim().startsWith('*') || line.trim().startsWith('//')) continue;
          offenders.push(`${full}: ${line.trim()}`);
        }
      }
    };

    walk(join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});

describe('the brand gold is never used as a small-text background', () => {
  /**
   * The bug this guards against, and why a token test cannot catch it.
   *
   * `--color-accent` is gold-500 (3.7:1 on white), which is documented as safe
   * for large text and decoration only. A `bg-accent` button with a normal-size
   * white label therefore fails WCAG AA — and it is invisible to jsdom, because
   * jsdom does not lay out the document so axe skips the colour-contrast rule.
   * It was found in the browser audit, not the unit suite, so the unit suite
   * gets a source-level guard: use the shared `Button` primary variant
   * (`bg-gold-700`) instead of painting the accent by hand.
   */
  it('no source file paints a background with bg-accent', () => {
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(tsx|ts)$/.test(entry.name)) continue;

        for (const line of readFileSync(full, 'utf8').split('\n')) {
          // `bg-accent-text` is a different token and is not matched by the
          // word boundary here.
          if (!/\bbg-accent\b/.test(line)) continue;
          // Comments that document the rule are allowed to name it.
          if (line.trim().startsWith('*') || line.trim().startsWith('//')) continue;
          offenders.push(`${full}: ${line.trim()}`);
        }
      }
    };

    walk(join(process.cwd(), 'src'));
    expect(offenders).toEqual([]);
  });
});

describe('zoom is never blocked', () => {
  it('globals.css does not disable pinch-zoom', () => {
    // The reference site sets user-scalable=0, which is a WCAG 1.4.4 failure.
    expect(css).not.toContain('user-scalable=0');
    expect(css).not.toContain('maximum-scale=1');
  });
});

describe('motion preference is respected', () => {
  it('globals.css honours prefers-reduced-motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });
});

describe('focus visibility', () => {
  it('globals.css defines a visible focus ring rather than removing it', () => {
    expect(css).toContain(':focus-visible');
    expect(css).not.toContain('outline: none');
    expect(css).not.toContain('outline: 0');
  });
});

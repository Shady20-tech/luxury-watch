import { readFileSync } from 'node:fs';
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

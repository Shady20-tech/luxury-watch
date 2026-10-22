// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MediaFrame } from '@/components/ui/media-frame';
import { WatchIllustration } from '@/components/ui/watch-illustration';
import { toCartView, type CartPricingPayload } from '@/lib/cart/pricing';

/**
 * The drawn product artwork and the media frame that hosts it.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS IS TESTED AT ALL, AND WHAT IT CANNOT TEST
 * -----------------------------------------------------------------------------
 *
 * The drawing is presentation, so most of what matters about it — that it looks
 * like a watch, that the metal reads as steel — is not assertable and is not
 * asserted here. What *is* assertable is the part that could actually break a
 * user or a rule:
 *
 *  - it must stay decorative, so a screen reader does not announce a shape
 *    twice next to the product name it already reads;
 *  - it must never carry a gradient or filter id, because the same artwork
 *    renders many times per page and duplicate ids are invalid HTML whose
 *    resolution depends on document order;
 *  - a real photograph must always win over the drawing;
 *  - the two attributes must survive the cart payload mapper, since a dropped
 *    field there would silently reduce every cart thumbnail to the fallback.
 *
 * Colour contrast of the artwork itself is not asserted, because it is a
 * decorative graphic rather than text. The caption *is* text on a light panel
 * and its contrast is covered by `design-tokens.test.ts` and the Chromium audit.
 */

afterEach(cleanup);

/**
 * One `cart_pricing` line. Typed loosely on purpose: `CartPricingPayload.lines`
 * is `unknown` in the mapper, because the payload crosses a network boundary and
 * the mapper must not assume its shape. The test fixture mirrors that.
 */
const LINE: Record<string, unknown> = {
  product_id: '11111111-1111-1111-1111-111111111111',
  slug: 'test-watch',
  title: 'Test Watch',
  sku: 'LW-1',
  brand_name: 'Test Brand',
  brand_slug: 'test-brand',
  image_storage_path: null,
  image_external_url: null,
  image_alt: 'A test watch',
  dial_color: 'Sunburst Blue',
  case_material: 'Stainless steel',
  price_on_request: false,
  unit_price_cents: 1250000,
  quantity: 1,
  quantity_locked: true,
  quantity_adjusted: false,
  line_total_cents: 1250000,
  is_available: true,
  product_status: 'ok',
};

const PAYLOAD: CartPricingPayload = {
  currency: 'USD',
  lines: [LINE],
  line_count: 1,
  item_count: 1,
  subtotal_cents: 1250000,
  discount_cents: 0,
  total_cents: 1250000,
  has_unavailable: false,
  has_price_on_request: false,
  free_delivery: false,
  discount: null,
};

/** The same payload with the two presentation fields removed. */
function withoutSpecFields(): CartPricingPayload {
  const { dial_color: _d, case_material: _c, ...rest } = LINE;
  return { ...PAYLOAD, lines: [rest] };
}

describe('WatchIllustration', () => {
  it('is decorative, so the product name is not read twice', () => {
    const { container } = render(<WatchIllustration dialColor="black" caseMaterial="steel" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBe('presentation');
  });

  it('carries no gradient or filter id, which would collide across a page', () => {
    const { container } = render(<WatchIllustration dialColor="blue" caseMaterial="gold" />);
    // Two of the same artwork on one page would otherwise define the same ids
    // twice, which is invalid and resolves by document order.
    expect(container.querySelectorAll('defs').length).toBe(0);
    expect(container.querySelectorAll('[id]').length).toBe(0);
    expect(container.innerHTML).not.toMatch(/url\(#/);
  });

  it('draws a different dial for a different dial colour', () => {
    const black = render(<WatchIllustration dialColor="black" />).container.innerHTML;
    cleanup();
    const blue = render(<WatchIllustration dialColor="blue" />).container.innerHTML;
    expect(black).not.toBe(blue);
  });

  it('matches a dial colour that carries extra words', () => {
    // The column is free text, so `"Sunburst Blue"` must resolve like `"blue"`.
    const plain = render(<WatchIllustration dialColor="blue" />).container.innerHTML;
    cleanup();
    const described = render(<WatchIllustration dialColor="Sunburst Blue" />).container.innerHTML;
    expect(described).toBe(plain);
  });

  it('draws a neutral dial rather than failing when the colour is unknown or absent', () => {
    expect(() => render(<WatchIllustration dialColor={null} />)).not.toThrow();
    cleanup();
    expect(() => render(<WatchIllustration dialColor="chartreuse" />)).not.toThrow();
    cleanup();
    expect(() => render(<WatchIllustration />)).not.toThrow();
  });

  it('draws a gold case differently from a steel one', () => {
    const steel = render(<WatchIllustration caseMaterial="Stainless steel" />).container.innerHTML;
    cleanup();
    const gold = render(<WatchIllustration caseMaterial="18k yellow gold" />).container.innerHTML;
    expect(steel).not.toBe(gold);
  });

  it('renders the same markup for the same inputs, so a grid is stable', () => {
    const first = render(<WatchIllustration dialColor="green" caseMaterial="steel" />).container
      .innerHTML;
    cleanup();
    const second = render(<WatchIllustration dialColor="green" caseMaterial="steel" />).container
      .innerHTML;
    expect(first).toBe(second);
  });
});

describe('MediaFrame', () => {
  it('shows the drawn artwork and labels it when a product has no photograph', () => {
    const { container, getByText } = render(
      <MediaFrame src={null} alt="A test watch" dialColor="black" caseMaterial="steel" />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
    // The caption must not let the drawing pass for the real piece.
    expect(getByText(/photography to follow/i)).toBeTruthy();
  });

  it('keeps the plain placeholder when the caller is not presenting a watch', () => {
    const { container, getByText } = render(<MediaFrame src={null} alt="" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(getByText(/photography to follow/i)).toBeTruthy();
  });

  it('prefers a real image over the drawn artwork', () => {
    const { container } = render(
      <MediaFrame
        src="https://example.com/watch.jpg"
        alt="A test watch"
        dialColor="black"
        caseMaterial="steel"
      />,
    );
    // A photograph is present, so the drawing must not also render.
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('img')).not.toBeNull();
  });
});

describe('the cart payload carries the drawn-thumbnail inputs', () => {
  it('maps dial colour and case material onto the cart line', () => {
    const view = toCartView(PAYLOAD, () => null);
    expect(view.lines[0]?.dialColor).toBe('Sunburst Blue');
    expect(view.lines[0]?.caseMaterial).toBe('Stainless steel');
  });

  it('falls back to null when the payload omits them, as an older cart would', () => {
    const view = toCartView(withoutSpecFields(), () => null);
    expect(view.lines[0]?.dialColor).toBeNull();
    expect(view.lines[0]?.caseMaterial).toBeNull();
  });

  it('treats the attributes as presentation only, leaving every amount intact', () => {
    // The guarantee that matters: adding two decorative fields must not have
    // moved a price. The figures are read from the payload, not recomputed.
    const withSpecs = toCartView(PAYLOAD, () => null);
    const withoutSpecs = toCartView(withoutSpecFields(), () => null);
    expect(withSpecs.subtotal).toBe(withoutSpecs.subtotal);
    expect(withSpecs.total).toBe(withoutSpecs.total);
    expect(withSpecs.lines[0]?.lineTotal).toBe(withoutSpecs.lines[0]?.lineTotal);
    expect(withSpecs.lines[0]?.quantity).toBe(withoutSpecs.lines[0]?.quantity);
  });
});

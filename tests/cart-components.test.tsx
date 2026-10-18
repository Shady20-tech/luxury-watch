// @vitest-environment jsdom
import axe from 'axe-core';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AddToCartButton } from '@/components/cart/add-to-cart-button';
import { CartContents } from '@/components/cart/cart-contents';
import { WishlistToggle } from '@/components/product/wishlist-toggle';
import { MoveToCartButton } from '@/components/wishlist/move-to-cart-button';
import { emptyCartView, type CartLine, type CartView } from '@/lib/cart/types';

/**
 * Cart and wishlist component tests.
 *
 * These render the real components into a real DOM and drive them with real user
 * events, so the form wiring, the accessible names and the disabled state come
 * from the components rather than from a stub.
 *
 * The server actions are mocked **at the module boundary** — `useActionState`
 * needs a function of the right shape, and the actions themselves talk to
 * Supabase. Nothing about the components' own logic is mocked: the forms, the
 * fields and the messages are the real ones, and the assertions below check
 * exactly what the form would submit.
 *
 * jsdom does not lay out the document, so axe skips the geometry-dependent rules
 * (colour contrast, target size). Those are covered by the token contrast
 * assertions and the browser audit; the structural half is what this covers.
 */

afterEach(cleanup);

vi.mock('@/server/actions/cart-actions', () => ({
  addToCart: vi.fn(async () => ({ status: 'idle' })),
  updateCartQuantity: vi.fn(async () => ({ status: 'idle' })),
  removeFromCart: vi.fn(async () => ({ status: 'idle' })),
  applyDiscountCode: vi.fn(async () => ({ status: 'idle' })),
  clearCart: vi.fn(async () => ({ status: 'idle' })),
  moveToCartFromWishlist: vi.fn(async () => ({ status: 'idle' })),
}));

vi.mock('@/server/actions/wishlist-actions', () => ({
  addToWishlist: vi.fn(async () => ({ status: 'idle' })),
  removeFromWishlist: vi.fn(async () => ({ status: 'idle' })),
  mergeGuestWishlistAction: vi.fn(async () => ({ status: 'idle' })),
}));

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    productId: PRODUCT_ID,
    slug: 'test-watch',
    href: '/products/test-watch',
    title: 'Test Watch',
    sku: 'LW-1',
    brandName: 'Test Brand',
    brandSlug: 'test-brand',
    imageUrl: null,
    imageAlt: 'A test watch',
    priceOnRequest: false,
    unitPrice: '$12,500',
    unitPriceCents: 1250000,
    quantity: 1,
    quantityLocked: true,
    quantityAdjusted: false,
    lineTotal: '$12,500',
    lineTotalCents: 1250000,
    isAvailable: true,
    status: 'ok',
    purchasable: true,
    ...overrides,
  };
}

function cart(overrides: Partial<CartView> = {}): CartView {
  const lines = overrides.lines ?? [line()];

  return {
    ...emptyCartView('database'),
    currency: 'USD',
    lines,
    lineCount: lines.length,
    itemCount: lines.reduce((total, entry) => total + entry.quantity, 0),
    subtotalCents: 1250000,
    subtotal: '$12,500',
    totalCents: 1250000,
    total: '$12,500',
    isEmpty: lines.length === 0,
    ...overrides,
  };
}

describe('AddToCartButton', () => {
  it('submits only a product id and a quantity, never a price', () => {
    render(<AddToCartButton productId={PRODUCT_ID} productTitle="Test Watch" />);

    const form = screen.getByRole('button', { name: /add to cart/i }).closest('form');
    expect(form).not.toBeNull();

    const fields = Array.from(form?.querySelectorAll('input, select') ?? []).map((element) => ({
      name: (element as HTMLInputElement).name,
      value: (element as HTMLInputElement).value,
    }));

    // The exact payload. Any price or stock field would be a field a tampered
    // request could carry, so the absence of one is asserted rather than assumed.
    expect(fields).toEqual([
      { name: 'productId', value: PRODUCT_ID },
      { name: 'quantity', value: '1' },
    ]);
  });

  it('says a unique piece adds one, rather than silently fixing the quantity', () => {
    render(<AddToCartButton productId={PRODUCT_ID} productTitle="Test Watch" />);

    expect(screen.getByText(/unique piece, so one is added/i)).toBeDefined();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('offers a quantity selector only when the product model permits more', () => {
    render(<AddToCartButton productId={PRODUCT_ID} productTitle="Test Watch" allowQuantity />);

    expect(screen.getByRole('combobox', { name: /quantity/i })).toBeDefined();
    expect(screen.queryByText(/unique piece, so one is added/i)).toBeNull();
  });

  it('labels the quantity selector, so it is not an unnamed control', () => {
    render(<AddToCartButton productId={PRODUCT_ID} productTitle="Test Watch" allowQuantity />);

    // `getByRole` with a name would fail on an unlabelled select, which is the
    // point: the label is real, not a placeholder.
    expect(screen.getByRole('combobox', { name: 'Quantity' })).toBeDefined();
  });

  it('has no serious or critical axe violations', async () => {
    const { container } = render(
      <AddToCartButton productId={PRODUCT_ID} productTitle="Test Watch" />,
    );

    const results = await axe.run(container, { resultTypes: ['violations'] });
    const serious = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );

    expect(serious).toEqual([]);
  });
});

describe('WishlistToggle', () => {
  it('renders a signed-in toggle as a form carrying only the product id', () => {
    render(<WishlistToggle productId={PRODUCT_ID} signedIn initiallySaved={false} />);

    const form = screen.getByRole('button', { name: /add to wishlist/i }).closest('form');
    const fields = Array.from(form?.querySelectorAll('input') ?? []).map((element) => ({
      name: (element as HTMLInputElement).name,
      value: (element as HTMLInputElement).value,
    }));

    expect(fields).toEqual([{ name: 'productId', value: PRODUCT_ID }]);
  });

  it('reflects the saved state in its label and pressed state', () => {
    render(<WishlistToggle productId={PRODUCT_ID} signedIn initiallySaved />);

    const button = screen.getByRole('button', { name: /saved/i });
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('tells a guest where the list is kept and how to keep it', () => {
    render(<WishlistToggle productId={PRODUCT_ID} signedIn={false} initiallySaved={false} />);

    expect(screen.getByText(/saved on this device/i)).toBeDefined();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeDefined();
  });

  it('saves a guest piece to local storage without calling the server', async () => {
    const user = userEvent.setup();
    window.localStorage.clear();

    render(<WishlistToggle productId={PRODUCT_ID} signedIn={false} initiallySaved={false} />);
    await user.click(screen.getByRole('button', { name: /add to wishlist/i }));

    expect(window.localStorage.getItem('lw:wishlist')).toContain(PRODUCT_ID);
    expect(screen.getByRole('button', { name: /saved/i })).toBeDefined();

    window.localStorage.clear();
  });
});

describe('MoveToCartButton', () => {
  it('submits only a product id, so a move cannot carry a price', () => {
    render(<MoveToCartButton productId={PRODUCT_ID} productTitle="Test Watch" signedIn />);

    const form = screen.getByRole('button', { name: /move to cart/i }).closest('form');
    const fields = Array.from(form?.querySelectorAll('input, select') ?? []).map((element) => ({
      name: (element as HTMLInputElement).name,
      value: (element as HTMLInputElement).value,
    }));

    expect(fields).toEqual([{ name: 'productId', value: PRODUCT_ID }]);
  });

  it('leaves a guest list intact until the move succeeds', async () => {
    const user = userEvent.setup();
    window.localStorage.clear();
    window.localStorage.setItem('lw:wishlist', JSON.stringify([PRODUCT_ID]));

    render(<MoveToCartButton productId={PRODUCT_ID} signedIn={false} />);

    // The mocked action resolves `idle`, which is not a success, so the guest's
    // copy must still be there. Clearing it before the cart write landed is the
    // "silently dropping items" failure the brief names.
    await user.click(screen.getByRole('button', { name: /move to cart/i }));

    expect(window.localStorage.getItem('lw:wishlist')).toContain(PRODUCT_ID);

    window.localStorage.clear();
  });

  it('has no serious or critical axe violations', async () => {
    const { container } = render(
      <MoveToCartButton productId={PRODUCT_ID} productTitle="Test Watch" signedIn />,
    );

    const results = await axe.run(container, { resultTypes: ['violations'] });
    const serious = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );

    expect(serious).toEqual([]);
  });
});

describe('CartContents', () => {
  it('shows a genuine empty state with a route back to the shop', () => {
    render(<CartContents cart={emptyCartView('database')} />);

    expect(screen.getByText(/your cart is empty/i)).toBeDefined();
    expect(screen.getByRole('link', { name: /browse the collection/i })).toBeDefined();
  });

  it('does not present an unavailable cart as empty', () => {
    render(<CartContents cart={emptyCartView('unavailable')} />);

    // A customer shown "empty" when the database was merely unreachable would
    // believe their items had been lost.
    expect(screen.queryByText(/your cart is empty/i)).toBeNull();
    expect(screen.getByText(/could not load your cart/i)).toBeDefined();
  });

  it('renders the summary totals from the cart view', () => {
    render(<CartContents cart={cart()} />);

    const summary = screen.getByRole('heading', { name: 'Summary' }).closest('aside');
    expect(summary).not.toBeNull();
    expect(within(summary as HTMLElement).getAllByText('$12,500').length).toBeGreaterThan(0);
  });

  it('warns that an unavailable line is not held and is excluded from the total', () => {
    render(
      <CartContents
        cart={cart({
          lines: [line({ isAvailable: false, purchasable: false })],
          hasUnavailable: true,
        })}
      />,
    );

    expect(screen.getByText(/reserved by someone else/i)).toBeDefined();
    expect(screen.getByText(/not included in the total/i)).toBeDefined();
  });

  it('states that an unpublished line is no longer listed and leaves it removable', () => {
    render(
      <CartContents
        cart={cart({
          lines: [line({ status: 'unpublished', purchasable: false, isAvailable: false })],
          hasUnavailable: true,
        })}
      />,
    );

    expect(screen.getByText(/no longer listed/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /remove from cart/i })).toBeDefined();
  });

  it('never claims a piece is reserved merely because it is in the cart', () => {
    render(<CartContents cart={cart()} />);

    // The whole honesty rule for this phase. "Reserved" is a fact about stock
    // held by an administrator, not about a cart line.
    const text = document.body.textContent ?? '';
    expect(text.toLowerCase()).not.toContain('your piece is reserved');
    expect(text.toLowerCase()).not.toContain('held for you');
    expect(screen.getByText(/nothing is charged/i)).toBeDefined();
  });

  it('does not offer a live order-request button while that step is unbuilt', () => {
    render(<CartContents cart={cart()} />);

    const button = screen.getByRole('button', { name: /continue to order request/i });
    expect(button.hasAttribute('disabled')).toBe(true);
    // A disabled button must say why, not merely refuse.
    expect(button.getAttribute('title')).toBeTruthy();
  });

  it('shows a price-on-request note when a line has no price', () => {
    render(
      <CartContents
        cart={cart({
          lines: [line({ priceOnRequest: true, unitPrice: null, lineTotal: null })],
          hasPriceOnRequest: true,
        })}
      />,
    );

    expect(screen.getAllByText(/request pricing & availability/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/not included in the total/i)).toBeDefined();
  });

  it('has no serious or critical axe violations', async () => {
    const { container } = render(<CartContents cart={cart()} />);

    const results = await axe.run(container, { resultTypes: ['violations'] });
    const serious = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );

    expect(serious).toEqual([]);
  });
});

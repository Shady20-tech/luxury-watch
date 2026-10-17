/**
 * Test environment setup.
 *
 * jsdom implements the DOM but not every browser API a component may touch.
 * These are the two the chrome needs. Providing them here is not mocking the
 * code under test: `matchMedia` and `ResizeObserver` are real browser globals
 * that jsdom simply omits, and without them the component throws before it
 * renders anything, which would mean the audit tested nothing.
 */

if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }

  // Radix measures its content with ResizeObserver, which jsdom does not
  // implement. A no-op observer is enough for the structural assertions these
  // tests make; nothing here depends on a measured size.
  const globalWithObservers = window as Window & { ResizeObserver?: unknown };
  if (!globalWithObservers.ResizeObserver) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalWithObservers.ResizeObserver = ResizeObserverStub;
  }
}

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProductGallery } from '@/components/product/product-gallery';
import type { ProductImage } from '@/lib/product/types';

/**
 * Gallery keyboard operation.
 *
 * -----------------------------------------------------------------------------
 * WHAT THIS CAN AND CANNOT PROVE
 * -----------------------------------------------------------------------------
 *
 * jsdom does not lay out a document and does not implement the browser's own
 * tab order, so "the roving tabindex works" cannot be proved by simulating Tab.
 * What *is* assertable, and what actually breaks, is the state machine: which
 * image is selected after a key press, and whether the control a keyboard user
 * lands on is the selected thumbnail rather than one of five.
 *
 * The visual and touch behaviour is the browser audit's job, not this file's.
 * These assertions cover the acceptance criterion that the gallery is operable
 * from the keyboard, not that it looks right.
 */

afterEach(cleanup);

function image(id: string, alt: string): ProductImage {
  return {
    id,
    category: 'gallery',
    url: `https://example.test/${id}.jpg`,
    alt,
    width: 800,
    height: 1000,
    credit: null,
    licence: null,
    licenceUrl: null,
    sourceUrl: null,
    isRepresentative: false,
  };
}

const images = [image('a', 'Front'), image('b', 'Caseback'), image('c', 'Clasp')];

function renderGallery() {
  return render(<ProductGallery images={images} title="Test Watch" />);
}

/** The thumbnail strip, in order. */
function thumbnails(): HTMLElement[] {
  return screen.getAllByRole('tab');
}

describe('ProductGallery keyboard operation', () => {
  it('exposes the thumbnails as a tablist with only the selected one in the tab order', () => {
    renderGallery();

    expect(screen.getByRole('tablist', { name: 'Product images' })).toBeTruthy();
    expect(thumbnails().map((tab) => tab.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(thumbnails()[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('moves to the next image on ArrowRight and keeps the roving tabindex in step', () => {
    renderGallery();

    fireEvent.keyDown(thumbnails()[0]!, { key: 'ArrowRight' });

    expect(thumbnails()[1]?.getAttribute('aria-selected')).toBe('true');
    expect(thumbnails().map((tab) => tab.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('moves to the previous image on ArrowLeft', () => {
    renderGallery();

    fireEvent.keyDown(thumbnails()[0]!, { key: 'ArrowRight' });
    fireEvent.keyDown(thumbnails()[1]!, { key: 'ArrowLeft' });

    expect(thumbnails()[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('wraps from the first image to the last, so the gallery has no dead end', () => {
    renderGallery();

    fireEvent.keyDown(thumbnails()[0]!, { key: 'ArrowLeft' });

    expect(thumbnails()[2]?.getAttribute('aria-selected')).toBe('true');
  });

  it('jumps to the first and last image with Home and End', () => {
    renderGallery();

    fireEvent.keyDown(thumbnails()[0]!, { key: 'End' });
    expect(thumbnails()[2]?.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(thumbnails()[2]!, { key: 'Home' });
    expect(thumbnails()[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('announces the position in a live region', () => {
    renderGallery();

    expect(screen.getByText('Image 1 of 3')).toBeTruthy();
    fireEvent.keyDown(thumbnails()[0]!, { key: 'ArrowRight' });
    expect(screen.getByText('Image 2 of 3')).toBeTruthy();
  });

  it('gives every thumbnail an accessible name that says which image it shows', () => {
    renderGallery();

    expect(thumbnails().map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Show image 1 of 3',
      'Show image 2 of 3',
      'Show image 3 of 3',
    ]);
  });

  it('names a tagged view instead of only its position', () => {
    render(
      <ProductGallery
        images={[
          image('a', 'Front'),
          { ...image('b', 'Back'), category: 'caseback' },
          { ...image('c', 'Box'), category: 'box_and_papers' },
        ]}
        title="Test Watch"
      />,
    );

    expect(thumbnails().map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Show image 1 of 3',
      'Show the caseback (2 of 3)',
      'Show the box and papers (3 of 3)',
    ]);
  });

  it('hides the decorative thumbnail images from assistive technology', () => {
    renderGallery();

    // The button carries the accessible name; a second name from the image
    // inside it would make the control announce the product twice.
    for (const img of screen.getAllByRole('presentation', { hidden: true })) {
      expect(img.getAttribute('alt')).toBe('');
    }
  });

  it('renders no tablist for a single image, because there is nothing to switch', () => {
    render(<ProductGallery images={[image('a', 'Front')]} title="Test Watch" />);

    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('renders the drawn placeholder and no zoom control when there is no photography', () => {
    render(<ProductGallery images={[]} title="Test Watch" dialColor="Blue" />);

    expect(screen.getByText(/photography to follow/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /view full size/i })).toBeNull();
  });
});

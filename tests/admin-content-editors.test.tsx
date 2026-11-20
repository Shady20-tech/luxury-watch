// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FaqEditor, NavigationEditor } from '@/components/admin/content-editors';
import { HomepageEditor } from '@/components/admin/homepage-editor';
import { MediaLibrary } from '@/components/admin/media-library';
import { IDLE_ADMIN_STATE } from '@/lib/admin/validation';
import type {
  AdminFaqRow,
  AdminHomepageSectionRow,
  AdminMediaRow,
  AdminNavigationRow,
} from '@/server/repositories/admin-content-repository';

/**
 * Admin content editors, rendered for real.
 *
 * -----------------------------------------------------------------------------
 * WHY THESE EXIST WHEN THE PAGES ARE SERVER COMPONENTS
 * -----------------------------------------------------------------------------
 *
 * A server component cannot be rendered in this test environment, so the pages
 * themselves are covered by the type checker and by the fact that they compile
 * into the production build. What is *not* covered by either is the client
 * behaviour: does choosing a row actually put its values into the form, does the
 * delete control carry the row's id, and does an editor with no rows say so
 * rather than render an empty box.
 *
 * Those are the failures a real editor notices immediately and a build never
 * reports.
 */

afterEach(cleanup);

vi.mock('@/server/actions/content-actions', () => ({
  saveFaqAction: vi.fn(async () => ({ status: 'idle' })),
  deleteFaqAction: vi.fn(async () => ({ status: 'idle' })),
  saveTestimonialAction: vi.fn(async () => ({ status: 'idle' })),
  deleteTestimonialAction: vi.fn(async () => ({ status: 'idle' })),
  saveNavigationItemAction: vi.fn(async () => ({ status: 'idle' })),
  deleteNavigationItemAction: vi.fn(async () => ({ status: 'idle' })),
  saveAnnouncementAction: vi.fn(async () => ({ status: 'idle' })),
  deleteAnnouncementAction: vi.fn(async () => ({ status: 'idle' })),
  saveHomepageSectionAction: vi.fn(async () => ({ status: 'idle' })),
  deleteMediaAction: vi.fn(async () => ({ status: 'idle' })),
  updateMediaMetadataAction: vi.fn(async () => ({ status: 'idle' })),
  savePageAction: vi.fn(async () => ({ status: 'idle' })),
  deletePageAction: vi.fn(async () => ({ status: 'idle' })),
  savePaymentMethodAction: vi.fn(async () => ({ status: 'idle' })),
  saveDeliveryOptionAction: vi.fn(async () => ({ status: 'idle' })),
  saveSiteSettingsAction: vi.fn(async () => ({ status: 'idle' })),
}));

const faq: AdminFaqRow = {
  id: 'faq-1',
  question: 'Do you ship internationally?',
  answer: 'Yes, fully insured.',
  category: 'shipping',
  sortOrder: 2,
  isPublished: true,
};

const navigationItem: AdminNavigationRow = {
  id: 'nav-1',
  location: 'header',
  parentId: null,
  label: 'Shop',
  href: '/shop',
  groupLabel: null,
  sortOrder: 0,
  isActive: true,
};

const section: AdminHomepageSectionRow = {
  id: 'sec-1',
  sectionKey: 'hero_1',
  title: 'The quiet icon',
  subtitle: 'A reference worth keeping',
  body: 'Editorial copy.',
  ctaLabel: 'Explore',
  ctaHref: '/shop',
  imageUrl: null,
  isActive: true,
  sortOrder: 0,
};

const media: AdminMediaRow = {
  id: 'media-1',
  storageBucket: 'media',
  storagePath: 'editorial/hero.webp',
  fileName: 'hero.webp',
  mimeType: 'image/webp',
  sizeBytes: 204_800,
  width: 1600,
  height: 2000,
  altText: 'A watch on a dark surface',
  caption: null,
  title: 'Hero shot',
  category: 'editorial',
  createdAt: '2026-01-01T00:00:00Z',
};

/** A stand-in action, typed as the component expects rather than as a loose mock. */
const noopDelete = async () => IDLE_ADMIN_STATE;

describe('FaqEditor', () => {
  it('lists the existing questions with their publication state', () => {
    render(<FaqEditor faqs={[faq]} />);

    const list = screen.getByRole('region', { name: /Questions \(1\)/ });
    // The question text appears three times on purpose: the visible row, and the
    // sr-only name on both the Edit and Delete buttons. A row with two controls
    // that each act on *this* question has to say which question that is, or a
    // screen-reader user hears "Edit, Delete" repeated down the list.
    expect(within(list).getAllByText('Do you ship internationally?')).toHaveLength(3);
    expect(within(list).getByText(/Published/)).toBeTruthy();
  });

  it('says so plainly when there are no questions', () => {
    render(<FaqEditor faqs={[]} />);
    expect(screen.getByText(/No questions yet/)).toBeTruthy();
  });

  it('loads a chosen question into the form, with its id attached', async () => {
    const user = userEvent.setup();
    render(<FaqEditor faqs={[faq]} />);

    // The form starts empty, ready to add.
    expect((screen.getByLabelText('Question') as HTMLTextAreaElement).value).toBe('');

    await user.click(screen.getByRole('button', { name: /Edit/ }));

    expect(screen.getByText('Edit question')).toBeTruthy();
    expect((screen.getByLabelText('Question') as HTMLTextAreaElement).value).toBe(faq.question);
    expect((screen.getByLabelText('Answer') as HTMLTextAreaElement).value).toBe(faq.answer);

    // The hidden id is what makes the action update rather than insert.
    const hidden = document.querySelector('input[name="id"]') as HTMLInputElement | null;
    expect(hidden?.value).toBe('faq-1');
  });

  it('gives the delete control the row it belongs to', () => {
    render(<FaqEditor faqs={[faq]} />);
    const deleteButton = screen.getByRole('button', { name: /Delete/ });
    const form = deleteButton.closest('form');
    const hidden = form?.querySelector('input[name="id"]') as HTMLInputElement | null;
    expect(hidden?.value).toBe('faq-1');
  });
});

describe('NavigationEditor', () => {
  it('groups links by where they appear', () => {
    render(<NavigationEditor items={[navigationItem]} />);

    expect(screen.getByText(/Header \(1\)/)).toBeTruthy();
    expect(screen.getByText(/Footer \(0\)/)).toBeTruthy();
    expect(screen.getByText(/Top bar \(0\)/)).toBeTruthy();
  });

  it('shows the destination and order of a link', () => {
    render(<NavigationEditor items={[navigationItem]} />);
    expect(screen.getByText(/\/shop · order 0/)).toBeTruthy();
  });
});

describe('HomepageEditor', () => {
  it('opens on the first section and renders its copy', () => {
    render(<HomepageEditor sections={[section]} />);

    expect(screen.getByRole('heading', { name: 'Hero slide 1' })).toBeTruthy();
    expect((screen.getByLabelText('Heading') as HTMLInputElement).value).toBe('The quiet icon');
    expect((screen.getByLabelText('Button link') as HTMLInputElement).value).toBe('/shop');
  });

  it('marks the selected section in the section list', () => {
    render(<HomepageEditor sections={[section]} />);
    const nav = screen.getByRole('navigation', { name: 'Homepage sections' });
    const current = within(nav).getByRole('button', { name: /Hero slide 1/ });
    expect(current.getAttribute('aria-current')).toBe('true');
  });

  it('warns when a section key is one the renderer does not know', () => {
    render(<HomepageEditor sections={[{ ...section, sectionKey: 'mystery_block' }]} />);
    expect(screen.getByText(/not one the homepage renderer knows/)).toBeTruthy();
  });
});

describe('MediaLibrary', () => {
  it('lists an asset with its path and category', () => {
    render(<MediaLibrary media={[media]} deleteAction={noopDelete} />);

    const list = screen.getByRole('region', { name: /Library \(1\)/ });
    expect(within(list).getByText('editorial/hero.webp')).toBeTruthy();
    // The category label also appears as a <select> option in the upload form,
    // so scope to the library list rather than the whole page.
    expect(within(list).getByText(/Editorial image/)).toBeTruthy();
  });

  it('states the size and type limit rather than leaving the input to refuse silently', () => {
    render(<MediaLibrary media={[]} deleteAction={noopDelete} />);
    expect(screen.getByText(/up to 8 MB each/)).toBeTruthy();
    expect(screen.getByText(/SVG is not accepted/)).toBeTruthy();
  });

  it('offers no delete for a row it was not given', () => {
    render(<MediaLibrary media={[]} deleteAction={noopDelete} />);
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull();
  });
});

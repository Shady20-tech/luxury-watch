import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Publishing a product must refresh the sitemap.
 *
 * -----------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * -----------------------------------------------------------------------------
 *
 * `src/app/sitemap.ts` is cached for an hour (`revalidate = 3600`). Nothing in
 * the admin path called `revalidatePath('/sitemap.xml')`, so a piece published
 * through the admin stayed absent from the sitemap for up to an hour, and an
 * archived piece stayed advertised for the same hour. That was reproduced
 * against a production build in Phase 14: the sitemap still listed a draft-only
 * slug after it was published, and still listed a slug after it was unpublished.
 *
 * The defect was invisible to every test in the suite because no test asserted
 * *what the action revalidates* — only what it returns. A green suite said
 * nothing about the sitemap, which is exactly the shape of test that lets this
 * class of bug through.
 *
 * These tests therefore exercise the real server action with the Supabase client
 * stubbed at its boundary, and assert on the paths handed to `revalidatePath`.
 * The revalidation list is imported by the action rather than restated here, so
 * a path removed from `lib/seo/sitemap.ts` fails these tests too.
 */

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => revalidatePath(...args) }));

vi.mock('server-only', () => ({}));

const requirePermission = vi.fn();
vi.mock('@/server/services/admin-authorization', () => ({
  requirePermission: (...args: unknown[]) => requirePermission(...args),
  AdminPermissionError: class AdminPermissionError extends Error {},
}));

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClientWritable: async () => ({ rpc }),
}));

vi.mock('@/server/services/order-lifecycle-notification-service', () => ({
  notifyOrderStatusChanged: vi.fn(),
}));

vi.mock('@/server/repositories/admin-order-repository', () => ({
  getOrder: vi.fn(),
}));

const { setProductStatusAction } = await import('@/server/actions/admin-actions');
const { SITEMAP_PATH } = await import('@/lib/seo/sitemap');

const PRODUCT_ID = '6f1c2b3a-4d5e-4f60-8a9b-0c1d2e3f4a5b';
const SLUG = 'example-diver-40mm';

function statusForm(status: string): FormData {
  const form = new FormData();
  form.set('id', PRODUCT_ID);
  form.set('status', status);
  return form;
}

beforeEach(() => {
  revalidatePath.mockReset();
  rpc.mockReset();
  requirePermission.mockReset();
  requirePermission.mockResolvedValue(undefined);
  rpc.mockResolvedValue({ data: { slug: SLUG }, error: null });
});

describe('setProductStatusAction', () => {
  it('revalidates the sitemap when a product is published', async () => {
    const result = await setProductStatusAction({ status: 'idle' }, statusForm('published'));

    expect(result.status).toBe('success');
    expect(revalidatePath).toHaveBeenCalledWith(SITEMAP_PATH);
  });

  it('revalidates the sitemap when a product is archived, so a dead URL stops being advertised', async () => {
    // The reverse case matters just as much: a sitemap entry pointing at a
    // piece that is no longer published sends a crawler to a 404.
    await setProductStatusAction({ status: 'idle' }, statusForm('archived'));

    expect(revalidatePath).toHaveBeenCalledWith(SITEMAP_PATH);
  });

  it('revalidates the product page itself', async () => {
    await setProductStatusAction({ status: 'idle' }, statusForm('published'));

    expect(revalidatePath).toHaveBeenCalledWith(`/products/${SLUG}`);
  });

  it('does not revalidate anything when the status change fails', async () => {
    // A failed write changed nothing, so there is nothing to refresh. Flushing
    // caches on an error would mask the failure behind extra work.
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied', code: '42501' } });

    const result = await setProductStatusAction({ status: 'idle' }, statusForm('published'));

    expect(result.status).toBe('error');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('still revalidates the sitemap when the database returns no slug', async () => {
    // The RPC is typed to return the row, but a null must not silently skip the
    // sitemap: the catalogue changed even if we cannot name the page.
    rpc.mockResolvedValue({ data: null, error: null });

    await setProductStatusAction({ status: 'idle' }, statusForm('published'));

    expect(revalidatePath).toHaveBeenCalledWith(SITEMAP_PATH);
  });
});

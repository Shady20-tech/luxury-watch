'use server';

import { revalidatePath } from 'next/cache';

import { logger } from '@/lib/logger';
import {
  adminFieldErrors,
  orderTransitionSchema,
  productFormSchema,
  stockAdjustmentSchema,
  type AdminFormState,
} from '@/lib/admin/validation';
import { createSupabaseServerClientWritable } from '@/lib/supabase/server';
import type { LifecycleStatus } from '@/lib/email/lifecycle';
import { productRevalidationPaths } from '@/lib/seo/sitemap';
import { getOrder } from '@/server/repositories/admin-order-repository';
import { AdminPermissionError, requirePermission } from '@/server/services/admin-authorization';
import { notifyOrderStatusChanged } from '@/server/services/order-lifecycle-notification-service';

/**
 * Administrative server actions.
 *
 * -----------------------------------------------------------------------------
 * THE ORDER OF OPERATIONS IS THE SECURITY MODEL
 * -----------------------------------------------------------------------------
 *
 * Every action does the same five things in the same order:
 *
 *   1. `requirePermission(...)` — before reading the form, before touching the
 *      database. Authorisation is the first statement, not the last, so no
 *      parsing or query can run for a caller who is not allowed to act.
 *   2. Parse with Zod.
 *   3. Perform the write.
 *   4. Write the audit row.
 *   5. Revalidate the affected paths.
 *
 * Step 1 cannot be moved. A `'use server'` action is a public HTTP endpoint:
 * anyone who can guess its name can call it, with any arguments, whether or not
 * they ever loaded the page that renders the form. The permission check is the
 * only thing that stands between a stranger and the service-role client, which
 * bypasses RLS entirely.
 *
 * -----------------------------------------------------------------------------
 * WHY WRITES USE THE SESSION CLIENT, NOT THE SERVICE-ROLE CLIENT
 * -----------------------------------------------------------------------------
 *
 * It is tempting to write through the service-role client because it always
 * works, and that is exactly why it is wrong here. Every admin function in 0020
 * derives the actor from `auth.uid()` and re-checks the permission inside the
 * database. The service-role client carries no user, so `auth.uid()` is null and
 * every one of those functions refuses — the audit writer raises
 * "An administrative change must be attributable to a signed-in user", and
 * `has_permission()` fails closed.
 *
 * More fundamentally, a write through the service-role client would bypass the
 * `products_staff_write` policy that requires `catalog.write`. The TypeScript
 * guard would then be the *only* check, and a single forgotten `requirePermission`
 * would be a full privilege escalation. Writing as the signed-in user means the
 * policy is a second, independent gate: the action checks, and the database
 * checks again against a real identity.
 *
 * Reads are the opposite case. `cost_cents` is withheld from `authenticated` by a
 * column grant, so the editor's read goes through the service-role client — see
 * the repositories. Reads are safe there because the guard has already run;
 * writes must not be.
 *
 * -----------------------------------------------------------------------------
 * WHY FAILURES ARE MAPPED, NOT THROWN
 * -----------------------------------------------------------------------------
 *
 * A thrown error from a server action is serialised to the client, and its
 * message can contain SQL, a constraint name or a column. These actions catch,
 * log server-side, and return a generic message. The log is where the detail
 * belongs.
 */

function refusal(): AdminFormState {
  return {
    status: 'error',
    message: 'You do not have permission to perform that action.',
  };
}

/**
 * Turn a database error into something safe to show.
 *
 * `P0001` is a `raise` from one of our own functions, and those messages are
 * written for a person ("A price must be greater than zero"), so they are passed
 * through. Everything else is generic: a constraint name or a SQLSTATE is not
 * useful to an administrator and is a hint to an attacker.
 */
function databaseMessage(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === 'P0001') return error.message;
  return fallback;
}

/** The form's `boxAndPapers` tri-state maps onto the nullable column. */
function boxAndPapersValue(value: 'yes' | 'no' | 'unknown'): boolean | null {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
}

/**
 * Write an audit row.
 *
 * Best-effort by design: a failure here is logged and does not undo a write that
 * already happened. The alternative — failing the whole action because the audit
 * insert failed — would leave the caller believing nothing changed when it did.
 */
async function writeAudit(
  action: string,
  entityType: string,
  entityId: string,
  changes?: Record<string, unknown>,
): Promise<void> {
  const supabase = await createSupabaseServerClientWritable();
  const { error } = await supabase.rpc('admin_write_audit_log', {
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_changes: (changes ?? null) as never,
  });

  if (error) {
    logger.error('admin.audit_write_failed', { action, entityType, message: error.message });
  }
}

/** Map validated product values onto the table's column names. */
function productRow(values: ReturnType<typeof productFormSchema.parse>) {
  return {
    title: values.title,
    slug: values.slug,
    sku: values.sku,
    reference_number: values.referenceNumber ?? null,
    short_description: values.shortDescription ?? null,
    description: values.description ?? null,
    brand_id: values.brandId ?? null,
    model_id: values.modelId ?? null,
    condition: values.condition ?? null,
    price_cents: values.priceOnRequest ? null : (values.priceCents ?? null),
    compare_at_cents: values.priceOnRequest ? null : (values.compareAtCents ?? null),
    cost_cents: values.costCents ?? null,
    price_on_request: values.priceOnRequest,
    is_featured: values.isFeatured,
    sort_order: values.sortOrder ?? 0,
    production_year: values.productionYear ?? null,
    case_size_mm: values.caseSizeMm ?? null,
    case_material: values.caseMaterial || null,
    dial_color: values.dialColor || null,
    bracelet_material: values.braceletMaterial || null,
    movement: values.movement || null,
    bezel: values.bezel || null,
    water_resistance_m: values.waterResistanceM ?? null,
    box_and_papers: boxAndPapersValue(values.boxAndPapers),
    gender: values.gender || null,
    seo_title: values.seoTitle || null,
    seo_description: values.seoDescription || null,
    og_image_url: values.ogImageUrl || null,
  };
}

/**
 * Revalidate every surface a product change can affect.
 *
 * The list comes from `lib/seo/sitemap.ts` so the sitemap cannot be forgotten
 * here. It was forgotten once: the paths below covered the catalogue pages and
 * omitted `/sitemap.xml`, so a piece published through the admin was absent from
 * the sitemap until its hourly `revalidate` window elapsed — and an archived
 * piece stayed advertised for the same hour. A crawler asking "what is in the
 * catalogue?" got the answer from an hour ago.
 */
function revalidateProduct(slug?: string) {
  revalidatePath('/admin/products');
  revalidatePath('/admin/inventory');
  for (const path of productRevalidationPaths(slug)) revalidatePath(path);
}

export async function createProductAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('catalog.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const parsed = productFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the fields below.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const supabase = await createSupabaseServerClientWritable();

  // A product cannot be *created* as published: `products_published_requires_timestamp`
  // requires `published_at`, and only the status function sets it. So creation is
  // always a draft, and publication is a separate, audited transition.
  const { data, error } = await supabase
    .from('products')
    .insert({ ...productRow(values), status: 'draft' })
    .select('id, slug')
    .single();

  if (error) {
    logger.error('admin.product_create_failed', { message: error.message, code: error.code });
    if (error.code === '23505') {
      return {
        status: 'error',
        message: 'That slug or SKU is already in use.',
        fieldErrors: { slug: 'Already in use', sku: 'Already in use' },
      };
    }
    return {
      status: 'error',
      message: databaseMessage(error, 'The product could not be created.'),
    };
  }

  await writeAudit('product.created', 'product', data.id, {
    title: values.title,
    slug: values.slug,
  });

  // If the editor asked for published, publish now through the function so the
  // timestamp and the audit are written the supported way.
  if (values.status === 'published') {
    const { error: publishError } = await supabase.rpc('admin_set_product_status', {
      p_product_id: data.id,
      p_status: 'published',
    });
    if (publishError) {
      logger.error('admin.product_publish_after_create_failed', { message: publishError.message });
      revalidateProduct(data.slug);
      return {
        status: 'error',
        message:
          'The product was saved as a draft, but publishing failed. Open it and publish again.',
      };
    }
  } else if (values.status === 'archived') {
    const { error: archiveError } = await supabase.rpc('admin_set_product_status', {
      p_product_id: data.id,
      p_status: 'archived',
    });
    if (archiveError) {
      logger.error('admin.product_archive_after_create_failed', { message: archiveError.message });
    }
  }

  revalidateProduct(data.slug);
  return { status: 'success', message: 'Product created.' };
}

export async function updateProductAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('catalog.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { status: 'error', message: 'Unknown product.' };
  }

  const parsed = productFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the fields below.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const values = parsed.data;
  const supabase = await createSupabaseServerClientWritable();

  const { data: existing, error: readError } = await supabase
    .from('products')
    .select('id, slug, status')
    .eq('id', id)
    .maybeSingle();

  if (readError || !existing) {
    logger.error('admin.product_update_missing', { message: readError?.message ?? 'not found' });
    return { status: 'error', message: 'That product no longer exists.' };
  }

  // The form's status field and the status function are different paths, and
  // mixing them is how a product ends up published without a timestamp. Field
  // edits never change `status`; the transition below does, through the function.
  const { error } = await supabase.from('products').update(productRow(values)).eq('id', id);

  if (error) {
    logger.error('admin.product_update_failed', { message: error.message, code: error.code });
    if (error.code === '23505') {
      return {
        status: 'error',
        message: 'That slug or SKU is already in use.',
        fieldErrors: { slug: 'Already in use', sku: 'Already in use' },
      };
    }
    return { status: 'error', message: databaseMessage(error, 'The product could not be saved.') };
  }

  await writeAudit('product.updated', 'product', id, { title: values.title });

  if (values.status !== existing.status) {
    const { error: statusError } = await supabase.rpc('admin_set_product_status', {
      p_product_id: id,
      p_status: values.status,
    });
    if (statusError) {
      logger.error('admin.product_status_failed', { message: statusError.message });
      revalidateProduct(values.slug);
      return {
        status: 'error',
        message: 'The details were saved, but the status change failed.',
      };
    }
  }

  // A slug change leaves the old URL dead; revalidate both.
  revalidateProduct(values.slug);
  if (existing.slug !== values.slug) revalidateProduct(existing.slug);

  return { status: 'success', message: 'Product saved.' };
}

/**
 * Publish, unpublish or archive, as a one-click action from the list.
 *
 * Separate from `updateProductAction` because it is the transition that matters
 * most and it should be reachable without loading the whole editor.
 */
export async function setProductStatusAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('catalog.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');

  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: 'error', message: 'Unknown product.' };
  if (!['draft', 'published', 'archived'].includes(status)) {
    return { status: 'error', message: 'Unknown status.' };
  }

  const supabase = await createSupabaseServerClientWritable();
  const { data, error } = await supabase.rpc('admin_set_product_status', {
    p_product_id: id,
    p_status: status as 'draft' | 'published' | 'archived',
  });

  if (error) {
    logger.error('admin.product_status_action_failed', {
      message: error.message,
      code: error.code,
    });
    return { status: 'error', message: databaseMessage(error, 'The status could not be changed.') };
  }

  revalidateProduct((data as { slug?: string } | null)?.slug);
  return {
    status: 'success',
    message:
      status === 'published'
        ? 'Product published.'
        : status === 'archived'
          ? 'Product archived.'
          : 'Product moved to draft.',
  };
}

export async function adjustStockAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('inventory.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const parsed = stockAdjustmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the fields below.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  const supabase = await createSupabaseServerClientWritable();
  const { error } = await supabase.rpc('admin_adjust_stock', {
    p_product_id: parsed.data.productId,
    p_delta: parsed.data.delta,
    p_reason: parsed.data.note,
  });

  if (error) {
    logger.error('admin.stock_adjust_failed', { message: error.message, code: error.code });
    return { status: 'error', message: databaseMessage(error, 'Stock could not be adjusted.') };
  }

  revalidatePath('/admin/inventory');
  revalidatePath('/admin/products');
  revalidatePath('/shop');
  return { status: 'success', message: 'Stock adjusted.' };
}

/**
 * Remove a product from sale.
 *
 * A soft delete: the row is archived, not deleted. `order_request_items`,
 * `wishlist_items`, `cart_items` and the inventory ledger all reference it, and a
 * customer's past order must keep the line describing what they asked for. The
 * database function refuses nothing that an archive would allow and records the
 * change as `product.removed` rather than an ordinary status edit, so the trail
 * answers "what was taken off the site" directly.
 */
export async function removeProductAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  try {
    await requirePermission('catalog.write');
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const id = String(formData.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { status: 'error', message: 'Unknown product.' };

  const supabase = await createSupabaseServerClientWritable();
  const { data, error } = await supabase.rpc('admin_remove_product', { p_product_id: id });

  if (error) {
    logger.error('admin.product_remove_failed', { message: error.message, code: error.code });
    return {
      status: 'error',
      message: databaseMessage(error, 'The product could not be removed.'),
    };
  }

  revalidateProduct((data as { slug?: string } | null)?.slug);
  revalidatePath('/admin/products');
  return { status: 'success', message: 'Product removed from sale and archived.' };
}

export async function transitionOrderAction(
  _prev: AdminFormState,
  formData: FormData,
): Promise<AdminFormState> {
  const parsed = orderTransitionSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the fields below.',
      fieldErrors: adminFieldErrors(parsed.error.issues),
    };
  }

  // Settlement is a stronger permission than a status change: it records that
  // money changed hands offline. The database enforces this too, but checking
  // here produces the right message instead of a raw refusal.
  const permission = parsed.data.toStatus === 'paid_offline' ? 'orders.settle' : 'orders.write';

  try {
    await requirePermission(permission);
  } catch (error) {
    if (error instanceof AdminPermissionError) return refusal();
    throw error;
  }

  const supabase = await createSupabaseServerClientWritable();
  const { error } = await supabase.rpc('admin_transition_order', {
    p_order_id: parsed.data.orderId,
    p_to_status: parsed.data.toStatus,
    p_note: parsed.data.note ?? undefined,
  });

  if (error) {
    logger.error('admin.order_transition_failed', { message: error.message, code: error.code });
    return { status: 'error', message: databaseMessage(error, 'The order could not be updated.') };
  }

  revalidatePath('/admin/orders');
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);

  // Announced after the commit, and never able to undo it. The order is already
  // in its new state and the stock ledger has moved, so a mail or notification
  // failure must not surface as an error here: an administrator who saw one
  // would retry the transition, and the retry would be refused as a no-op.
  await announceTransition(parsed.data.orderId, parsed.data.toStatus, parsed.data.note ?? null);

  return { status: 'success', message: 'Order updated.' };
}

/**
 * Read the committed order back and announce the change.
 *
 * Read back rather than taken from the form: the figures and the piece named in
 * the message must be the ones the database recorded, not the ones the browser
 * sent. Failures are swallowed here — the transition has already happened.
 */
async function announceTransition(
  orderId: string,
  toStatus: LifecycleStatus,
  note: string | null,
): Promise<void> {
  try {
    const order = await getOrder(orderId);
    if (!order) return;

    const [first] = order.items;
    const itemSummary = !first
      ? 'your order'
      : order.items.length === 1
        ? first.productTitle
        : `${first.productTitle} and ${order.items.length - 1} more`;

    await notifyOrderStatusChanged({
      userId: order.userId,
      reference: order.reference,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      status: toStatus,
      itemSummary,
      totalCents: order.totalCents,
      currency: order.currency,
      note,
      orderId: order.id,
    });
  } catch (error) {
    logger.warn('admin.order_announce_failed', {
      orderId,
      status: toStatus,
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Read the offline settlement and delivery choices, and the storefront settings
 * the checkout needs.
 *
 * The options are administrator-configured rows with a public read policy, so
 * the request-scoped (anon-key) client is enough — no service role, and no
 * reason to grant one. A disabled row is filtered out here, and re-checked
 * inside `submit_order_request`, so hiding a row and refusing it agree.
 *
 * The reads are independent and are issued together.
 *
 * The settings select names its columns rather than using `*`: the checkout
 * needs the collection address, the currency and the confirmation note, and has
 * no business reading the rest of the row.
 */
export type CheckoutConfiguration = {
  paymentMethods: {
    code: string;
    label: string;
    description: string | null;
    instructions: string | null;
  }[];
  deliveryOptions: {
    code: string;
    label: string;
    description: string | null;
    fee_cents: number;
  }[];
  pickupLocation: string | null;
  currency: string;
  /** Shown on the confirmation. Must be explicit that payment happens offline. */
  confirmationNote: string | null;
};

export async function fetchCheckoutConfiguration(): Promise<CheckoutConfiguration> {
  const supabase = await createSupabaseServerClient();

  const [methods, deliveries, settings] = await Promise.all([
    supabase
      .from('payment_methods')
      .select('code, label, description, instructions')
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('delivery_options')
      .select('code, label, description, fee_cents')
      .eq('is_enabled', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('site_settings')
      .select(
        'default_currency, order_confirmation_note, address_line1, address_line2, address_city, address_region, address_postal_code, address_country',
      )
      .limit(1)
      .maybeSingle(),
  ]);

  if (methods.error) throw methods.error;
  if (deliveries.error) throw deliveries.error;
  // A missing settings row is not a failure: a store without a configured
  // address can still accept pickup requests, and the confirmation note is
  // optional.
  if (settings.error) throw settings.error;

  const row = settings.data;

  return {
    paymentMethods: methods.data ?? [],
    deliveryOptions: deliveries.data ?? [],
    pickupLocation: formatPickupLocation(row),
    currency: row?.default_currency ?? 'USD',
    confirmationNote: row?.order_confirmation_note ?? null,
  };
}

/** Turn the settings address columns into one line, or `null` if unusable. */
function formatPickupLocation(
  row:
    | {
        address_line1?: string | null;
        address_line2?: string | null;
        address_city?: string | null;
        address_region?: string | null;
        address_postal_code?: string | null;
        address_country?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!row) return null;
  const parts = [
    row.address_line1,
    row.address_line2,
    row.address_city,
    row.address_region,
    row.address_postal_code,
    row.address_country,
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part !== '');
  return parts.length === 0 ? null : parts.join(', ');
}

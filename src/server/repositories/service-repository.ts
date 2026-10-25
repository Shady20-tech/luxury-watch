import 'server-only';

import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * The service-flow data access.
 *
 * -----------------------------------------------------------------------------
 * EVERY WRITE GOES THROUGH A `SECURITY DEFINER` FUNCTION
 * -----------------------------------------------------------------------------
 *
 * There is no `insert` here. Each submission calls the RPC `0015` defines, which
 * validates the shape, enforces the rate limit and writes the inquiry, its detail
 * row and the opening history event in one transaction. `anon` has no direct
 * table access at all, so the only way to create a request is a function that
 * cannot be talked into returning another customer's row.
 *
 * The alternative — inserting from here with the anon key — would need an insert
 * policy on every table, and a permissive insert policy on a table that also holds
 * other customers' rows is one mistake away from a read.
 *
 * -----------------------------------------------------------------------------
 * READS ARE SCOPED BY RLS, NOT BY A FILTER WE REMEMBER TO ADD
 * -----------------------------------------------------------------------------
 *
 * `service_status_events_select_own` derives ownership by joining the event back
 * to the request and its inquiry's `user_id`. The queries below therefore do not
 * carry a `user_id = …` filter to be safe; they are safe because the database
 * refuses rows that are not the caller's. The explicit filter is added where it
 * makes the intent readable, but it is not the boundary.
 */

export type SubmittedReference = string;

export async function submitSellTradeRequest(input: {
  name: string;
  email: string;
  phone?: string | null;
  brandName?: string | null;
  modelName?: string | null;
  referenceNumber?: string | null;
  productionYear?: number | null;
  conditionNotes?: string | null;
  hasBox: boolean;
  hasPapers: boolean;
  askingPriceCents?: number | null;
  transactionType: 'sell' | 'trade';
  description: string;
}): Promise<SubmittedReference> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('submit_sell_trade_request', {
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone ?? undefined,
    p_brand_name: input.brandName ?? undefined,
    p_model_name: input.modelName ?? undefined,
    p_reference_number: input.referenceNumber ?? undefined,
    p_production_year: input.productionYear ?? undefined,
    p_condition_notes: input.conditionNotes ?? undefined,
    p_has_box: input.hasBox,
    p_has_papers: input.hasPapers,
    p_asking_price_cents: input.askingPriceCents ?? undefined,
    p_transaction_type: input.transactionType,
    p_description: input.description,
  });

  if (error) throw error;
  return String(data);
}

export async function submitSourcingRequest(input: {
  name: string;
  email: string;
  phone?: string | null;
  brandName?: string | null;
  modelName?: string | null;
  referenceNumber?: string | null;
  dialColor?: string | null;
  braceletType?: string | null;
  minYear?: number | null;
  maxYear?: number | null;
  maxBudgetCents?: number | null;
  notes: string;
}): Promise<SubmittedReference> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('submit_sourcing_request', {
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone ?? undefined,
    p_brand_name: input.brandName ?? undefined,
    p_model_name: input.modelName ?? undefined,
    p_reference_number: input.referenceNumber ?? undefined,
    p_dial_color: input.dialColor ?? undefined,
    p_bracelet_type: input.braceletType ?? undefined,
    p_min_year: input.minYear ?? undefined,
    p_max_year: input.maxYear ?? undefined,
    p_max_budget_cents: input.maxBudgetCents ?? undefined,
    p_notes: input.notes,
  });

  if (error) throw error;
  return String(data);
}

export async function submitRepairRequest(input: {
  name: string;
  email: string;
  phone?: string | null;
  brandName?: string | null;
  modelName?: string | null;
  referenceNumber?: string | null;
  serviceType?: string | null;
  issueSummary?: string | null;
  isInsured: boolean;
  preferredContact?: string | null;
  description: string;
}): Promise<SubmittedReference> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('submit_repair_request', {
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone ?? undefined,
    p_brand_name: input.brandName ?? undefined,
    p_model_name: input.modelName ?? undefined,
    p_reference_number: input.referenceNumber ?? undefined,
    p_service_type: input.serviceType ?? undefined,
    p_issue_summary: input.issueSummary ?? undefined,
    p_is_insured: input.isInsured,
    p_preferred_contact: input.preferredContact ?? undefined,
    p_description: input.description,
  });

  if (error) throw error;
  return String(data);
}

export async function submitContactMessage(input: {
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
}): Promise<SubmittedReference> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('submit_contact_message', {
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone ?? undefined,
    p_subject: input.subject ?? undefined,
    p_message: input.message,
  });

  if (error) throw error;
  return String(data);
}

export async function submitProductOffer(input: {
  productSlug: string;
  name: string;
  email: string;
  phone?: string | null;
  amountCents: number;
  message?: string | null;
  counterOf?: string | null;
}): Promise<SubmittedReference> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('submit_product_offer', {
    p_product_slug: input.productSlug,
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone ?? undefined,
    p_amount_cents: input.amountCents,
    p_message: input.message ?? undefined,
    p_counter_of: input.counterOf ?? undefined,
  });

  if (error) throw error;
  return String(data);
}

export async function requestAppointment(input: {
  name: string;
  email: string;
  phone?: string | null;
  purpose: string;
  slotStart: string;
  customerNote?: string | null;
}): Promise<SubmittedReference> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('request_appointment', {
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone ?? undefined,
    p_purpose: input.purpose,
    p_slot_start: input.slotStart,
    p_customer_note: input.customerNote ?? undefined,
  });

  if (error) throw error;
  return String(data);
}

/**
 * The bookable showroom windows.
 *
 * Read with the request-scoped client, not the service role: the table has a
 * public-read policy for active rows, so a customer sees exactly the availability
 * the business has published and nothing about who else has booked.
 */
export type AvailabilityWindow = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  purpose: string | null;
};

export async function fetchAvailability(): Promise<AvailabilityWindow[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('appointment_availability')
    .select('id, day_of_week, start_time, end_time, slot_minutes, purpose')
    .eq('is_active', true)
    .order('day_of_week')
    .order('start_time');

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    slotMinutes: row.slot_minutes,
    purpose: row.purpose,
  }));
}

/**
 * The signed-in customer's service requests, across all four flows.
 *
 * Each query joins through `inquiries` to the customer's own rows. RLS already
 * restricts these, but the `user_id` filter is stated because it is what makes
 * the join's intent legible — and because a future reader should not have to
 * re-derive that the safety comes from the policy.
 */
export type ServiceRequestSummary = {
  id: string;
  kind: 'sell_trade' | 'sourcing' | 'repair' | 'appointment';
  reference: string | null;
  title: string;
  status: string;
  createdAt: string;
  slotStart: string | null;
};

export async function fetchAccountServiceRequests(
  userId: string,
): Promise<ServiceRequestSummary[]> {
  const supabase = await createSupabaseServerClient();

  const [sellTrade, sourcing, repair, appointments] = await Promise.all([
    supabase
      .from('sell_trade_requests')
      .select(
        'id, brand_name, model_name, reference_number, workflow_status, created_at, inquiries!inner(reference, user_id)',
      )
      .eq('inquiries.user_id', userId),
    supabase
      .from('sourcing_requests')
      .select(
        'id, brand_name, model_name, reference_number, workflow_status, created_at, inquiries!inner(reference, user_id)',
      )
      .eq('inquiries.user_id', userId),
    supabase
      .from('repair_requests')
      .select(
        'id, brand_name, model_name, reference_number, workflow_status, created_at, inquiries!inner(reference, user_id)',
      )
      .eq('inquiries.user_id', userId),
    supabase
      .from('appointments')
      .select('id, purpose, status, workflow_status, slot_start, created_at')
      .eq('user_id', userId),
  ]);

  for (const result of [sellTrade, sourcing, repair, appointments]) {
    if (result.error) throw result.error;
  }

  const rows: ServiceRequestSummary[] = [];

  const describe = (row: {
    brand_name: string | null;
    model_name: string | null;
    reference_number: string | null;
  }) => [row.brand_name, row.model_name, row.reference_number].filter(Boolean).join(' ') || 'Watch';

  for (const row of sellTrade.data ?? []) {
    rows.push({
      id: row.id,
      kind: 'sell_trade',
      reference: row.inquiries?.reference ?? null,
      title: describe(row),
      status: row.workflow_status,
      createdAt: row.created_at,
      slotStart: null,
    });
  }

  for (const row of sourcing.data ?? []) {
    rows.push({
      id: row.id,
      kind: 'sourcing',
      reference: row.inquiries?.reference ?? null,
      title: describe(row),
      status: row.workflow_status,
      createdAt: row.created_at,
      slotStart: null,
    });
  }

  for (const row of repair.data ?? []) {
    rows.push({
      id: row.id,
      kind: 'repair',
      reference: row.inquiries?.reference ?? null,
      title: describe(row),
      status: row.workflow_status,
      createdAt: row.created_at,
      slotStart: null,
    });
  }

  for (const row of appointments.data ?? []) {
    rows.push({
      id: row.id,
      kind: 'appointment',
      reference: null,
      title: row.purpose ? `Appointment — ${row.purpose.replace(/_/g, ' ')}` : 'Appointment',
      status: row.workflow_status,
      createdAt: row.created_at,
      slotStart: row.slot_start,
    });
  }

  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/**
 * The customer-visible status history for one request.
 *
 * `is_customer_visible` is filtered here *and* enforced by the policy. Internal
 * notes — an authentication flag, a valuation figure staff have not yet released
 * — must not reach the customer, and the policy is what guarantees it even if
 * this filter is ever dropped.
 */
export type StatusEvent = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
};

export async function fetchStatusHistory(
  entityType: 'sell_trade' | 'sourcing' | 'repair' | 'appointment' | 'product_offer',
  entityId: string,
): Promise<StatusEvent[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('service_status_events')
    .select('id, from_status, to_status, note, created_at')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('is_customer_visible', true)
    .order('created_at');

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    createdAt: row.created_at,
  }));
}

/** The signed-in customer's own offers, for the account portal. */
export type AccountOffer = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
};

export async function fetchAccountOffers(userId: string): Promise<AccountOffer[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('product_offers')
    .select('id, amount_cents, currency, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
  }));
}

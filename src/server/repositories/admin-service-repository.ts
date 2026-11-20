import 'server-only';

import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Read queries for the customer-facing records staff respond to: enquiries,
 * appointments, product questions and customer profiles.
 *
 * These read through the service-role client because several of the columns are
 * staff-only (an enquiry's `assigned_to`, a profile's contact details), and
 * because the guard has already run. Every caller has passed the matching
 * `requirePermission`; see `admin-authorization.ts`.
 */

export type InquiryRow = {
  id: string;
  reference: string;
  type: string;
  status: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
};

export async function listInquiries(limit = 50): Promise<InquiryRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('inquiries')
    .select('id, reference, type, status, name, email, message, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  if (error) {
    logger.error('admin.inquiries_failed', { message: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    reference: row.reference,
    type: row.type,
    status: row.status,
    name: row.name,
    email: row.email,
    message: row.message,
    createdAt: row.created_at,
  }));
}

export type QuestionRow = {
  id: string;
  productId: string | null;
  question: string;
  answer: string | null;
  createdAt: string;
};

export async function listProductQuestions(limit = 50): Promise<QuestionRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('product_questions')
    .select('id, product_id, question, answer, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  if (error) {
    logger.error('admin.questions_failed', { message: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    productId: row.product_id,
    question: row.question,
    answer: row.answer,
    createdAt: row.created_at,
  }));
}

export type AppointmentRow = {
  id: string;
  status: string;
  customerName: string;
  customerEmail: string;
  slotStart: string | null;
  createdAt: string;
};

export async function listAppointments(limit = 50): Promise<AppointmentRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('appointments')
    .select('id, status, name, email, slot_start, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  if (error) {
    logger.error('admin.appointments_failed', { message: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    customerName: row.name,
    customerEmail: row.email,
    slotStart: row.slot_start,
    createdAt: row.created_at,
  }));
}

export type CustomerRow = {
  id: string;
  fullName: string | null;
  email: string | null;
  createdAt: string;
};

export async function listCustomers(limit = 100): Promise<CustomerRow[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  if (error) {
    logger.error('admin.customers_failed', { message: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    createdAt: row.created_at,
  }));
}

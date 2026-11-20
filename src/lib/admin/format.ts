/**
 * Date formatting for the admin area.
 *
 * The storefront pages each carry a small local `formatDate` because they render
 * one date each and a shared module would be more indirection than it saves. The
 * admin area renders dates in a dozen places — every list, every detail panel,
 * every audit row — so it gets one implementation. Two copies of a date format
 * eventually disagree, and a staff member comparing two screens would have no way
 * to tell which was right.
 *
 * Times are rendered in the server's locale and timezone, which is deliberate for
 * an internal tool: an administrator needs to correlate an audit row with their own
 * clock, not with a customer's. Nothing here is shown to a customer.
 */

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** `19 Nov 2026`. Returns an em dash for a missing or unparseable value. */
export function formatAdminDate(value: string | null | undefined): string {
  const date = parse(value);
  return date ? DATE.format(date) : '—';
}

/** `19 Nov 2026, 15:31`. Returns an em dash for a missing or unparseable value. */
export function formatAdminDateTime(value: string | null | undefined): string {
  const date = parse(value);
  return date ? DATE_TIME.format(date) : '—';
}

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Transactional email: the message model and shared helpers.
 *
 * -----------------------------------------------------------------------------
 * THIS IS NOT A PAYMENT CONFIRMATION, EVER
 * -----------------------------------------------------------------------------
 *
 * Every message here is about an *order request* that an administrator will
 * review and settle offline. No template may say "paid", "payment received",
 * "payment confirmed" or anything a customer could read as money having changed
 * hands. That is not a copy preference — it is the same invariant the database
 * enforces by having no customer-reachable `paid` status. `tests/email.test.ts`
 * asserts it, so the wording cannot drift back.
 *
 * -----------------------------------------------------------------------------
 * WHY PLAIN TEXT IS THE PRIMARY PART, NOT A FALLBACK
 * -----------------------------------------------------------------------------
 *
 * The text part is written first and is complete on its own: every fact, every
 * amount, every next step. The HTML part is then built from the same data. A
 * customer whose client strips HTML, or a screen reader reading the text
 * alternative, gets the whole message rather than "view this email in a
 * browser".
 *
 * -----------------------------------------------------------------------------
 * NO TEMPLATING ENGINE
 * -----------------------------------------------------------------------------
 *
 * Templates are functions returning `{ subject, text, html }`. A template
 * language would be a new dependency, a new escaping surface and a new way to
 * inject customer-supplied text into markup. Interpolation through a small
 * `escapeHtml` helper is auditable in one place.
 */

/** A rendered message, ready for the transport. */
export type EmailMessage = {
  to: string;
  subject: string;
  /** Complete on its own. Never "see the HTML version". */
  text: string;
  html: string;
};

/**
 * Escape text for HTML interpolation.
 *
 * Customer-supplied values (a name, a note, an address line) reach the HTML part
 * of an email. Escaping is not optional: without it a customer could put markup
 * into their own name and have it render in the *administrator's* inbox.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A one-line summary of a piece, for a subject line or a text list.
 *
 * Deliberately not escaped: callers escape when they interpolate into HTML, and
 * escaping here would double-encode in the text part.
 */
export function summariseItems(items: { title: string; quantity: number }[]): string {
  const [first] = items;
  if (!first) return 'no items';
  if (items.length === 1) {
    return first.quantity > 1 ? `${first.title} (x${first.quantity})` : first.title;
  }
  return `${first.title} and ${items.length - 1} more`;
}

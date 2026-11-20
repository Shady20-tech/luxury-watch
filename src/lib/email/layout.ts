import { escapeHtml } from '@/lib/email/message';

/**
 * The shared HTML document around every transactional message.
 *
 * -----------------------------------------------------------------------------
 * WHY TEMPLATES RETURN FRAGMENTS AND THIS WRAPS THEM
 * -----------------------------------------------------------------------------
 *
 * A template that builds its own `<!doctype>`, `<head>` and container would have
 * to repeat all of it, and every copy would be a place for the viewport meta tag
 * or the max-width to be forgotten. Templates therefore return body fragments
 * and this function is the only thing that decides what a message looks like as
 * a document.
 *
 * -----------------------------------------------------------------------------
 * WHY THE STYLING IS INLINE AND SO PLAIN
 * -----------------------------------------------------------------------------
 *
 * Every serious mail client strips `<style>` blocks or ignores class selectors in
 * some contexts, and a handful still render with no CSS at all. So the layout
 * uses a single-column table, inline styles, and a system font stack: it reads
 * correctly with styling applied, with styling stripped, and in a text-only
 * client — which is why the plain-text part is written first and is complete on
 * its own.
 *
 * The one thing the wrapper must never do is interpolate unescaped content. The
 * body is inserted as-is because the templates escape every value they
 * interpolate; the preheader is escaped here because callers pass it as a raw
 * string.
 */

/**
 * A short line shown beside the subject in most inboxes.
 *
 * It is hidden in the body with a font-size of zero and a transparent colour, so
 * it does not appear twice to someone reading the message. It is escaped: it is
 * built from the same data as the body but is not itself a fragment.
 */
function preheader(text: string): string {
  return [
    '<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">',
    escapeHtml(text),
    '</div>',
  ].join('');
}

export type EmailLayoutOptions = {
  /** The document title. Not shown to the reader by most clients. */
  title: string;
  /** The hidden inbox preview line. Plain text; escaped here. */
  preview: string;
  /** The message body, already escaped by the template that built it. */
  body: string;
};

/**
 * Wrap a body fragment in the document every message shares.
 *
 * `role="presentation"` on the tables is deliberate: they exist for layout, and
 * announcing them as tables to a screen reader adds noise without information.
 */
export function wrapEmailHtml({ title, preview, body }: EmailLayoutOptions): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    `<title>${escapeHtml(title)}</title>`,
    '</head>',
    '<body style="margin:0;padding:0;background:#f4f4f2;">',
    preheader(preview),
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f2;padding:24px 12px;">',
    '<tr><td align="center">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e2de;border-radius:6px;">',
    '<tr><td style="padding:24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;">',
    body,
    '</td></tr>',
    '</table>',
    '<p style="max-width:600px;margin:16px auto 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#5c5c5c;text-align:center;">',
    'This message was sent because of an action taken on our website. If you did not expect it, you can ignore it.',
    '</p>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>',
  ].join('\n');
}

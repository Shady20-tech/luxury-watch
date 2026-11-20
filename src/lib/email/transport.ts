import 'server-only';

import { getServerEnv, isEmailConfigured } from '@/lib/env.server';
import { logger } from '@/lib/logger';
import { resolveMailIdentity, type MailIdentity } from '@/lib/email/identity';
import type { EmailMessage } from '@/lib/email/message';

/**
 * The email transport.
 *
 * -----------------------------------------------------------------------------
 * NO SDK
 * -----------------------------------------------------------------------------
 *
 * Resend is called over its HTTPS API with `fetch`. The official SDK would be a
 * dependency, a version to track and another thing in the bundle graph, in
 * exchange for wrapping one POST. The request below is the whole of what the SDK
 * would do.
 *
 * -----------------------------------------------------------------------------
 * THE NO-KEY FALLBACK IS A FEATURE, NOT A DEGRADED MODE
 * -----------------------------------------------------------------------------
 *
 * With no API key the message is logged and reported as `skipped`, and the
 * caller carries on. That matters for three real situations: a fresh clone with
 * no secrets, CI, and a deployed site whose owner has not set up Resend yet. In
 * all three the order request must still succeed — email is a notification about
 * a record that already exists, not part of creating it.
 *
 * -----------------------------------------------------------------------------
 * EMAIL NEVER FAILS A REQUEST
 * -----------------------------------------------------------------------------
 *
 * `sendEmail` returns a result and does not throw for a transport failure. The
 * caller decides what to do, and the only sane answer is "log it and carry on":
 * the order is already committed and the customer has their reference. Throwing
 * would turn a delivered order into an error page.
 */

export type SendResult =
  | { status: 'sent'; id: string | null }
  /** No key configured. The message was logged instead of sent. */
  | { status: 'skipped'; reason: 'not-configured' }
  /** The provider refused it, or the network failed. Already logged. */
  | { status: 'failed'; reason: string };

/** The subset of the Resend response we actually use. */
type ResendResponse = { id?: string; message?: string };

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** A hard timeout, so a hung provider cannot hold a request open. */
const TIMEOUT_MS = 10_000;

/**
 * `Name <address>`, when a display name is configured.
 *
 * Resend accepts both `store@example.com` and `Luxury Watch <store@example.com>`.
 * The name is quoted so a comma or angle bracket in it cannot be read as a second
 * recipient — that would be a header-injection shape, and it costs one line to
 * remove the possibility.
 */
function displayFrom(name: string | null | undefined, address: string): string {
  if (!name) return address;
  return `"${name.replace(/["\\\r\n]/g, '')}" <${address}>`;
}

/**
 * Resolve the sending identity, falling back to the environment if the settings
 * read fails for any reason.
 *
 * The identity is presentation: a database problem must cost a custom display
 * name, never the message. `resolveMailIdentity` already swallows its own errors;
 * this is the belt to that braces, because a message that is not sent because a
 * cosmetic lookup threw would be the worst of both outcomes.
 */
async function mailIdentity(): Promise<MailIdentity> {
  try {
    return await resolveMailIdentity();
  } catch {
    const env = getServerEnv();
    return {
      fromAddress: env.resendFromEmail ?? null,
      fromName: env.resendFromName ?? null,
      replyTo: env.resendReplyToEmail ?? null,
    };
  }
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (!isEmailConfigured()) {
    // Logged with the recipient and subject so an operator running without a key
    // can still see what would have been sent. The body is not logged: it can
    // contain a customer's address and phone number, and a log is not a mailbox.
    logger.info('email.skipped', {
      reason: 'not-configured',
      to: message.to,
      subject: message.subject,
    });
    return { status: 'skipped', reason: 'not-configured' };
  }

  const env = getServerEnv();
  const identity = await mailIdentity();

  if (!identity.fromAddress) {
    // Unreachable while `isEmailConfigured` requires both, but narrowing here
    // keeps the type honest without a non-null assertion.
    return { status: 'skipped', reason: 'not-configured' };
  }

  // A reply must reach a mailbox a person reads. The message may name its own
  // destination (a customer replying to a store message goes to the store), and
  // failing that the configured reply-to, and failing that there is none.
  const replyTo = message.replyTo ?? identity.replyTo ?? null;

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: displayFrom(identity.fromName, identity.fromAddress),
        to: [message.to],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // The provider's message is read but not echoed to the customer. It can
      // name the recipient, and a customer-facing error must not.
      const body = (await response.json().catch(() => ({}))) as ResendResponse;
      const reason = `http ${response.status}${body.message ? `: ${body.message}` : ''}`;
      logger.warn('email.send_failed', {
        to: message.to,
        subject: message.subject,
        reason,
      });
      return { status: 'failed', reason };
    }

    const body = (await response.json().catch(() => ({}))) as ResendResponse;
    logger.info('email.sent', {
      to: message.to,
      subject: message.subject,
      id: body.id ?? null,
    });
    return { status: 'sent', id: body.id ?? null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    logger.warn('email.send_failed', {
      to: message.to,
      subject: message.subject,
      reason,
    });
    return { status: 'failed', reason };
  }
}

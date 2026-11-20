import 'server-only';

import { getServerEnv, hasServiceRoleKey } from '@/lib/env.server';
import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * The identity a message is sent under.
 *
 * -----------------------------------------------------------------------------
 * TWO SOURCES, AND WHY EACH VALUE COMES FROM THE ONE IT DOES
 * -----------------------------------------------------------------------------
 *
 * The sending address is an environment variable and nothing else. It has to
 * match a domain verified with Resend, and a value an administrator can type
 * cannot verify a domain — but more importantly, an editable `from` is a phishing
 * primitive: whoever could write it could send mail to customers from a domain
 * the store does not own, riding the store's reputation. It is not a setting.
 *
 * The display name and the reply-to address *are* settings. They are presentation
 * — what the business calls itself and which inbox a reply should reach — and
 * they change when the business changes, which should not need a deployment.
 *
 * -----------------------------------------------------------------------------
 * THE ADMIN SETTING WINS, THE ENVIRONMENT IS THE FLOOR
 * -----------------------------------------------------------------------------
 *
 * An administrator who sets a display name has deliberately overridden the
 * deployment default and must see that take effect immediately. If the row is
 * empty, unreadable, or the database is unreachable, the environment value is
 * used. That direction matters: a database outage must degrade the *presentation*
 * of an email, never stop the email or leave it with no reply-to at all.
 *
 * -----------------------------------------------------------------------------
 * WHY A SHORT CACHE
 * -----------------------------------------------------------------------------
 *
 * A single order submission sends two messages. Without a cache that is two
 * reads of a one-row table for the same answer. Sixty seconds is long enough to
 * collapse a burst and short enough that an administrator who saves a change sees
 * it on the next message they send, without a deploy or a restart.
 */

export type MailIdentity = {
  /** The address messages are sent from. Environment only. */
  fromAddress: string | null;
  /** A display name beside the address, or null to send the bare address. */
  fromName: string | null;
  /** Where a reply should go, or null to send no reply-to header at all. */
  replyTo: string | null;
};

const CACHE_MS = 60_000;

let cached: { value: MailIdentity; at: number } | undefined;

/** Reset the memoised identity. Tests only. */
export function resetMailIdentityCache(): void {
  cached = undefined;
}

function fromEnvironment(): MailIdentity {
  const env = getServerEnv();
  return {
    fromAddress: env.resendFromEmail ?? null,
    fromName: env.resendFromName ?? null,
    replyTo: env.resendReplyToEmail ?? null,
  };
}

/**
 * Resolve the identity for a message.
 *
 * Never throws and never returns null fields for the sending address when the
 * environment has one. A database failure is logged once per resolution and the
 * environment value is used, because an unreachable database is a reason to lose
 * a custom display name, not a reason to fail to send.
 */
export async function resolveMailIdentity(): Promise<MailIdentity> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.value;

  const base = fromEnvironment();
  let value = base;

  if (hasServiceRoleKey()) {
    try {
      const supabase = createSupabaseAdminClient();
      const { data, error } = await supabase
        .from('email_settings')
        .select('from_name, reply_to')
        .maybeSingle();

      if (error) {
        logger.warn('email.identity_read_failed', { code: error.code });
      } else if (data) {
        value = {
          fromAddress: base.fromAddress,
          fromName: data.from_name?.trim() || base.fromName,
          replyTo: data.reply_to?.trim() || base.replyTo,
        };
      }
    } catch (error) {
      logger.warn('email.identity_read_failed', {
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }
  }

  cached = { value, at: now };
  return value;
}

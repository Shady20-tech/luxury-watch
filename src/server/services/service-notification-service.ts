import 'server-only';

import { sendEmail } from '@/lib/email/transport';
import {
  newServiceRequestEmail,
  serviceRequestReceivedEmail,
  SERVICE_LABELS,
  type ServiceEmailData,
} from '@/lib/email/service';
import { getServerEnv } from '@/lib/env.server';
import { logger } from '@/lib/logger';

/**
 * Notification for a submitted service request.
 *
 * -----------------------------------------------------------------------------
 * CALLED AFTER THE COMMIT, AND NEVER ABLE TO UNDO IT
 * -----------------------------------------------------------------------------
 *
 * The request is already committed when this runs: the reference exists and the
 * customer has been shown their confirmation. Email is a notification about that
 * fact, so nothing here throws — a failure is logged and swallowed, because
 * turning a recorded request into an error page would be worse than a missing
 * courtesy email.
 *
 * -----------------------------------------------------------------------------
 * WHY THE DATA COMES FROM THE COMMITTED VALUES, NOT THE FORM
 * -----------------------------------------------------------------------------
 *
 * The caller passes the values the submission function accepted and the reference
 * it returned. Nothing here reads the browser payload, so a message cannot quote
 * a detail the database did not record.
 *
 * The customer's own words are included because staff need them to answer. They
 * are the only free text that reaches a template, and `escapeHtml` is applied
 * inside the template before any of it becomes markup.
 */

export async function notifyServiceRequestSubmitted(data: ServiceEmailData): Promise<void> {
  const env = getServerEnv();

  try {
    await sendEmail(serviceRequestReceivedEmail(data));

    if (env.resendAdminEmail) {
      await sendEmail(newServiceRequestEmail(data, env.resendAdminEmail));
    } else {
      // Not a failure. A store that has not set an admin address still wants the
      // customer notified, and the log says why the internal copy was skipped.
      logger.info('email.admin_skipped', { reason: 'no-admin-address' });
    }
  } catch (error) {
    // The reference only. The customer's name, email and message are not logged:
    // a log line is a copy of personal data in a system they did not agree to.
    logger.warn('email.service_notification_failed', {
      kind: data.kind,
      reference: data.reference,
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

export { SERVICE_LABELS };

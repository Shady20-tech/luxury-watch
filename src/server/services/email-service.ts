import 'server-only';

import { absoluteUrl } from '@/lib/env';
import { getServerEnv } from '@/lib/env.server';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email/transport';
import { newOrderRequestEmail, orderRequestReceivedEmail } from '@/lib/email/orders';
import type { OrderEmailData } from '@/lib/email/orders';
import { fetchOrderRequestItems } from '@/server/repositories/order-repository';
import { fetchCheckoutConfiguration } from '@/server/repositories/checkout-repository';
import type { OrderRequestResult } from '@/server/repositories/order-repository';

/**
 * The order-request notification service.
 *
 * -----------------------------------------------------------------------------
 * CALLED AFTER THE COMMIT, AND NEVER ABLE TO UNDO IT
 * -----------------------------------------------------------------------------
 *
 * The request is already committed when this runs: the reference exists, the
 * stock is held and the customer has been shown their confirmation. Email is a
 * notification about that fact. So nothing here throws — a failure is logged and
 * swallowed, because turning a placed order into an error page would be worse
 * than a missing courtesy email.
 *
 * -----------------------------------------------------------------------------
 * WHY THE DATA COMES FROM THE ROW, NOT THE FORM
 * -----------------------------------------------------------------------------
 *
 * Every figure quoted in the email is read back from the committed row. The
 * item list is read from `order_request_items`, not from the browser payload, so
 * a message cannot quote a title or a price the database did not record. The
 * only customer-supplied strings that reach a template are the ones the database
 * stored and returned.
 *
 * -----------------------------------------------------------------------------
 * ONE SUBMISSION, TWO MESSAGES
 * -----------------------------------------------------------------------------
 *
 * The customer is told their request was received; the business is told it needs
 * review. They are sent independently — a bouncing admin mailbox must not stop
 * the customer's confirmation — which is why each send is awaited separately
 * rather than as one batch.
 *
 * The guest's access token is included in the customer's message and in no
 * other. It is a capability, not an identifier, so it must not reach the admin
 * copy where it would sit in a second mailbox for no benefit.
 */

export async function notifyOrderRequestSubmitted(result: OrderRequestResult): Promise<void> {
  const env = getServerEnv();

  try {
    const [items, configuration] = await Promise.all([
      fetchOrderRequestItems(
        result.id,
        result.isGuest && result.accessToken
          ? { reference: result.reference, token: result.accessToken }
          : null,
      ),
      // The label for the chosen settlement method, so the email says "Bank
      // transfer" rather than the raw code `bank_transfer`. A failure here is
      // not fatal: the code is used as a fallback.
      fetchCheckoutConfiguration().catch(() => null),
    ]);

    const methodLabel =
      configuration?.paymentMethods.find(
        (method) => method.code === result.summary.paymentMethodCode,
      )?.label ?? null;

    const data: OrderEmailData = {
      reference: result.reference,
      customerName: result.summary.customerName,
      customerEmail: result.summary.customerEmail,
      customerPhone: result.summary.customerPhone,
      fulfilmentType: result.summary.fulfilmentType,
      pickupLocation: result.summary.pickupLocation,
      // Read back from the committed row, so the address an administrator sees
      // in the email is the one the database stored.
      deliveryAddress: result.summary.deliveryAddress,
      paymentMethodCode: result.summary.paymentMethodCode,
      paymentMethodLabel: methodLabel,
      customerNote: result.summary.customerNote,
      subtotalCents: result.summary.subtotalCents,
      deliveryFeeCents: result.summary.deliveryFeeCents,
      discountCents: result.summary.discountCents,
      discountCode: result.summary.discountCode,
      totalCents: result.summary.totalCents,
      currency: result.summary.currency,
      items,
      // The guest's confirmation link, and the only place the access token can
      // still be handed over: it is shown once and only its hash is stored, so
      // this email is the customer's last chance to keep it (G51). A signed-in
      // customer has no token and reads the request from their account instead.
      orderUrl:
        result.isGuest && result.accessToken
          ? absoluteUrl(
              `/order/${encodeURIComponent(result.reference)}?token=${encodeURIComponent(result.accessToken)}`,
            )
          : null,
    };

    await sendEmail(orderRequestReceivedEmail(data));

    if (env.resendAdminEmail) {
      await sendEmail(newOrderRequestEmail(data, env.resendAdminEmail));
    } else {
      // Not a failure. A store that has not set an admin address still wants the
      // customer notified, and the log says why the internal copy was skipped.
      logger.info('email.admin_skipped', { reason: 'no-admin-address' });
    }
  } catch (error) {
    logger.warn('email.order_notification_failed', {
      reference: result.reference,
      message: error instanceof Error ? error.message : 'unknown error',
    });
  }
}
